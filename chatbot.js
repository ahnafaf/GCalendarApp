const { getCalendarEvents, addCalendarEvent } = require('./googleCalendar');
const readline = require('readline-sync');
const OpenAI = require('openai');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in the environment variables.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getResponse = async (messages) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error getting response from OpenAI: ", error.message);
    return "Sorry, I couldn't think of a response.";
  }
};

const chat = async () => {
  console.log("Welcome to the GPT-3 Chatbot with Google Calendar integration!");
  console.log("\nType 'exit' to quit, 'events' to list upcoming events, or 'add event' to create a new event.");

  let messages = [
    {"role": "system", "content": "You are a helpful assistant with access to Google Calendar."},
    {"role": "assistant", "content": "Hello! How can I assist you today?"}
  ];

  console.log("\nBot: Hello! How can I assist you today?");

  while (true) {
    const userInput = readline.question('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    } else if (userInput.toLowerCase() === 'events') {
      const now = new Date();
      const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      try {
        const events = await getCalendarEvents(new Date(2023, 3, 1), oneMonthFromNow);
        console.log("\nUpcoming events:");
        events.forEach((event, i) => {
          console.log(`${i + 1}. ${event.summary} (${event.start.dateTime})`);
        });
      } catch (error) {
        console.log("Failed to fetch events. Make sure Google Calendar is set up correctly.");
      }
      continue;
    } else if (userInput.toLowerCase() === 'add event') {
      const summary = readline.question('Event summary: ');
      const start = readline.question('Start time (YYYY-MM-DDTHH:MM:SS): ');
      const end = readline.question('End time (YYYY-MM-DDTHH:MM:SS): ');
      const description = readline.question('Description: ');
      const location = readline.question('Location: ');

      try {
        await addCalendarEvent(summary, start, end, description, location);
        console.log("Event added successfully!");
      } catch (error) {
        console.log("Failed to add event. Make sure Google Calendar is set up correctly.");
      }
      continue;
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

module.exports = { chat };