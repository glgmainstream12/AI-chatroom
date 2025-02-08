Here’s a structured **README.md** for your API documentation:

---

# 🛠 Chat API Documentation

## 📌 Introduction
This API provides endpoints for managing chat conversations, including creating conversations, sending messages, retrieving chat history, and streaming AI responses.

---

## 🚀 Installation & Setup

### 1️⃣ **Clone the Repository**
```sh
git clone https://github.com/your-repo/chat-api.git
cd chat-api
```

### 2️⃣ **Install Dependencies**
```sh
npm install
```

### 3️⃣ **Set Up Environment Variables**
Create a `.env` file in the root directory and add:

```env
PORT=5000
DATABASE_URL=your_postgres_database_url
OPENAI_API_KEY=your_openai_api_key
```

### 4️⃣ **Run the Server**
```sh
npm run dev  # For development
npm start    # For production
```

---

## 📌 API Endpoints

### **1️⃣ Get or Create a Conversation**
**`GET /chat/conversation/:conversationId?`**

- Retrieves an existing conversation or creates a new one if no `conversationId` is provided.

#### 📤 Request Example:
```sh
curl -X GET http://localhost:5000/chat/conversation
```

#### 📥 Response:
```json
{
  "id": "12345",
  "createdAt": "2024-02-01T12:00:00.000Z"
}
```

---

### **2️⃣ Send a User Message**
**`POST /chat/conversation/:conversationId/message`**

- Stores a user's message in a conversation.

#### 📤 Request Example:
```sh
curl -X POST http://localhost:5000/chat/conversation/12345/message \
-H "Content-Type: application/json" \
-d '{"content": "Hello, how are you?"}'
```

#### 📥 Response:
```json
{
  "id": "67890",
  "conversationId": "12345",
  "role": "user",
  "content": "Hello, how are you?",
  "createdAt": "2024-02-01T12:05:00.000Z"
}
```

---

### **3️⃣ Retrieve All Messages for a Conversation**
**`GET /chat/conversation/:conversationId/messages`**

- Fetches all messages in a conversation in ascending order.

#### 📤 Request Example:
```sh
curl -X GET http://localhost:5000/chat/conversation/12345/messages
```

#### 📥 Response:
```json
[
  {
    "id": "67890",
    "conversationId": "12345",
    "role": "user",
    "content": "Hello, how are you?",
    "createdAt": "2024-02-01T12:05:00.000Z"
  },
  {
    "id": "67891",
    "conversationId": "12345",
    "role": "assistant",
    "content": "I'm good! How can I assist you today?",
    "createdAt": "2024-02-01T12:06:00.000Z"
  }
]
```

---

### **4️⃣ Stream AI Chat Response**
**`GET /chat/conversation/:conversationId/stream`**

- Streams the assistant's response in real-time.

#### 📤 Request Example:
```sh
curl -N http://localhost:5000/chat/conversation/12345/stream
```

#### 📥 Response (Server-Sent Events Format):
```
data: Hello
data: , how
data:  can I
data:  help you?
```

---

### **5️⃣ Reset a Conversation**
**`DELETE /chat/conversation/:conversationId`**

- Deletes all messages and resets the conversation.

#### 📤 Request Example:
```sh
curl -X DELETE http://localhost:5000/chat/conversation/12345
```

#### 📥 Response:
```json
{
  "message": "Conversation reset successfully"
}
```

---

## 📌 Database Schema (Prisma)

### **Conversation Model**
```prisma
model Conversation {
  id        String    @id @default(uuid())
  createdAt DateTime  @default(now())
  Message   Message[]
}
```

### **Message Model**
```prisma
model Message {
  id             String       @id @default(uuid())
  createdAt      DateTime     @default(now())
  role           String
  content        String
  conversationId String
  Conversation   Conversation @relation(fields: [conversationId], references: [id])
}
```

---

## 🔧 Technologies Used
- **Node.js** (Express.js)
- **TypeScript**
- **Prisma ORM** (PostgreSQL)
- **OpenAI API**
- **SSE (Server-Sent Events)** for streaming responses

---

## 📌 Contributing
1. Fork the repository.
2. Create a new branch: `git checkout -b feature-branch`.
3. Commit your changes: `git commit -m "Added new feature"`.
4. Push to the branch: `git push origin feature-branch`.
5. Open a Pull Request.

---

## 📌 License
This project is open-source and available under the **MIT License**.

---

Let me know if you need any modifications! 🚀