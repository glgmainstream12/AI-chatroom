const OpenAI = require("openai");
require("dotenv").config(); // Make sure this is at the top!

const openai = new OpenAI({
  apiKey: "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", // Read API key from environment
});

async function testOpenAI() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello, how are you?" }],
      temperature: 0.7,
    });

    console.log("OpenAI Response:", response);
    console.log(response.choices.message)
  } catch (error) {
    console.error("Error calling OpenAI:", error);
  }
}

testOpenAI();
