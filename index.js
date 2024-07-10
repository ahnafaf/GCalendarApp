#!/usr/bin/env node

const readline = require('readline-sync');
const OpenAI = require('openai');
require('dotenv').config();

// Check if the API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in the environment variables.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to get a response from OpenAI
const getResponse = async (message) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error getting response from OpenAI: ", error.message);
    return "Sorry, I couldn't think of a response.";
  }
};

// Main chat loop
const chat = async () => {
  console.log("Welcome to the GPT-3 Chatbot! Type 'exit' to quit.");
  while (true) {
    const userInput = readline.question('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    }

    try {
      const botResponse = await getResponse(userInput);
      console.log(`Bot: ${botResponse}`);
    } catch (error) {
      console.error("An error occurred:", error.message);
    }
  }
};

chat().catch((error) => {
  console.error("An unexpected error occurred:", error.message);
});
