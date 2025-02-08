import { PrismaClient, User } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12; // Increased from 10 for better security
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN || crypto.randomBytes(64).toString('hex');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export function generateAccessToken(user: User) {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role
  };
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(user: User) {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role
  };
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
}

export async function registerUser(email: string, password: string, name?: string) {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("User already exists");

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const newUser = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
    },
  });

  return newUser;
}

export async function validateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid email or password");

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingTime = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60);
    throw new Error(`Account is locked. Try again in ${remainingTime} minutes`);
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    // Increment failed login attempts
    const failedAttempts = user.failedLoginAttempts + 1;
    const updates: any = { failedLoginAttempts: failedAttempts };
    
    if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updates
    });

    throw new Error("Invalid email or password");
  }

  // Reset failed attempts and update last login on successful login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date()
    }
  });

  return user;
}

export async function saveRefreshToken(userId: string, refreshToken: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { 
      refreshToken,
      updatedAt: new Date()
    },
  });
}

export async function getUserByRefreshToken(refreshToken: string) {
  return prisma.user.findFirst({ 
    where: { 
      refreshToken,
      // Ensure refresh token hasn't expired (7 days)
      updatedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    } 
  });
}

export async function removeRefreshToken(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { 
      refreshToken: null,
      updatedAt: new Date()
    },
  });
}

export async function generatePasswordResetToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    }
  });

  return resetToken;
}

export async function resetPassword(token: string, newPassword: string) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        gt: new Date()
      }
    }
  });

  if (!user) throw new Error("Invalid or expired reset token");

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpires: null,
      updatedAt: new Date()
    }
  });

  return user;
}