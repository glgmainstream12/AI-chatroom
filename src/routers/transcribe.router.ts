// server/routes/transcribe.router.ts
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../prisma/client";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const router = Router();

// Configure multer to store uploaded audio in 'uploads/' folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const uniqueName = `${Date.now()}-${baseName}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// POST /transcribe/:conversationId
// Field name = "file"
router.post(
  "/:conversationId",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded." });
        return;
      }

      // Path of the uploaded file
      const filePath = req.file.path;
      const fileStream = fs.createReadStream(filePath);

      // Call OpenAI’s Whisper
      const response = await openai.audio.transcriptions.create({
        file: fileStream,
        model: "whisper-1",
        // You can add optional parameters like:
        // prompt: "Optional prompt",
        // temperature: 0,
        // response_format: "json",
        // language: "en",
      });

      // `response` should contain { text: "transcribed text" }
      const transcribedText = response.text;
      if (!transcribedText) {
        throw new Error("No transcription text returned from OpenAI.");
      }

      // Save to DB
      const message = await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: transcribedText,
        },
      });

      // Optionally remove the temp file
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error deleting audio file:", err);
      });

      res.json({ message });
    } catch (error) {
      console.error("[transcribe.router] Error transcribing audio:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;