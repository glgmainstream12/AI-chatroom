import request from "supertest";
import express from "express";
import authRouter from "../routers/auth.router"; // Correct import path
import * as authService from "../services/auth.service";
import { requireAuth } from "../middlewares/auth.middleware"; // Mock protected route middleware

// Mock Express app
const app = express();
app.use(express.json());
app.use("/auth", authRouter);

// Mock auth middleware for protected routes
jest.mock("../middlewares/auth.middleware", () => ({
  requireAuth: (req: any, res: any, next: any) => next(),
}));

// Mock auth service functions
jest.mock("../services/auth.service");

describe("Auth Routes", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /auth/sign-up", () => {
    it("should create a new user and return tokens", async () => {
      (authService.registerUser as jest.Mock).mockResolvedValue({
        email: "test@yopmail.com",
        password: "password123",
        name: "Test User",
      });

      const response = await request(app).post("/auth/sign-up").send({
        email: "test@yopmail.com",
        password: "password123",
        name: "Test User",
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
    });

    it("should return 400 if email or password is missing", async () => {
      const response = await request(app).post("/auth/sign-up").send({ email: "test@yopmail.com" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Email and password required" });
    });
  });

  describe("POST /auth/login", () => {
    it("should log in a user and return tokens", async () => {
      (authService.validateUser as jest.Mock).mockResolvedValue({
        id: 1,
        email: "test@yopmail.com",
        name: "Test User",
        role: "user",
      });

      const response = await request(app).post("/auth/login").send({
        email: "test@yopmail.com",
        password: "password123",
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
    });

    it("should return 401 if credentials are invalid", async () => {
      (authService.validateUser as jest.Mock).mockRejectedValue(new Error("Invalid credentials"));

      const response = await request(app).post("/auth/login").send({
        email: "wrong@yopmail.com",
        password: "wrongpassword",
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Invalid credentials" });
    });
  });

  describe("POST /auth/refresh-token", () => {
    it("should return new access and refresh tokens", async () => {
      (authService.getUserByRefreshToken as jest.Mock).mockResolvedValue({
        id: 1,
        email: "test@yopmail.com",
      });

      (authService.generateAccessToken as jest.Mock).mockReturnValue("newAccessToken");
      (authService.generateRefreshToken as jest.Mock).mockReturnValue("newRefreshToken");

      const response = await request(app).post("/auth/refresh-token").send({
        refreshToken: "validRefreshToken",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: "newAccessToken",
        refreshToken: "newRefreshToken",
      });
    });

    it("should return 403 if refresh token is invalid", async () => {
      (authService.getUserByRefreshToken as jest.Mock).mockResolvedValue(null);

      const response = await request(app).post("/auth/refresh-token").send({
        refreshToken: "invalidToken",
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Invalid refresh token" });
    });
  });

  describe("POST /auth/logout", () => {
    it("should log out the user", async () => {
      (authService.getUserByRefreshToken as jest.Mock).mockResolvedValue({ id: 1 });
      (authService.removeRefreshToken as jest.Mock).mockResolvedValue(true);

      const response = await request(app).post("/auth/logout").send({
        refreshToken: "validRefreshToken",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "Logged out successfully" });
    });

    it("should return 400 if no refresh token is provided", async () => {
      const response = await request(app).post("/auth/logout").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "No refresh token provided" });
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("should return password reset token", async () => {
      (authService.generatePasswordResetToken as jest.Mock).mockResolvedValue("resetToken123");

      const response = await request(app).post("/auth/forgot-password").send({
        email: "test@yopmail.com",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: "Password reset token generated",
        resetToken: "resetToken123",
      });
    });

    it("should return 400 if email is missing", async () => {
      const response = await request(app).post("/auth/forgot-password").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Email required" });
    });
  });

  describe("POST /auth/reset-password", () => {
    it("should reset the password", async () => {
      (authService.resetPassword as jest.Mock).mockResolvedValue(true);

      const response = await request(app).post("/auth/reset-password").send({
        token: "validToken",
        newPassword: "newPassword123",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "Password reset successful" });
    });

    it("should return 400 if token or new password is missing", async () => {
      const response = await request(app).post("/auth/reset-password").send({
        token: "validToken",
      });

      expect(response.status).toBe(429);
      expect(response.body).toEqual({ error: "Token and new password required" });
    });
  });
});