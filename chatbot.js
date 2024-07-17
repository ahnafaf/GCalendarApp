#!/usr/bin/env node
const gapi = require('./googleCalendar');

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
const getResponse = async (messages) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
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
  
  let messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "assistant", "content": "Hello! How can I assist you today?"}
  ];

  console.log("Bot: Hello! How can I assist you today?");

  while (true) {
    const userInput = readline.question('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    } else if (userInput.toLowerCase() === 'event_test') {
      await gapi.setupGoogleCalendar();
      const daternow = new Date();
      const events = await gapi.getCalendarEvent(daternow, new Date(daternow.getTime() + 30 * 24 * 60 * 60 * 1000));
      console.log(events);
      break;    
    }
    

    messages.push({"role": "user", "content": userInput});

    try {
      const botResponse = await getResponse(messages);
      console.log(`Bot: ${botResponse}`);
      messages.push({"role": "assistant", "content": botResponse});
    } catch (error) {
      console.error("An error occurred:", error.message);
    }
  }
};

chat().catch((error) => {
  console.error("An unexpected error occurred:", error.message);
});
