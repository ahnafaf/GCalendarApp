const OpenAI = require('openai');
const { 
  setupGoogleCalendar, 
  addCalendarEvent, 
  getCalendarEvents, 
  modifyCalendarEvent,
  deleteCalendarEvent 
} = require('./googleCalendar');
const readline = require('readline');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in the environment variables.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ensure Google Calendar is set up
setupGoogleCalendar().catch(console.error);

const ASSISTANT_ID = process.env.ASSISTANT_ID

// async function createAssistant() {
//   const assistant = await openai.beta.assistants.create({
//     name: "Calendar Assistant",
//     instructions: "You are a helpful assistant managing a Google Calendar. Always check for conflicts when adding events and ask for confirmation. For deletions, determine if the event is crucial and warn the user if so.",
//     tools: [
//       { 
//         type: "function", 
//         function: { 
//           name: "getCalendarEvents",
//           description: "Get events from the primary Google Calendar within a specified date range",
//           parameters: {
//             type: "object",
//             properties: {
//               start_date: {
//                 type: "string",
//                 description: "The start date in ISO 8601 format",
//               },
//               end_date: {
//                 type: "string",
//                 description: "The end date in ISO 8601 format",
//               },
//             },
//             required: ["start_date", "end_date"],
//           },
//         } 
//       },
//       { 
//         type: "function", 
//         function: { 
//           name: "addCalendarEvent",
//           description: "Add a new event to the primary Google Calendar",
//           parameters: {
//             type: "object",
//             properties: {
//               summary: {
//                 type: "string",
//                 description: "The title of the event",
//               },
//               start: {
//                 type: "string",
//                 description: "The start time of the event in ISO 8601 format",
//               },
//               end: {
//                 type: "string",
//                 description: "The end time of the event in ISO 8601 format",
//               },
//               description: {
//                 type: "string",
//                 description: "A description of the event",
//               },
//               location: {
//                 type: "string",
//                 description: "The location of the event",
//               },
//             },
//             required: ["summary", "start", "end"],
//           },
//         } 
//       },
//       { 
//         type: "function", 
//         function: { 
//           name: "deleteCalendarEvent",
//           description: "Delete an event from the primary Google Calendar",
//           parameters: {
//             type: "object",
//             properties: {
//               eventId: {
//                 type: "string",
//                 description: "The ID of the event to delete",
//               },
//             },
//             required: ["eventId"],
//           },
//         } 
//       },
//       { 
//         type: "function", 
//         function: { 
//           name: "checkEventImportance",
//           description: "Check the importance of an event",
//           parameters: {
//             type: "object",
//             properties: {
//               eventId: {
//                 type: "string",
//                 description: "The ID of the event to check",
//               },
//             },
//             required: ["eventId"],
//           },
//         } 
//       },
//     ],
//     model: "gpt-4o"
//   });
//   console.log("Assistant created with ID:", assistant.id);
//   return assistant.id;
// }

async function chat(userInput, threadId = null) {
  try {
    // Create or retrieve a thread
    const thread = threadId ? await openai.beta.threads.retrieve(threadId) 
                            : await openai.beta.threads.create();

    // Add the current time to the user's message
    const currentTime = new Date().toISOString();
    const userInputWithTime = `Current time: ${currentTime}\n\nUser: ${userInput}`;

    // Add the user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userInputWithTime
    });

    // Retrieve recent messages from the thread (e.g., last 10 messages)
    const messageHistory = await openai.beta.threads.messages.list(thread.id, { limit: 100 });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID
    });

    // Wait for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      if (runStatus.status === 'requires_action') {
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = await Promise.all(toolCalls.map(async toolCall => {
          const result = await handleToolCall(toolCall);
          return {
            tool_call_id: toolCall.id,
            output: JSON.stringify(result)
          };
        }));

        await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
          tool_outputs: toolOutputs
        });
      }
    }

    // Retrieve and return the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data.find(msg => msg.role === 'assistant');
    
    return {
      message: lastMessage.content[0].text.value,
      threadId: thread.id,
      messageHistory: messageHistory.data.map(msg => ({
        role: msg.role,
        content: msg.content[0].text.value
      }))
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return { message: "An error occurred. Please try again.", threadId: null, messageHistory: [] };
  }
}




async function handleToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);

  switch (name) {
    case 'getCalendarEvents':
      return await getCalendarEvents(new Date(parsedArgs.start_date), new Date(parsedArgs.end_date));
    case 'addCalendarEvent':
      const conflicts = await checkConflicts(parsedArgs.start, parsedArgs.end);
      if (conflicts.length > 0) {
        return { conflicts, needsConfirmation: true };
      }
      return await addCalendarEvent(parsedArgs.summary, parsedArgs.start, parsedArgs.end, parsedArgs.description, parsedArgs.location);
    case 'deleteCalendarEvent':
      const importance = await checkEventImportance(parsedArgs.eventId);
      if (importance > 0.7) {
        return { eventId: parsedArgs.eventId, isCrucial: true, needsConfirmation: true };
      }
      return await deleteCalendarEvent(parsedArgs.eventId);
    case 'checkEventImportance':
      return await checkEventImportance(parsedArgs.eventId);
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

async function checkConflicts(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const events = await getCalendarEvents(startDate, endDate);
  return events.filter(event => {
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    return (eventStart < endDate && eventEnd > startDate);
  });
}

async function checkEventImportance(eventId) {
  try {
    const events = await getCalendarEvents(new Date(), new Date(new Date().setFullYear(new Date().getFullYear() + 1)));
    const event = events.find(e => e.id === eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    // Implement logic to determine importance
    const importantKeywords = ['important', 'urgent', 'critical', 'deadline', 'meeting'];
    const summary = event.summary.toLowerCase();
    const description = (event.description || '').toLowerCase();
    const hasImportantKeyword = importantKeywords.some(keyword => summary.includes(keyword) || description.includes(keyword));
    const isRecurring = !!event.recurrence;
    const isAllDay = !event.start.dateTime;
    const attendeesCount = event.attendees ? event.attendees.length : 0;

    let importanceScore = 0;
    if (hasImportantKeyword) importanceScore += 0.3;
    if (isRecurring) importanceScore += 0.2;
    if (isAllDay) importanceScore += 0.1;
    importanceScore += Math.min(attendeesCount * 0.05, 0.4); // Cap at 0.4 for attendees

    return importanceScore;
  } catch (error) {
    console.error("Error checking event importance:", error);
    return 0; // Assume not important if there's an error
  }
}

// Command-line interface for testing
async function startChatInterface() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let threadId = null;

  console.log("Chat with your Calendar Assistant. Type 'exit' to quit.");

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      const response = await chat(input, threadId);
      threadId = response.threadId;
      console.log('Assistant:', response.message);
      askQuestion();
    });
  };

  askQuestion();
}

// Uncomment this line to create a new assistant and get its ID
//createAssistant().then(id => console.log("New Assistant ID:", id)).catch(console.error);

// Start the chat interface
startChatInterface();

module.exports = { chat };
