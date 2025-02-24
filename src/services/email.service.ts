// services/email.service.ts
import nodemailer from "nodemailer";

// Environment variables or a config file
const SMTP_HOST = process.env.SMTP_HOST || "email-smtp.us-east-1.amazonaws.com";
const SMTP_PORT = process.env.SMTP_PORT || 465; // or 587
const SMTP_USER = process.env.SMTP_USER || "";  // Your AWS SMTP username
const SMTP_PASS = process.env.SMTP_PASS || "";  // Your AWS SMTP password
const FROM_EMAIL = process.env.FROM_EMAIL || "no-reply@yourdomain.com";

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: true, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Sends a password reset email with a link to reset the password.
 * @param toEmail - The user's email address
 * @param resetLink - The URL the user can click to reset password
 */
export async function sendForgotPasswordEmail(toEmail: string, resetLink: string) {
  const mailOptions = {
    from: `"Your App" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: "Reset your password",
    html: `
      <p>You requested a password reset. Please click the link below to reset your password:</p>
      <p>
        <a 
          href="${resetLink}"
          style="
            display: inline-block;
            padding: 10px 20px;
            margin-top: 10px;
            background-color: #007bff;
            color: #fff;
            text-decoration: none;
            border-radius: 4px;"
        >
          Reset Password
        </a>
      </p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}