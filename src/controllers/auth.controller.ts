import { Request, Response } from "express";
import {
  generateAccessToken,
  generateRefreshToken,
  registerUser,
  validateUser,
  saveRefreshToken,
  getUserByRefreshToken,
  removeRefreshToken,
  generatePasswordResetToken,
  resetPassword
} from "../services/auth.service";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { sendForgotPasswordEmail } from "../services/email.service";

// Rate limiting for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: "Too many requests from this IP, please try again later" }
});

export async function signUp(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body;
    
    // Input validation
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const newUser = await registerUser(email, password, name);
    
    // Generate initial tokens
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    await saveRefreshToken(newUser.id, refreshToken);

    res.status(201).json({ 
      message: "User created successfully",
      accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const user = await validateUser(email, password);
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        planType: user.planType
      }
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(401).json({ error: "No refresh token provided" });
      return;
    }

    const user = await getUserByRefreshToken(refreshToken);
    if (!user) {
      res.status(403).json({ error: "Invalid refresh token" });
      return;
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    
    // Rotate refresh token for security
    await saveRefreshToken(user.id, newRefreshToken);

    res.json({ 
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired refresh token" });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "No refresh token provided" });
      return;
    }

    const user = await getUserByRefreshToken(refreshToken);
    if (user) {
      await removeRefreshToken(user.id);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email required" });
      return;
    }

    // 1. Generate the token
    const resetToken = await generatePasswordResetToken(email);

    // 2. Construct your password-reset URL for the frontend
    //    e.g., "https://frontend-domain/reset?token=..."
    //    Or you could pass the token in the URL path, i.e. /reset/...
    const resetLink = `https://YOUR_FRONTEND_DOMAIN/reset?token=${resetToken}`;

    // 3. Send Email via AWS SES
    await sendForgotPasswordEmail(email, resetLink);

    // 4. Return a success response
    res.json({
      message: "Password reset email sent. Please check your inbox.",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: "Token and new password required" });
      return;
    }

    await resetPassword(token, newPassword);
    res.json({ message: "Password reset successful" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
