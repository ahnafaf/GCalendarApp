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

const tools = [
  {
    type: "function",
    function: {
      name: "addCalendarEvent",
      description: "Add a new event to the primary Google Calendar",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "The title of the event",
          },
          start: {
            type: "string",
            description: "The start time of the event in ISO 8601 format",
          },
          end: {
            type: "string",
            description: "The end time of the event in ISO 8601 format",
          },
          description: {
            type: "string",
            description: "A description of the event",
          },
          location: {
            type: "string",
            description: "The location of the event",
          },
        },
        required: ["summary", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCalendarEvents",
      description: "Get events from the primary Google Calendar within a specified date range",
      parameters: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "The start date in ISO 8601 format",
          },
          end_date: {
            type: "string",
            description: "The end date in ISO 8601 format",
          },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
];

const availableFunctions = {
  addCalendarEvent: addCalendarEvent,
  getCalendarEvents: getCalendarEvents,
};

async function runConversation(userInput) {
  const now = new Date();
  const currentDateTimeString = now.toISOString();
  const currentYear = now.getFullYear();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -now.getTimezoneOffset() / 60;
  const timeZoneString = `${timeZone} (UTC${offset >= 0 ? '+' : ''}${offset})`;

  const messages = [
    {
      "role": "system", 
      "content": `You are a helpful assistant with access to Google Calendar. The current date and time is ${currentDateTimeString}. The user's timezone is ${timeZoneString}. When adding events, interpret the user's intent and provide the event details using this current date, time, and timezone as context. Always use ${currentYear} or a future year for events unless explicitly specified otherwise.`
    },
    {
      "role": "user", 
      "content": `Current date and time: ${currentDateTimeString}. User's timezone: ${timeZoneString}. User input: ${userInput}`
    }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4-0613",
    messages: messages,
    tools: tools,
    tool_choice: "auto",
  });

  const responseMessage = response.choices[0].message;
  messages.push(responseMessage);

  if (responseMessage.tool_calls) {
    for (const toolCall of responseMessage.tool_calls) {
      const functionName = toolCall.function.name;
      const functionToCall = availableFunctions[functionName];
      const functionArgs = JSON.parse(toolCall.function.arguments);

      if (functionName === "addCalendarEvent") {
        // Ask for user confirmation
        const userConfirmed = askForConfirmation(functionArgs);
        
        if (userConfirmed) {
          try {
            const result = await functionToCall(
              functionArgs.summary,
              functionArgs.start,
              functionArgs.end,
              functionArgs.description,
              functionArgs.location
            );
            console.log("Event added successfully:", result.htmlLink);
            messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: functionName,
              content: JSON.stringify({ success: true, link: result.htmlLink })
            });
          } catch (error) {
            console.error("Error adding event:", error);
            messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: functionName,
              content: JSON.stringify({ success: false, error: error.message })
            });
          }
        } else {
          console.log("Event addition cancelled by user.");
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify({ success: false, error: "User cancelled event addition" })
          });
        }
      } else if (functionName === "getCalendarEvents") {
        try {
          const events = await functionToCall(new Date(functionArgs.start_date), new Date(functionArgs.end_date));
          console.log("\nEvents in specified range:");
          events.forEach((event, i) => {
            console.log(`${i + 1}. ${event.summary} (${event.start.dateTime})`);
          });
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(events)
          });
        } catch (error) {
          console.error("Error fetching events:", error);
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify({ error: error.message })
          });
        }
      }
    }

    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4-0613",
      messages: messages,
    });

    return secondResponse.choices[0].message.content;
  }

  return responseMessage.content;
}

function askForConfirmation(event) {
  console.log("\nPlease confirm the event details:");
  console.log(`Summary: ${event.summary}`);
  console.log(`Start: ${new Date(event.start).toLocaleString()}`);
  console.log(`End: ${new Date(event.end).toLocaleString()}`);
  console.log(`Description: ${event.description || 'N/A'}`);
  console.log(`Location: ${event.location || 'N/A'}`);
  
  const confirmation = readline.question('Do you want to add this event? (yes/no): ').toLowerCase();
  return confirmation === 'yes' || confirmation === 'y';
}

async function chat() {
  console.log("Welcome to the GCalendar!");
  console.log("\nType 'exit' to quit, 'events' to list upcoming events, or simply describe an event you wish to add.");

  while (true) {
    const userInput = readline.question('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    } else if (userInput.toLowerCase() === 'events' || userInput.toLowerCase() === 'todays events') {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));
      try {
        const events = await getCalendarEvents(startOfDay, endOfDay);
        console.log("\nToday's events:");
        events.forEach((event, i) => {
          console.log(`${i + 1}. ${event.summary} (${event.start.dateTime})`);
        });
      } catch (error) {
        console.log("Failed to fetch events. Make sure Google Calendar is set up correctly. Error: ", error);
      }
    } else {
      try {
        const response = await runConversation(userInput);
        console.log(`Bot: ${response}`);
      } catch (error) {
        console.error("An error occurred:", error.message);
      }
    }
  }
}

module.exports = { chat };