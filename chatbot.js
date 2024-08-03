const { getCalendarEvents, addCalendarEvent, deleteCalendarEvent } = require('./googleCalendar');
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
  {
    type: "function",
    function: {
      name: "deleteCalendarEvent",
      description: "Delete an event from the primary Google Calendar",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "The ID of the event to delete",
          },
        },
        required: ["eventId"],
      },
    },
  },
];

const availableFunctions = {
  addCalendarEvent: addCalendarEvent,
  getCalendarEvents: getCalendarEvents,
  deleteCalendarEvent: deleteCalendarEvent,
};

async function runConversation(messages, userInput) {
  const now = new Date();
  const currentDateTimeString = now.toISOString();
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
          await handleAddCalendarEvent(toolCall, functionArgs, messages);
        } else if (functionName === "getCalendarEvents") {
          await handleGetCalendarEvents(toolCall, functionArgs, messages);
        } else if (functionName === "deleteCalendarEvent") {
          await handleDeleteCalendarEvent(toolCall, functionArgs, messages);
        }
      }

      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
      });

      messages.push(secondResponse.choices[0].message);

      // Check if an event was added or deleted and include relevant information in the response
      const lastToolMessage = messages.find(msg => msg.role === 'tool' && (msg.name === 'addCalendarEvent' || msg.name === 'deleteCalendarEvent'));
      if (lastToolMessage) {
        const content = JSON.parse(lastToolMessage.content);
        if (content.success) {
          if (lastToolMessage.name === 'addCalendarEvent') {
            return {
              type: "event_confirmation",
              success: true,
              event: {
                summary: content.eventSummary,
                start: content.eventStart,
                end: content.eventEnd,
                location: content.location || ""
              },
              message: secondResponse.choices[0].message.content,
              link: content.eventLink
            };
          } else if (lastToolMessage.name === 'deleteCalendarEvent') {
            return {
              type: "event_deletion",
              success: true,
              event: {
                summary: content.deletedEvent.summary
              },
              message: `${secondResponse.choices[0].message.content}\n\nEvent "${content.deletedEvent.summary}" was successfully deleted.`
            };
          }
        }
      }

      return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
  } catch (error) {
    console.error("An error occurred during the conversation:", error);
    return "I'm sorry, but an error occurred while processing your request. Please try again.";
  }
}

async function handleAddCalendarEvent(toolCall, functionArgs, messages) {
  const eventDate = new Date(functionArgs.start);
  const startOfDay = new Date(eventDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(eventDate.setHours(23, 59, 59, 999));
  
  try {
    const existingEvents = await getCalendarEvents(startOfDay, endOfDay);
    
    let conflictMessage = existingEvents.length > 0
      ? "You have the following events on the day of the proposed event:\n" + existingEvents.map(event => 
        `- ${event.summary} (${formatEventTime(event.start)} - ${formatEventTime(event.end)})`
      ).join('\n')
      : "You have no other events scheduled on this day.\n";
    
    // Actually add the event to the calendar
    const addedEvent = await addCalendarEvent(
      functionArgs.summary,
      functionArgs.start,
      functionArgs.end,
      functionArgs.description,
      functionArgs.location
    );

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify({ 
        success: true,
        conflictMessage: conflictMessage,
        eventSummary: addedEvent.summary,
        eventStart: new Date(addedEvent.start.dateTime).toLocaleString(),
        eventEnd: new Date(addedEvent.end.dateTime).toLocaleString(),
        location: addedEvent.location,
        eventLink: addedEvent.htmlLink
      })
    });
  } catch (error) {
    console.error("Error checking calendar or adding event:", error);
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify({ success: false, error: error.message })
    });
  }
}

async function handleGetCalendarEvents(toolCall, functionArgs, messages) {
  try {
    const events = await getCalendarEvents(new Date(functionArgs.start_date), new Date(functionArgs.end_date));
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify(events)
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify({ error: error.message })
    });
  }
}

async function handleDeleteCalendarEvent(toolCall, functionArgs, messages) {
  try {
    const eventId = functionArgs.eventId;
    const events = await getCalendarEvents(new Date(), new Date(new Date().setFullYear(new Date().getFullYear() + 1)));
    const eventToDelete = events.find(e => e.id === eventId);
    
    if (!eventToDelete) {
      throw new Error("Event not found");
    }
    
    // Actually delete the event
    const deleteResult = await deleteCalendarEvent(eventId);
    
    if (deleteResult) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify({ 
          success: true,
          message: "Event deleted successfully",
          deletedEvent: {
            id: eventToDelete.id,
            summary: eventToDelete.summary,
            start: formatEventTime(eventToDelete.start),
            end: formatEventTime(eventToDelete.end)
          }
        })
      });
    } else {
      throw new Error("Failed to delete event");
    }
  } catch (error) {
    console.error("Error deleting event:", error);
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify({ success: false, error: error.message })
    });
  }
}

function formatEventTime(eventTime) {
  return eventTime.dateTime ? new Date(eventTime.dateTime).toLocaleString() : "All day";
}

let conversationMessages = [];

async function chat(userInput) {
  if (conversationMessages.length === 0) {
    const now = new Date();
    const currentDateTimeString = now.toISOString();
    const currentYear = now.getFullYear();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -now.getTimezoneOffset() / 60;
    const timeZoneString = `${timeZone} (UTC${offset >= 0 ? '+' : ''}${offset})`;

    conversationMessages.push({
      "role": "system", 
      "content": `You are a helpful assistant with access to Google Calendar. The current date and time is ${currentDateTimeString}. The user's timezone is ${timeZoneString}. When adding events, interpret the user's intent and provide the event details using this current date, time, and timezone as context. Always use ${currentYear} or a future year for events unless explicitly specified otherwise. Before adding an event, always check for conflicts and ask for confirmation. You can also delete events when requested. Maintain context throughout the conversation.`
    });
  }

  try {
    const response = await runConversation(conversationMessages, userInput);
    return response;
  } catch (error) {
    console.error("An error occurred:", error.message);
    return "An error occurred. Please try again.";
  }
}

async function confirmAddEvent(eventDetails) {
  try {
    const result = await addCalendarEvent(
      eventDetails.summary,
      eventDetails.start,
      eventDetails.end,
      eventDetails.description,
      eventDetails.location
    );
    return {
      type: "event_confirmation",
      success: true,
      event: {
        summary: result.summary,
        start: result.start.dateTime || result.start.date,
        end: result.end.dateTime || result.end.date,
        location: result.location || ""
      },
      message: "Your event has been successfully added to your calendar.",
      link: result.htmlLink
    };
  } catch (error) {
    console.error("Error adding event:", error);
    return {
      type: "event_confirmation",
      success: false,
      message: "Failed to add the event to your calendar.",
      error: error.message
    };
  }
}

async function confirmDeleteEvent(eventId) {
  try {
    const events = await getCalendarEvents(new Date(), new Date(new Date().setFullYear(new Date().getFullYear() + 1)));
    const eventToDelete = events.find(e => e.id === eventId);
    
    if (!eventToDelete) {
      throw new Error("Event not found");
    }
    
    const result = await deleteCalendarEvent(eventId);
    if (result) {
      return {
        type: "event_deletion",
        success: true,
        event: {
          summary: eventToDelete.summary
        },
        message: `The event "${eventToDelete.summary}" has been successfully removed from your calendar.`
      };
    } else {
      throw new Error("Failed to delete event");
    }
  } catch (error) {
    console.error("Error deleting event:", error);
    return {
      type: "event_deletion",
      success: false,
      message: "Failed to delete the event from your calendar.",
      error: error.message
    };
  }
}

async function listTodaysEvents() {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  try {
    return await getCalendarEvents(startOfDay, endOfDay);
  } catch (error) {
    console.log("Failed to fetch events. Make sure Google Calendar is set up correctly. Error: ", error);
    return [];
  }
}

module.exports = { chat, confirmAddEvent, confirmDeleteEvent, listTodaysEvents };
