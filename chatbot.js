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

async function runConversation(messages, userInput) {
  const now = new Date();
  const currentDateTimeString = now.toISOString();
  const currentYear = now.getFullYear();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -now.getTimezoneOffset() / 60;
  const timeZoneString = `${timeZone} (UTC${offset >= 0 ? '+' : ''}${offset})`;

  messages.push({
    "role": "user", 
    "content": `Current date and time: ${currentDateTimeString}. User's timezone: ${timeZoneString}. User input: ${userInput}`
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;
    messages.push(responseMessage);

    if (responseMessage.tool_calls) {
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        if (functionName === "addCalendarEvent") {
          // First, check for existing events
          const eventDate = new Date(functionArgs.start);
          const startOfDay = new Date(eventDate.setHours(0, 0, 0, 0));
          const endOfDay = new Date(eventDate.setHours(23, 59, 59, 999));
          
          try {
            const existingEvents = await getCalendarEvents(startOfDay, endOfDay);
            
            let conflictMessage = "";
            if (existingEvents.length > 0) {
              conflictMessage = "You have the following events on the day of the proposed event:\n";
              existingEvents.forEach(event => {
                const startTime = event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString() : "All day";
                const endTime = event.end.dateTime ? new Date(event.end.dateTime).toLocaleTimeString() : "All day";
                conflictMessage += `- ${event.summary} (${startTime} - ${endTime})\n`;
              });
            } else {
              conflictMessage = "You have no other events scheduled on this day.\n";
            }
            
            // Ask for confirmation
            console.log(conflictMessage);
            const confirmation = readline.question(`Are you sure you want to add "${functionArgs.summary}" from ${new Date(functionArgs.start).toLocaleString()} to ${new Date(functionArgs.end).toLocaleString()}? (yes/no): `);
            
            if (confirmation.toLowerCase() === 'yes') {
              const result = await addCalendarEvent(
                functionArgs.summary,
                functionArgs.start,
                functionArgs.end,
                functionArgs.description,
                functionArgs.location
              );
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: functionName,
                content: JSON.stringify({ success: true, link: result.htmlLink })
              });
            } else {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: functionName,
                content: JSON.stringify({ success: false, error: "User cancelled event addition" })
              });
            }
          } catch (error) {
            console.error("Error checking calendar or adding event:", error);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ success: false, error: error.message })
            });
          }
        } else if (functionName === "getCalendarEvents") {
          try {
            const events = await getCalendarEvents(new Date(functionArgs.start_date), new Date(functionArgs.end_date));
            console.log("\nEvents in specified range:");
            events.forEach((event, i) => {
              const startTime = event.start.dateTime ? new Date(event.start.dateTime).toLocaleString() : "All day";
              const endTime = event.end.dateTime ? new Date(event.end.dateTime).toLocaleString() : "All day";
              console.log(`${i + 1}. ${event.summary} (${startTime} - ${endTime})`);
            });
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify(events)
            });
          } catch (error) {
            console.error("Error fetching events:", error);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: error.message })
            });
          }
        }
      }

      // Make a second API call with updated messages
      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
      });

      messages.push(secondResponse.choices[0].message);
      return secondResponse.choices[0].message.content;
    }

    // If no tool calls were made, we don't need a second API call
    return responseMessage.content;
  } catch (error) {
    console.error("An error occurred during the conversation:", error);
    return "I'm sorry, but an error occurred while processing your request. Please try again.";
  }
}

async function chat() {
  console.log("Welcome to the GCalendar!");
  console.log("\nType 'exit' to quit, 'events' to list upcoming events, or simply describe an event you wish to add.");

  const now = new Date();
  const currentDateTimeString = now.toISOString();
  const currentYear = now.getFullYear();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -now.getTimezoneOffset() / 60;
  const timeZoneString = `${timeZone} (UTC${offset >= 0 ? '+' : ''}${offset})`;

  let messages = [
    {
      "role": "system", 
      "content": `You are a helpful assistant with access to Google Calendar. The current date and time is ${currentDateTimeString}. The user's timezone is ${timeZoneString}. When adding events, interpret the user's intent and provide the event details using this current date, time, and timezone as context. Always use ${currentYear} or a future year for events unless explicitly specified otherwise. Before adding an event, always check for conflicts and ask for confirmation. Maintain context throughout the conversation.`
    }
  ];

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
          const startTime = event.start.dateTime ? new Date(event.start.dateTime).toLocaleString() : "All day";
          const endTime = event.end.dateTime ? new Date(event.end.dateTime).toLocaleString() : "All day";
          console.log(`${i + 1}. ${event.summary} (${startTime} - ${endTime})`);
        });
      } catch (error) {
        console.log("Failed to fetch events. Make sure Google Calendar is set up correctly. Error: ", error);
      }
    } else {
      try {
        const response = await runConversation(messages, userInput);
        console.log(`Bot: ${response}`);
      } catch (error) {
        console.error("An error occurred:", error.message);
      }
    }
  }
}

module.exports = { chat };