Below is a structured API documentation based on the provided code. This documentation focuses on the key endpoints (particularly in the /auth router) and includes request/response formats, success responses, and error responses.

Overview

The server uses Express and provides several routes:
	•	Global routes:
	•	GET /health
	•	404 error handler
	•	Auth routes (/auth)
	•	POST /auth/sign-up
	•	POST /auth/login
	•	POST /auth/refresh-token
	•	POST /auth/forgot-password
	•	POST /auth/reset-password
	•	POST /auth/logout
	•	Other routes (imported but code not shown):
	•	/chat (Chat functionality)
	•	/upload (File uploads)
	•	/transcribe (Transcription)
	•	/anon (Anonymous Chat)
	•	/subscription (Subscription management)

The server also has various security and performance features:
	•	Session management (using express-session)
	•	Security headers (using helmet and manual headers)
	•	Compression (using compression)
	•	Global rate limiting (express-rate-limit)
	•	CORS configured for * (allowing all origins)
	•	Error-handling middleware
	•	Static file serving at /uploads

Below is the detailed documentation for each relevant endpoint.

1. Health Check

GET /health

Description: Returns basic system status and health information.

Response
	•	Status Code: 200 OK

Successful Response (JSON)

{
  "status": "ok",
  "timestamp": "2023-01-01T12:00:00.000Z",
  "uptime": 1234.5678,
  "memory": {
    "rss": 12345678,
    "heapTotal": 2345678,
    "heapUsed": 1234567,
    "external": 123456,
    "arrayBuffers": 1234
  },
  "environment": "development"
}

There are no known failure responses for this endpoint (it simply returns 200 or times out if the server is unavailable).

2. Authentication Endpoints

All authentication endpoints are grouped under the /auth prefix. Rate-limited at max 5 requests per 15 minutes (see authLimiter in the code).

2.1. Sign Up

Endpoint

POST /auth/sign-up

Description

Creates a new user account given valid credentials. Returns an access token and a refresh token on success.

Request Body

{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "name": "John Doe" // (Optional) user's name
}

	•	email (string, required): Must be a valid email format.
	•	password (string, required): Must be at least 8 characters.
	•	name (string, optional): User’s name.

Success Response
	•	Status Code: 201 Created

{
  "message": "User created successfully",
  "accessToken": "<jwt-access-token>",
  "refreshToken": "<jwt-refresh-token>",
  "user": {
    "id": "string-uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}

Error Responses
	•	400 Bad Request

{
  "error": "Email and password required"
}

Or

{
  "error": "Password must be at least 8 characters long"
}

Or

{
  "error": "User already exists"
}


	•	429 Too Many Requests (due to rate limiter):

{
  "error": "Too many requests from this IP, please try again later"
}

2.2. Login

Endpoint

POST /auth/login

Description

Authenticates an existing user with their email and password. Returns a new access token and refresh token.

Request Body

{
  "email": "user@example.com",
  "password": "SecurePassword123"
}

Success Response
	•	Status Code: 200 OK

{
  "accessToken": "<jwt-access-token>",
  "refreshToken": "<jwt-refresh-token>",
  "user": {
    "id": "string-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "planType": "FREE" // or whichever plan type the user has
  }
}

Error Responses
	•	400 Bad Request

{
  "error": "Email and password required"
}


	•	401 Unauthorized
	•	Invalid credentials:

{
  "error": "Invalid email or password"
}


	•	Account locked (exceeded max login attempts):

{
  "error": "Account is locked. Try again in X minutes"
}


	•	429 Too Many Requests (due to rate limiter):

{
  "error": "Too many requests from this IP, please try again later"
}

2.3. Refresh Token

Endpoint

POST /auth/refresh-token

Description

Generates a new access token and refresh token, given a valid (non-expired) refresh token.

Request Body

{
  "refreshToken": "<jwt-refresh-token>"
}

Success Response
	•	Status Code: 200 OK

{
  "accessToken": "<new-jwt-access-token>",
  "refreshToken": "<new-jwt-refresh-token>"
}

Error Responses
	•	401 Unauthorized

{
  "error": "No refresh token provided"
}


	•	403 Forbidden

{
  "error": "Invalid refresh token"
}

Or

{
  "error": "Invalid or expired refresh token"
}


	•	429 Too Many Requests

{
  "error": "Too many requests from this IP, please try again later"
}

2.4. Forgot Password

Endpoint

POST /auth/forgot-password

Description

Generates a password reset token for the specified user email. Typically, you would email this token to the user. In development, the token is returned directly in the response for testing.

Request Body

{
  "email": "user@example.com"
}

Success Response
	•	Status Code: 200 OK

{
  "message": "Password reset token generated",
  "resetToken": "<randomly-generated-token>" 
}

	Note: In a production environment, you would not return the resetToken directly. You would instead email it to the user.

Error Responses
	•	400 Bad Request

{
  "error": "Email required"
}

or

{
  "error": "User not found"
}


	•	429 Too Many Requests

{
  "error": "Too many requests from this IP, please try again later"
}

2.5. Reset Password

Endpoint

POST /auth/reset-password

Description

Resets the user’s password given a valid reset token and a new password. The token must be unexpired.

Request Body

{
  "token": "<reset-token>",
  "newPassword": "NewPassword123"
}

Success Response
	•	Status Code: 200 OK

{
  "message": "Password reset successful"
}

Error Responses
	•	400 Bad Request

{
  "error": "Token and new password required"
}

or

{
  "error": "Invalid or expired reset token"
}


	•	429 Too Many Requests

{
  "error": "Too many requests from this IP, please try again later"
}

2.6. Logout

Endpoint

POST /auth/logout

Description

Logs out a user by invalidating their refresh token in the database. Requires authentication (the requireAuth middleware is used).

Request Headers

Authorization: Bearer <jwt-access-token>

	Note: You must provide a valid access token in the Authorization header.

Request Body

{
  "refreshToken": "<jwt-refresh-token>"
}

Success Response
	•	Status Code: 200 OK

{
  "message": "Logged out successfully"
}

Error Responses
	•	400 Bad Request

{
  "error": "No refresh token provided"
}


	•	401 Unauthorized

{
  "error": "No token provided"
}

or

{
  "error": "Invalid authorization header format"
}

or

{
  "error": "Token expired"
}

or

{
  "error": "Invalid token"
}


	•	500 Internal Server Error

{
  "error": "Internal server error"
}

3. Other Routes

The code references additional routers:
	1.	/chat (handled by chatRouter)
	2.	/upload (handled by uploadRouter)
	3.	/transcribe (handled by transcribeRouter)
	4.	/anon (handled by anonymousChatRouter)
	5.	/subscription (handled by subscriptionRouter)

Since their implementations are not included in the provided code snippet, refer to each router’s respective documentation or code for details on their endpoints and behavior.

4. Error Handling

4.1. 404 Not Found

If a request does not match any existing route:

{
  "error": "Not Found"
}

Status Code: 404 Not Found

4.2. 500 Internal Server Error

For unhandled errors in production:

{
  "error": "Internal server error"
}

In development mode, the response may include:

{
  "error": "Error message",
  "stack": "Detailed stack trace"
}

Status Code: 500 Internal Server Error

Notes & Security
	•	Rate Limiting:
	•	Auth endpoints are rate-limited to 5 requests per 15 minutes (via authLimiter).
	•	All routes are also protected by a global rate limiter that restricts any IP to 100 requests per 15 minutes.
	•	CORS:
	•	Currently configured to allow all origins (origin: *).
	•	JWT Tokens:
	•	Access Token expires in 15 minutes.
	•	Refresh Token expires in 7 days.
	•	The server enforces refresh token rotation (old refresh token is replaced with a new one every time /refresh-token is called).
	•	Password Security:
	•	Passwords are hashed using bcrypt with SALT_ROUNDS = 12.
	•	User accounts can get locked for 15 minutes after MAX_LOGIN_ATTEMPTS = 5 consecutive failed logins.
	•	Session:
	•	An express-session is configured for the app, but the primary authentication logic uses JWT tokens. The session is used for possible stateful endpoints.

Conclusion

This documentation covers the primary backend functionality provided in the code snippet, focusing on authentication routes and the /health endpoint. For extended functionality (/chat, /upload, /transcribe, /anon, /subscription), refer to the respective router implementations and their documentation.