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


const chat = async () => {
  console.log("Welcome to the GCalendar!");
  console.log("\nType 'exit' to quit, 'events' to list upcoming events, or 'add event' to create a new event.");

  let messages = [
    {"role": "system", "content": "You are a helpful assistant with access to Google Calendar."},
    {"role": "assistant", "content": "Hello! How can I assist you today?"}
  ];
  let tools = [
    {
        "type": "function",
        "function": {
            "name": "addCalendarEvent",
            "description": "Add a new event to the primary Google Calendar",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "The title of the event",
                    },
                    "start": {
                        "type": "string",
                        "description": "The start time of the event in ISO 8601 format",
                    },
                    "end": {
                        "type": "string",
                        "description": "The end time of the event in ISO 8601 format",
                    },
                    "description": {
                        "type": "string",
                        "description": "A description of the event",
                    },
                    "location": {
                        "type": "string",
                        "description": "The location of the event",
                    },
                },
                "required": ["summary", "start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "getCalendarEvents",
            "description": "Get events from the primary Google Calendar within a specified date range",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "The start date in ISO 8601 format",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "The end date in ISO 8601 format",
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
]
  console.log("\nBot: Hello! How can I assist you today?");

  while (true) {
    const userInput = readline.question('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    } else if (userInput.toLowerCase() === 'events' || userInput.toLowerCase() === 'todays events') { // debug
      //const now = new Date();
      // const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));
      getCalendarEvents(startOfDay, endOfDay)
      try {
        const events = await getCalendarEvents(startOfDay, endOfDay);
        console.log("\nUpcoming events:");
        events.forEach((event, i) => {
          console.log(`${i + 1}. ${event.summary} (${event.start.dateTime})`);
        });
      } catch (error) {
        console.log("Failed to fetch events. Make sure Google Calendar is set up correctly. Error: ", error);
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
      const botResponse = await getResponse(messages,tools);
      console.log(`Bot: ${botResponse}`);
      messages.push({"role": "assistant", "content": botResponse});
    } catch (error) {
      console.error("An error occurred:", error.message);
    }
  }
};

const getResponse = async (messages,tools) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      tools: tools,
      tool_choice: "auto"
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error getting response from OpenAI: ", error.message);
    return "Sorry, I couldn't think of a response.";
  }
};


module.exports = { chat };