import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

//MIDDLEWARE
app.use(cors());

//test route
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});

//Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
