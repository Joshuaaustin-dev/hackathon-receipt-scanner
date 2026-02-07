import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
          bio: "",
          preferences: [],
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

// Prettified HTML view of the profile
app.get("/profile", (req, res) => {
  // Send the static `profile.html` file from the frontend folder. The client
  // will fetch `/api/profile` to populate the page.
  res.sendFile(path.join(__dirname, "..", "frontend", "profile.html"));
});

//Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
