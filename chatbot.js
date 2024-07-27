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
          await handleAddCalendarEvent(functionArgs, messages, toolCall.id);
        } else if (functionName === "getCalendarEvents") {
          await handleGetCalendarEvents(functionArgs, messages, toolCall.id);
        }
      }

      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
      });

      return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
  } catch (error) {
    console.error("An error occurred during the conversation:", error);
    return "I'm sorry, but an error occurred while processing your request. Please try again.";
  }
}

async function handleAddCalendarEvent(functionArgs, messages, toolCallId) {
  // Check for conflicts
  const eventDate = new Date(functionArgs.start);
  const startOfDay = new Date(eventDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(eventDate.setHours(23, 59, 59, 999));
  
  try {
    const existingEvents = await getCalendarEvents(startOfDay, endOfDay);
    
    // Pass existing events to GPT for conflict analysis
    const conflictAnalysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        ...messages,
        {
          role: "user",
          content: `Analyze these existing events for conflicts with the new event (${functionArgs.summary}) scheduled from ${functionArgs.start} to ${functionArgs.end}. If there are conflicts, suggest alternative times within the week. Existing events: ${JSON.stringify(existingEvents)}`
        }
      ],
    });

    const conflictAnalysis = conflictAnalysisResponse.choices[0].message.content;
    console.log("Conflict analysis:", conflictAnalysis);

    // Ask for user decision with conflict information
    const userDecision = askForDecision(functionArgs, conflictAnalysis);
    
    if (userDecision === 'add') {
      // Add the event as originally planned
      const result = await addCalendarEvent(
        functionArgs.summary,
        functionArgs.start,
        functionArgs.end,
        functionArgs.description,
        functionArgs.location
      );
      console.log("Event added successfully:", result.htmlLink);
      messages.push({
        tool_call_id: toolCallId,
        role: "tool",
        name: "addCalendarEvent",
        content: JSON.stringify({ success: true, link: result.htmlLink })
      });
    } else if (userDecision === 'suggest') {
      // Enter suggestion mode
      await handleEventSuggestions(functionArgs, conflictAnalysis, existingEvents, messages, toolCallId);
    } else {
      console.log("Event addition cancelled by user.");
      messages.push({
        tool_call_id: toolCallId,
        role: "tool",
        name: "addCalendarEvent",
        content: JSON.stringify({ success: false, error: "User cancelled event addition" })
      });
    }
  } catch (error) {
    console.error("Error handling add calendar event:", error);
    messages.push({
      tool_call_id: toolCallId,
      role: "tool",
      name: "addCalendarEvent",
      content: JSON.stringify({ success: false, error: error.message })
    });
  }
}

async function handleGetCalendarEvents(functionArgs, messages, toolCallId) {
  try {
    const events = await getCalendarEvents(new Date(functionArgs.start_date), new Date(functionArgs.end_date));
    console.log("\nEvents in specified range:");
    events.forEach((event, i) => {
      console.log(`${i + 1}. ${event.summary} (${event.start.dateTime})`);
    });
    messages.push({
      tool_call_id: toolCallId,
      role: "tool",
      name: "getCalendarEvents",
      content: JSON.stringify(events)
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    messages.push({
      tool_call_id: toolCallId,
      role: "tool",
      name: "getCalendarEvents",
      content: JSON.stringify({ error: error.message })
    });
  }
}

function askForDecision(event, conflictAnalysis) {
  console.log("\nEvent details:");
  console.log(`Summary: ${event.summary}`);
  console.log(`Start: ${new Date(event.start).toLocaleString()}`);
  console.log(`End: ${new Date(event.end).toLocaleString()}`);
  console.log(`Description: ${event.description || 'N/A'}`);
  console.log(`Location: ${event.location || 'N/A'}`);
  console.log(`\nConflict analysis: ${conflictAnalysis}`);
  
  while (true) {
    const decision = readline.question('What would you like to do? (add/suggest/cancel): ').toLowerCase();
    if (['add', 'suggest', 'cancel'].includes(decision)) {
      return decision;
    }
    console.log("Invalid input. Please enter 'add', 'suggest', or 'cancel'.");
  }
}

async function handleEventSuggestions(event, conflictAnalysis, existingEvents, messages, toolCallId) {
  let conversation = [
    { role: "system", content: "You are a helpful assistant managing calendar events. Provide specific date and time suggestions for rescheduling." },
    { role: "user", content: `I need help rescheduling this event: ${JSON.stringify(event)}. Here's the conflict analysis: ${conflictAnalysis}. And here are my existing events: ${JSON.stringify(existingEvents)}. Please suggest some alternatives.` }
  ];

  while (true) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-0613",
        messages: conversation,
      });

      console.log("Assistant:", response.choices[0].message.content);
      
      const userInput = readline.question('You (type "add" to schedule, "cancel" to stop, or ask for more suggestions): ');
      
      if (userInput.toLowerCase() === 'add') {
        const lastSuggestion = parseLastSuggestion(response.choices[0].message.content);
        if (lastSuggestion) {
          const result = await addCalendarEvent(
            event.summary,
            lastSuggestion.start,
            lastSuggestion.end,
            event.description,
            event.location
          );
          console.log("Event added successfully:", result.htmlLink);
          messages.push({
            tool_call_id: toolCallId,
            role: "tool",
            name: "addCalendarEvent",
            content: JSON.stringify({ success: true, link: result.htmlLink })
          });
          break;
        } else {
          console.log("Couldn't parse the last suggestion. Please try again.");
        }
      } else if (userInput.toLowerCase() === 'cancel') {
        console.log("Event scheduling cancelled.");
        messages.push({
          tool_call_id: toolCallId,
          role: "tool",
          name: "addCalendarEvent",
          content: JSON.stringify({ success: false, error: "User cancelled event addition during suggestion phase" })
        });
        break;
      } else {
        conversation.push({ role: "user", content: userInput });
      }
    } catch (error) {
      console.error("Error in suggestion conversation:", error);
      console.log("An error occurred. Would you like to try again?");
      if (readline.question("(yes/no): ").toLowerCase() !== 'yes') {
        messages.push({
          tool_call_id: toolCallId,
          role: "tool",
          name: "addCalendarEvent",
          content: JSON.stringify({ success: false, error: "Error in suggestion conversation" })
        });
        break;
      }
    }
  }
}

function parseLastSuggestion(content) {
  const regex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g;
  const matches = content.match(regex);
  if (matches && matches.length >= 2) {
    return { start: matches[matches.length - 2], end: matches[matches.length - 1] };
  }
  console.log("Couldn't find a valid date-time suggestion. Please ask for a more specific suggestion.");
  return null;
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