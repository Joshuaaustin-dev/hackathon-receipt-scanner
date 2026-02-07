import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

// Serve the frontend folder so CSS and other assets are available
app.use(express.static(path.join(__dirname, "..", "frontend")));

//MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increase the limit to handle larger JSON payloads

//Fixed demo user for the hackathon
const DEMO_USER_ID = process.env.DEMO_USER_ID;

/*** ROUTES ***/
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
      // Return empty profile if doesn't exist
      return res.json({
        users: {
          name: "",
          bio: "",
          preferences: {
            allergies: [],
            dietaryRestrictions: [],
          },
        },
      });
    }

    res.json({ profile: doc.data() });
  } catch (error) {
    console.error("Error getting profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Prettified HTML view of the profile
app.get("/profile", (req, res) => {
  // Send the static `profile.html` file from the frontend folder. The client
  // will fetch `/api/profile` to populate the page.
  res.sendFile(path.join(__dirname, "..", "frontend", "profile.html"));
});

app.post("/api/generate-recipes", async (req, res) => {
  try {
    //pantry ingredients TODO
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

    console.log("sending prompt to Gemini AI:", prompt);
    // Call Gemini AI
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
    });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response from AI
    let recipes;

    try {
      // Remove markdown code blocks if present
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

    // Validate Recipes don't contain allergens
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

// Helper function to build the AI prompt
// Helper function to build the AI prompt (FIXED: parameter order)
function buildRecipePrompt(
  ingredients,
  allergies,
  dietaryPreferences,
  userName,
) {
  //                                     ^^^^^^^^^ Changed from "bio" to "allergies"
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
    prompt += `\nAVAILABLE INGREDIENTS:\n${ingredients.map((item) => `- ${item.name} (${item.quantity || ""})`).join("\n")}\n`;
    prompt += `\nGenerate 3 recipes that USE AS MANY of these ingredients as possible.\n`;
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
- ${hasIngredients ? "Maximize use of available ingredients" : "Keep ingredients commonly available"}

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
        "2 cups flour",
        "1 egg"
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

// Helper function to validate recipes against allergies (SAFETY LAYER)
function validateRecipesAgainstAllergies(recipesData, allergies) {
  if (!allergies || allergies.length === 0) {
    return recipesData.recipes || recipesData;
  }

  const recipes = recipesData.recipes || recipesData;

  // Check each recipe's ingredients for allergens
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
      .collection("Recipes") // ✅ CONSISTENT
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
      .collection("Recipes"); // ✅ FIXED

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
      .collection("Recipes") // ✅ FIXED
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

// Serve recipes page
app.get("/recipes", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "recipes.html"));
});

//Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
