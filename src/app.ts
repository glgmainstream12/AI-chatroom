import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import chatRouter from "./routers/chat.router";
import uploadRouter from "./routers/upload.router";
import authRouter from "./routers/auth.router";
import transcribeRouter from "./routers/transcribe.router";
import anonymousChatRouter from "./routers/anonChat.router";
import subscriptionRouter from "./routers/subscription.router";

dotenv.config();
const app = express();

app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "CHANGE_ME",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // or true if you're behind HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 1 day, adjust as needed
    },
  })
);

// Improved CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept'
  ],
  credentials: true,
  maxAge: 86400 // CORS preflight cache for 24 hours
}));

// Increase JSON payload limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static files from the 'uploads' folder
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// API Routes
app.use("/auth", authRouter); // Enable auth routes
app.use("/chat", chatRouter);
app.use("/upload", uploadRouter);
app.use("/transcribe", transcribeRouter);
app.use("/anon", anonymousChatRouter);
app.use("/subscription", subscriptionRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});

export default app;