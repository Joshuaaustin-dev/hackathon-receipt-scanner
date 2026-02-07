import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Tesseract from "tesseract.js";
import multer from "multer";

dotenv.config();

//Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

//Gemini AI client setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

//Fixed demo user for the hackathon
const DEMO_USER_ID = process.env.DEMO_USER_ID;

/*** API ROUTES ***/

//Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});

// GET user profile
app.get("/api/profile", async (req, res) => {
  try {
    const docRef = db.collection("users").doc(DEMO_USER_ID);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({
        profile: {
          name: "",
          bio: "",
          preferences: {
            allergies: [],
            dietaryRestrictions: [],
          },
          pantry: [],
        },
      });
    }

    res.json({ profile: doc.data() });
  } catch (error) {
    console.error("Error getting profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST process receipt with OCR and AI parsing
app.post("/api/process-receipt", upload.single("receipt"), async (req, res) => {
  try {
    console.log("=== PROCESS RECEIPT REQUEST ===");

    if (!req.file) {
      return res.status(400).json({ error: "No receipt image provided" });
    }

    console.log("Processing receipt image with OCR...");

    // Step 1: Perform OCR using Tesseract.js
    const {
      data: { text },
    } = await Tesseract.recognize(req.file.buffer, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    console.log("OCR completed. Extracted text:");
    //console.log(text);

    // Step 2: Use Gemini AI to parse ingredients from OCR text
    const ingredients = await parseIngredientsWithAI(text);

    // Step 3: Save to user's pantry in Firebase
    const userRef = db.collection("users").doc(DEMO_USER_ID);
    const doc = await userRef.get();

    let currentPantry = [];
    if (doc.exists) {
      const data = doc.data();
      currentPantry = data.pantry || [];
    }

    // Merge new ingredients with existing pantry (avoid duplicates)
    const pantryMap = new Map();

    // Add existing items
    currentPantry.forEach((item) => {
      pantryMap.set(item.name.toLowerCase(), item);
    });

    // Add/update new items
    ingredients.forEach((item) => {
      const key = item.name.toLowerCase();
      if (pantryMap.has(key)) {
        // Update quantity if both have quantities
        const existing = pantryMap.get(key);
        if (item.quantity && existing.quantity) {
          existing.quantity = `${existing.quantity}, ${item.quantity}`;
        } else if (item.quantity) {
          existing.quantity = item.quantity;
        }
      } else {
        pantryMap.set(key, item);
      }
    });

    const updatedPantry = Array.from(pantryMap.values());

    // Save to Firebase
    await userRef.set(
      {
        pantry: updatedPantry,
        lastReceiptUpload: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.json({
      success: true,
      rawText: text,
      ingredients: ingredients,
      pantry: updatedPantry,
    });
  } catch (error) {
    console.error("Error processing receipt:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to parse ingredients using Gemini AI
async function parseIngredientsWithAI(ocrText) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
    });

    const prompt = `You are analyzing a grocery receipt. Extract ONLY food ingredients from the following OCR text.

RULES:
1. Extract only actual food items and cooking ingredients
2. Ignore non-food items (cleaning supplies, toiletries, etc.)
3. Ignore store information, totals, taxes, payment info
4. For each item, extract the name and quantity (if available)
5. Clean up item names (remove codes, asterisks, special characters)
6. Standardize quantities (e.g., "2.5 lb", "1 gal", "12 oz")

Return ONLY a JSON array in this exact format:
[
  {
    "name": "Ground Beef",
    "quantity": "2.5 lb"
  },
  {
    "name": "Rice",
    "quantity": "5 lb"
  }
]

OCR TEXT:
${ocrText}

Return ONLY the JSON array, no markdown, no explanation.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const ingredients = JSON.parse(cleanedText);

    return ingredients;
  } catch (error) {
    console.error("Error parsing with AI:", error);
    // Fallback to basic parsing
    return parseIngredientsBasic(ocrText);
  }
}

// Fallback basic parsing function
function parseIngredientsBasic(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  const ingredients = [];

  const foodKeywords = [
    "beef",
    "chicken",
    "pork",
    "fish",
    "salmon",
    "tuna",
    "rice",
    "pasta",
    "bread",
    "flour",
    "sugar",
    "salt",
    "milk",
    "cheese",
    "butter",
    "eggs",
    "cream",
    "tomato",
    "potato",
    "onion",
    "garlic",
    "pepper",
    "carrot",
  ];

  lines.forEach((line) => {
    if (
      line.match(/total/i) ||
      line.match(/tax/i) ||
      line.match(/subtotal/i) ||
      line.length < 3
    ) {
      return;
    }

    const quantityMatch = line.match(/(\d+\.?\d*)\s*(lb|lbs|oz|kg|g|ct)?/i);
    let name = line;
    let quantity = "";

    if (quantityMatch) {
      quantity = quantityMatch[0];
      name = line.replace(quantityMatch[0], "").trim();
    }

    name = name.replace(/\$?\d+\.\d{2}/, "").trim();

    if (name.length > 2) {
      const lowerName = name.toLowerCase();
      if (foodKeywords.some((keyword) => lowerName.includes(keyword))) {
        ingredients.push({ name, quantity });
      }
    }
  });

  return ingredients.slice(0, 20);
}

// GET pantry items
app.get("/api/pantry", async (req, res) => {
  try {
    const docRef = db.collection("users").doc(DEMO_USER_ID);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({ success: true, pantry: [] });
    }

    const pantry = doc.data().pantry || [];
    res.json({ success: true, pantry });
  } catch (error) {
    console.error("Error getting pantry:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE pantry item
app.delete("/api/pantry/:itemName", async (req, res) => {
  try {
    const itemName = decodeURIComponent(req.params.itemName);
    const userRef = db.collection("users").doc(DEMO_USER_ID);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const pantry = doc.data().pantry || [];
    const updatedPantry = pantry.filter(
      (item) => item.name.toLowerCase() !== itemName.toLowerCase(),
    );

    await userRef.update({ pantry: updatedPantry });

    res.json({ success: true, pantry: updatedPantry });
  } catch (error) {
    console.error("Error deleting pantry item:", error);
    res.status(500).json({ error: error.message });
  }
});

// CLEAR entire pantry
app.delete("/api/pantry", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(DEMO_USER_ID);
    await userRef.update({ pantry: [] });

    res.json({ success: true, pantry: [] });
  } catch (error) {
    console.error("Error clearing pantry:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/generate-recipes", async (req, res) => {
  try {
    const { ingredients } = req.body;

    //User profile
    const docRef = db.collection("users").doc(DEMO_USER_ID);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res
        .status(404)
        .json({ error: "User profile not found. Please setup your profile." });
    }

    const profile = doc.data();
    const { name, bio, preferences } = profile;

    //extract allergens and dietary preferences for prompt
    const allergies = preferences?.allergies || [];
    const dietaryPreferences = preferences?.dietaryRestrictions || [];

    // AI Prompt
    const prompt = buildRecipePrompt(
      ingredients || [],
      allergies,
      dietaryPreferences,
      name,
    );

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
    });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let recipes;

    try {
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      recipes = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", text);
      return res.status(500).json({
        error: "AI returned invalid format",
        rawResponse: text,
      });
    }

    const validatedRecipes = validateRecipesAgainstAllergies(
      recipes,
      preferences.allergies || [],
    );

    res.json({
      success: true,
      recipes: validatedRecipes,
      userProfile: {
        name,
        bio,
        preferences,
      },
    });
  } catch (error) {
    console.error("Error processing profile POST:", error);
    res.status(500).json({ error: error.message });
  }
});

function buildRecipePrompt(
  ingredients,
  allergies,
  dietaryPreferences,
  userName,
) {
  const hasIngredients = ingredients && ingredients.length > 0;

  let prompt = `You are a professional chef AI assistant helping ${userName || "a user"} find recipes.

USER PROFILE:
`;

  if (allergies && allergies.length > 0) {
    prompt += `- CRITICAL ALLERGIES (MUST AVOID): ${allergies.join(", ")}\n`;
  }

  if (dietaryPreferences && dietaryPreferences.length > 0) {
    prompt += `- Dietary Preferences: ${dietaryPreferences.join(", ")}\n`;
  }

  if (hasIngredients) {
    prompt += `\nAVAILABLE PANTRY INGREDIENTS:\n${ingredients.map((item) => `- ${item.name}${item.quantity ? ` (${item.quantity})` : ""}`).join("\n")}\n`;
    prompt += `\nGenerate 3 recipes that USE AS MANY of these pantry ingredients as possible.\n`;
    prompt += `\nIMPORTANT: You can assume the user has common spices, oils, and basic seasonings (salt, pepper, olive oil, etc.) even if not listed.\n`;
    prompt += `Focus on using the main ingredients from the pantry. Only suggest additional fresh ingredients if absolutely necessary.\n`;
  } else {
    prompt += `\nGenerate 3 popular, easy-to-make recipes.\n`;
  }

  prompt += `
CRITICAL SAFETY RULES:
1. NEVER include any of these allergens: ${allergies && allergies.length > 0 ? allergies.join(", ") : "none specified"}
2. Respect all dietary preferences: ${dietaryPreferences && dietaryPreferences.length > 0 ? dietaryPreferences.join(", ") : "none specified"}
3. If an ingredient substitution is needed due to allergies, clearly note it

REQUIREMENTS:
- Provide clear, step-by-step instructions
- Include prep time and cook time
- Rate difficulty as: easy, medium, or hard
- ${hasIngredients ? "Maximize use of pantry ingredients" : "Keep ingredients commonly available"}
- Mark which ingredients are from the pantry vs. additional ingredients needed

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "recipes": [
    {
      "name": "Recipe Name",
      "description": "Brief description",
      "prepTime": "15 minutes",
      "cookTime": "30 minutes",
      "difficulty": "easy",
      "servings": 4,
      "ingredients": [
        "2 cups flour (from pantry)",
        "1 egg (additional)"
      ],
      "instructions": [
        "Step 1: Do this",
        "Step 2: Do that"
      ],
      "allergenWarning": "None",
      "dietaryTags": ["Vegetarian", "Gluten-Free"]
    }
  ]
}`;

  return prompt;
}

function validateRecipesAgainstAllergies(recipesData, allergies) {
  if (!allergies || allergies.length === 0) {
    return recipesData.recipes || recipesData;
  }

  const recipes = recipesData.recipes || recipesData;

  const validatedRecipes = recipes.map((recipe) => {
    const ingredientText = recipe.ingredients.join(" ").toLowerCase();
    const foundAllergens = [];

    allergies.forEach((allergen) => {
      const allergenLower = allergen.toLowerCase();
      if (ingredientText.includes(allergenLower)) {
        foundAllergens.push(allergen);
      }
    });

    if (foundAllergens.length > 0) {
      recipe.allergenWarning = `⚠️ WARNING: May contain ${foundAllergens.join(", ")}`;
      recipe.isSafe = false;
    } else {
      recipe.isSafe = true;
    }

    return recipe;
  });

  return validatedRecipes;
}

//Recipes storage logic
app.post("/api/recipes/save", async (req, res) => {
  try {
    const { recipe } = req.body;

    if (!recipe || !recipe.name) {
      return res.status(400).json({ error: "Recipe data is required" });
    }

    const recipeId =
      recipe.name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now();

    const recipeRef = db
      .collection("users")
      .doc(DEMO_USER_ID)
      .collection("Recipes")
      .doc(recipeId);

    await recipeRef.set({
      ...recipe,
      recipeId,
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      message: "Recipe saved successfully",
      recipeId,
    });
  } catch (error) {
    console.error("Error saving recipe:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/recipes/saved", async (req, res) => {
  try {
    const recipesRef = db
      .collection("users")
      .doc(DEMO_USER_ID)
      .collection("Recipes");

    const snapshot = await recipesRef.orderBy("savedAt", "desc").get();
    const recipes = snapshot.docs.map((doc) => doc.data());

    res.json({
      success: true,
      recipes,
    });
  } catch (error) {
    console.error("Error getting saved recipes:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/recipes/save/:recipeId", async (req, res) => {
  try {
    const { recipeId } = req.params;

    await db
      .collection("users")
      .doc(DEMO_USER_ID)
      .collection("Recipes")
      .doc(recipeId)
      .delete();

    res.json({
      success: true,
      message: "Recipe deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting recipe:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Serve HTML pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "profile.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "profile.html"));
});

app.get("/recipes", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "recipes.html"));
});

//Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
