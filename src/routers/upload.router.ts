// server/routes/upload.router.ts
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import prisma from "../prisma/client";

const router = Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const uniqueName = `${Date.now()}-${baseName}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Explicitly annotate the handler's types
router.post(
  "/:conversationId",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { conversationId } = req.params;

      if (!req.file) {
        res.status(400).json({ error: "No file was uploaded." });
        return; // <-- end the function after calling res
      }

      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

      const message = await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: "",
          fileUrl,
        },
      });

      res.json({ message });
      return; // <-- end the function
    } catch (error) {
      console.error("[upload.router] Error uploading file:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
);

export default router;