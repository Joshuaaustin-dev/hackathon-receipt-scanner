import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";

dotenv.config();

//Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3001;

//MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increase the limit to handle larger JSON payloads

//Fixed demo user for the hackathon
const DEMO_USER_ID = process.env.DEMO_USER_ID;

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
        profile: {
          name: "",
          allergies: [],
          dietaryPreferences: [],
        },
      });
    }

    res.json({ profile: doc.data() });
  } catch (error) {
    console.error("Error getting profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST (save) user profile
app.post("/api/profile", async (req, res) => {
  try {
    const { name, allergies, dietaryPreferences } = req.body;

    const profileData = {
      userId: DEMO_USER_ID,
      name: name || "",
      allergies: allergies || [],
      dietaryPreferences: dietaryPreferences || [],
      updatedAt: new Date().toISOString(),
    };

    // Save to Firestore
    await db
      .collection("users")
      .doc(DEMO_USER_ID)
      .set(profileData, { merge: true });

    res.json({
      success: true,
      message: "Profile saved successfully!",
      profile: profileData,
    });
  } catch (error) {
    console.error("Error saving profile:", error);
    res.status(500).json({ error: error.message });
  }
});

//Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
