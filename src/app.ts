import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

// Routers
import chatRouter from "./routers/chat.router";
import uploadRouter from "./routers/upload.router";
import authRouter from "./routers/auth.router";
import transcribeRouter from "./routers/transcribe.router";
import anonymousChatRouter from "./routers/anonChat.router";
import subscriptionRouter from "./routers/subscription.router";

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Trust proxy if behind a reverse proxy
app.set("trust proxy", 1);

// Session configuration with better security
app.use(
  session({
    secret: process.env.SESSION_SECRET || "CHANGE_ME",
    name: "sessionId", // Custom cookie name
    resave: false,
    saveUninitialized: false, // Don't create session until something stored
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS in production
      httpOnly: true, // Prevent XSS
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: "lax", // CSRF protection
    },
  })
);

// Security middleware
app.use(helmet()); // Adds various HTTP headers for security
app.use(compression()); // Compress responses

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// CORS configuration
app.use(cors({
  origin: '*', // allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept'
  ],
  credentials: false, // or remove
  maxAge: 86400,
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));
// Request parsing middleware
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' 
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Static files with caching
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads"), {
  maxAge: '1d', // Cache for 1 day
  etag: true,
}));

// API Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/upload", uploadRouter);
app.use("/api/v1/transcribe", transcribeRouter);
app.use("/api/v1/anon", anonymousChatRouter);
app.use("/api/v1/subscription", subscriptionRouter);

// Health check endpoint with basic system info
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  // Close server, DB connections, etc.
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Environment] ${process.env.NODE_ENV}`);
});

// For testing
export default app;