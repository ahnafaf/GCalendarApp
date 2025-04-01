// lib/chatbot.js
// --- IMPORTS ---
import OpenAI from 'openai';
import { DateTime } from 'luxon';
import NodeCache from 'node-cache';
import 'dotenv/config';

// Local Modules
// Import system prompt
import { getAthenaSystemPrompt } from './data/prompts.js';
import { findAvailableSlots as findAvailableSlotsUtil, formatAvailableSlots } from './tools/schedulingUtils.js';
import { listTodaysEvents, suggestEventTime } from './tools/eventHelpers.js';
import { tools, toolFunctions } from './tools/toolIndex.js';
import {
  getOrCreateUser,
  createConversation,
  // getConversation, // Less likely needed directly if using getUserWithLatestConversation
  // getConversationMessages, // Less likely needed directly
  ConversationMessage, // Needed for type hints/checks if any
  addMessageToConversation,
  initializeDatabase,
  getConversationsByUserId,
  getUserWithLatestConversation,
  UserPreference // Import UserPreference model for tool function usage
} from './postgresClient.js';

// Weather client function (if used)
// import { getWeatherData } from './weatherClient.js'; // Example path

// Google APIs library (needed for direct calls in tool functions like delete/update)
// **FIX:** Use import instead of require for consistency if possible (depends on project setup)
// If using ES modules: import { google } from 'googleapis';
// If require is necessary:
const { google } = require('googleapis'); // Keep require if necessary for googleapis

// --- Database Initialization ---
// (Keep the getDatabaseInitPromise function as is)
let dbInitPromise = null;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });



// --- Helper Functions (Formatting & Time) ---
function formatEventTime(eventTime) {
    try {
        const dt = DateTime.fromISO(eventTime);
        if (dt.isValid) {
            return dt.toLocaleString(DateTime.DATETIME_FULL);
        }
        const dateOnly = DateTime.fromISO(eventTime, { zone: 'utc' });
        if (dateOnly.isValid) {
            return dateOnly.toLocaleString(DateTime.DATE_FULL) + " (All day)";
        }
        return eventTime;
    } catch (e) {
        console.warn("Error formatting event time:", eventTime, e);
        return String(eventTime); // Ensure returns string
    }
}

function formatCalendarEvents(events) {
    if (!events) return "No events found or an error occurred.";
    if (!Array.isArray(events)) return "An error occurred processing events.";
    if (events.length === 0) return "No events found for the specified time period.";

    return events.map(event => {
        try {
            const start = DateTime.fromISO(event.start?.dateTime || event.start?.date);
            const end = DateTime.fromISO(event.end?.dateTime || event.end?.date);
            if (!start.isValid || !end.isValid) return `❓ Invalid date found for event: ${event.summary || event.id}`;

            const isAllDay = !event.start?.dateTime;
            // Include the event ID in the formatted output (hidden with a zero-width space for reference)
            let formattedEvent = `📅 ${event.summary || '(No Title)'} [ID:​${event.id}]\n`;
            formattedEvent += `   📆 ${start.toLocaleString(DateTime.DATE_FULL)}\n`;
            if (!isAllDay) {
                formattedEvent += `   🕒 ${start.toLocaleString(DateTime.TIME_SIMPLE)} - ${end.toLocaleString(DateTime.TIME_SIMPLE)}\n`;
            } else {
                formattedEvent += `   🕒 All Day\n`;
            }
            if (event.description) formattedEvent += `   📝 ${event.description}\n`;
            if (event.location) formattedEvent += `   📍 ${event.location}\n`;
            if (event.reminders?.useDefault === false && Array.isArray(event.reminders.overrides)) {
                formattedEvent += `   🔔 Reminders: ${event.reminders.overrides.map(r => `${r.minutes} min`).join(', ')}\n`;
            }
            return formattedEvent.trim(); // Trim each event string
        } catch (mapError) {
            console.error("Error mapping event:", event, mapError);
            return `❓ Error processing event: ${event.summary || event.id}`;
        }
    }).join('\n\n'); // Add space between events
}

// --- Formatting Tool Responses for the LLM ---
function formatToolResponse(functionName, result) {
    try {
        // Explicitly handle null/undefined results first
        if (result == null) {
            console.warn(`Tool ${functionName} returned null or undefined.`);
            return `Tool ${functionName} did not return a result. (Status: FAILED)`;
        }

        // Handle known error shapes returned by tool functions
        if (typeof result === 'string' && result.toLowerCase().startsWith('error:'))
            return `${result} (Status: FAILED)`;
        if (typeof result === 'object' && result.error)
            return `Error executing ${functionName}: ${result.error} (Status: FAILED)`;
        if (typeof result === 'object' && result.success === false)
            return `Tool ${functionName} failed: ${result.message || 'No details.'} (Status: FAILED)`;

        // --- Format successful results ---
        switch (functionName) {
            case 'saveUserPreference':
                return result.success ? `✅ Pref saved: ${result.message} (Status: SUCCESS)` : `❌ Pref fail: ${result.message} (Status: FAILED)`;

            case 'addCalendarEvents':
                if (!Array.isArray(result)) return "Error: Invalid response format from addCalendarEvents. (Status: FAILED)";
                if (result.length === 0) return "No events were processed. (Status: NEUTRAL)";
                return result.map(item => {
                    if (!item) return '❓ Invalid item in result array. (Status: FAILED)';
                    if (item.error) { // Handle explicit errors first (conflict, validation, API)
                        const summary = item.summary || '?';
                        if (item.conflict) {
                            // Include suggestions if available
                            const suggestionText = item.suggestions && item.suggestions.length > 0
                                ? ` Suggested slots: ${item.suggestions.map(s => `${DateTime.fromISO(s.start).toFormat('h:mma')} - ${DateTime.fromISO(s.end).toFormat('h:mma')}`).join(', ')}`
                                : '';
                            return `⚠️ Conflict detected for event "${summary}".${suggestionText} (Status: CONFLICT)`;
                        } else {
                            return `❌ Failed to add event "${summary}": ${item.error} (Status: FAILED)`;
                        }
                    } else if (item.id && item.summary && (item.start?.dateTime || item.start?.date)) { // Assume success if key fields exist
                        try {
                            const startStr = formatEventTime(item.start.dateTime || item.start.date); // Use existing helper
                            return `✅ Event added: "${item.summary}" starting ${startStr}. (ID: ${item.id}) (Status: SUCCESS)`;
                        } catch (e) {
                            console.error("Error formatting success message for added event:", item, e);
                            return `✅ Event added: "${item.summary}" (details unavailable). (ID: ${item.id}) (Status: SUCCESS)`;
                        }
                    } else { // Fallback for unexpected shapes
                        console.warn("Unexpected item shape in addCalendarEvents result:", item);
                        return `❓ Unknown outcome for an event attempt. (Status: UNKNOWN)`;
                    }
                }).join('\n');

            case 'getCalendarEvents':
                if (typeof result === 'string')
                    return `🗓️ Events: ${result} (Status: ${result.toLowerCase().startsWith('error') ? 'FAILED' : 'SUCCESS'})`;
                if (!Array.isArray(result))
                    return "Error: Invalid getCalendarEvents response. (Status: FAILED)";
                return result.length === 0
                    ? "🗓️ No events found. (Status: SUCCESS)"
                    : `🗓️ Found ${result.length} event(s):\n\n${formatCalendarEvents(result)} (Status: SUCCESS)`;

            case 'deleteCalendarEvent':
                return result.success
                    ? `🗑️ Event "${result.summary || result.eventId}" deleted. (Status: SUCCESS)` // Use eventId if summary wasn't fetched/returned
                    : `❌ Failed to delete event ${result.eventId || '?'}: ${result.error || result.message || '?'} (Status: FAILED)`;

            case 'updateCalendarEvent':
                 // Check if result has an ID, indicating success from googleCalendar update function
                if (result && result.id) {
                    return `✏️ Event "${result.summary || eventId}" updated. (ID: ${result.id}) (Status: SUCCESS)`;
                } else {
                    // Handle potential error objects passed back
                    const errorMsg = result?.error || result?.message || JSON.stringify(result);
                    return `❌ Failed to update event: ${errorMsg} (Status: FAILED)`;
                }

            case 'findAvailableSlots':
                if (!Array.isArray(result))
                    return "Error: Invalid findAvailableSlots response. (Status: FAILED)";
                if (result.length === 0)
                    return `🕒 No available slots found matching criteria. (Status: SUCCESS)`;
                // Format slots with success status
                const formattedSlots = result.map(slot =>
                    `${DateTime.fromISO(slot.start).toLocaleString(DateTime.DATETIME_SHORT)} - ${DateTime.fromISO(slot.end).toLocaleString(DateTime.TIME_SIMPLE)}`
                ).join('\n');
                return `🕒 Found ${result.length} available slot(s):\n\n${formattedSlots}\n\n(Status: SUCCESS)`;

            case 'getWeatherForecast':
                return `🌤️ Weather for ${result.location} on ${result.date}: ${result.forecast || 'N/A'} (Status: ${result.forecast && !result.forecast.includes('unavailable') ? 'SUCCESS' : 'PARTIAL'})`;

            case 'deleteCalendarEventsByQuery':
                return result.success
                    ? `🗑️ ${result.message} (Deleted Count: ${result.deletedCount}) (Status: SUCCESS)`
                    : `❌ Failed bulk delete: ${result.message || result.error || '?'} (Status: FAILED)`;

            default:
                // Safely stringify other results with status indicators
                if (typeof result === 'object' && result !== null) {
                    const status = result.success === true ? 'SUCCESS' : (result.success === false ? 'FAILED' : 'UNKNOWN');
                    return `${JSON.stringify(result)} (Status: ${status})`;
                } else {
                    return `${String(result)} (Status: UNKNOWN)`;
                }
        }
    } catch (formatError) {
        console.error(`CRITICAL: Error *within* formatToolResponse for ${functionName}:`, formatError, "Raw result:", result);
        // Return a guaranteed string error message
        return `Internal Error: Failed to format the result for ${functionName}. (Status: ERROR)`;
    }
}

// Helper function to process tool calls
async function processToolCalls(toolCalls, messages, conversationId, userId, accessToken) {
  try {
    console.log(`Processing ${toolCalls.length} tool calls`);
    
    // Use Promise.allSettled for robustness
    const toolPromises = toolCalls.map(async (toolCall) => {
        const toolCallId = toolCall.id;
        const functionName = toolCall.function?.name;
        let toolResponseContent = '';

        try {
            // 1. Basic Validation
            if (!toolCallId || toolCall.type !== 'function' || !functionName) {
                throw new Error(`Invalid tool call structure received: ${JSON.stringify(toolCall)}`);
            }
            if (!toolFunctions[functionName]) {
                throw new Error(`Tool function "${functionName}" is not available.`);
            }

            // 2. Parse Arguments
            let parsedArgs = {};
            try {
                parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (parseError) {
                throw new Error(`Invalid JSON arguments for ${functionName}. Args: ${toolCall.function.arguments}. Error: ${parseError.message}`);
            }

            // 3. Execute Tool Function
            console.log(`Executing tool: ${functionName} (ID: ${toolCallId}) with args:`, parsedArgs);
            const result = await toolFunctions[functionName](parsedArgs, userId, accessToken);
            console.log(`Tool ${functionName} (ID: ${toolCallId}) raw result:`, result);

            // 4. Format Result
            toolResponseContent = formatToolResponse(functionName, result);
            console.log(`Tool ${functionName} (ID: ${toolCallId}) formatted response:`, toolResponseContent);

            // Add a success indicator to the tool response for context tracking
            let successIndicator = "";
            if (functionName === 'deleteCalendarEvent' && result.success) {
                successIndicator = "\n\n[✅ Event successfully deleted]";
            } else if (functionName === 'addCalendarEvent' && result.id) {
                successIndicator = "\n\n[✅ Event successfully added]";
            } else if (functionName === 'updateCalendarEvent' && result.id) {
                successIndicator = "\n\n[✅ Event successfully updated]";
            }
            
            // Add success indicator to the response if applicable
            return {
                status: 'fulfilled',
                value: { role: "tool", content: toolResponseContent + successIndicator, tool_call_id: toolCallId }
            };

        } catch (error) {
            console.error(`ERROR processing tool call ${toolCallId} (${functionName || '?'}):`, error);
            toolResponseContent = `Error processing tool ${functionName || '?'}: ${error.message || error}`;

            return {
                status: 'rejected',
                reason: error,
                value: { role: "tool", content: toolResponseContent, tool_call_id: toolCallId }
            };
        }
    });

    const settledToolResults = await Promise.allSettled(toolPromises);
    
    const toolResponses = settledToolResults.map(settledResult => {
        if (settledResult.status === 'fulfilled') {
            return settledResult.value.value;
        } else {
            return settledResult.reason.value;
        }
    }).filter(Boolean);

    // Add tool responses to history
    messages.push(...toolResponses);

    // Store tool responses in DB (best effort, loop through results)
    if (conversationId) {
        try {
            // Use Promise.all to store all tool responses in parallel
            await Promise.all(toolResponses.map(toolMsg => 
                addMessageToConversation(conversationId, "tool", toolMsg.content, { tool_call_id: toolMsg.tool_call_id })
                .catch(dbError => {
                    console.error(`DB Error storing tool response ${toolMsg.tool_call_id}:`, dbError);
                    // Don't throw, allow other messages to be stored
                    return null;
                })
            ));
            console.log(`Stored ${toolResponses.length} tool responses in database`);
        } catch (batchError) {
            console.error(`Error in batch storing tool responses:`, batchError);
            // Individual errors are already caught in the map function
            // This catch is for errors outside the individual promises
        }
    }
    return toolResponses;

  } catch (error) { // Catch errors from the entire runConversation flow
    console.error("FATAL Error in runConversation pipeline:", error);
    // Log history specifically for 400 errors to help debug sequence issues
    if (error.status === 400) {
        console.error("Message history at time of 400 error:", JSON.stringify(messages, null, 2));
    }
    responseCallback?.({ type: 'error', content: `An error occurred: ${error.message || "Check server logs."}` });
    throw error; // Re-throw
  }
}

async function runConversation(messages, userInput, conversationId = null, userId = 'default', accessToken = null, responseCallback = null) {
  console.log(`Running conversation ${conversationId} for user ${userId}. AccessToken: ${!!accessToken}`);
  const model = "gpt-4o"; // Use a capable model for reasoning
  const maxToolIterations = 5; // Limit sequential tool calls to prevent infinite loops

  try {
      let currentMessages = [...messages]; // Use a mutable copy for this turn
      let iteration = 0;
      let finalContent = null; // Stores the final text response for the user

      // Helper to filter messages (Keep existing filterMessagesForAPI)
      const filterMessagesForAPI = (msgs) => {
          // ... (keep existing implementation) ...
           if (!msgs || !Array.isArray(msgs)) {
             console.error("Invalid messages array passed to filter:", msgs);
             return []; // Return empty array to prevent further errors
           }

           // Create a copy to avoid modifying the original
           const filteredMsgs = [...msgs];

           // Track tool call IDs from assistant messages
           const validToolCallIds = new Set();

           // First pass: collect all valid tool call IDs from assistant messages
           filteredMsgs.forEach(msg => {
             if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
               msg.tool_calls.forEach(toolCall => {
                 if (toolCall.id) {
                   validToolCallIds.add(toolCall.id);
                 }
               });
             }
           });

           // Second pass: filter out invalid tool messages
           const result = filteredMsgs.filter((msg, index) => {
             // Keep all non-tool messages
             if (msg.role !== 'tool') return true;

             // For tool messages, check if they have a valid tool_call_id
             if (!msg.tool_call_id) {
               console.warn(`Filtering TOOL message with missing tool_call_id at index ${index}`);
               return false;
             }

             // Check if this tool message has a corresponding tool call from an assistant
             if (!validToolCallIds.has(msg.tool_call_id)) {
               console.warn(`Filtering TOOL message not correctly preceded by assistant tool_call. Index=${index}, ToolCallID=${msg.tool_call_id}`);
               return false;
             }
             // Also ensure content exists for tool messages
             if (msg.content == null || msg.content === '') {
                  console.warn(`Filtering TOOL message with missing/empty content. Index=${index}, ToolCallID=${msg.tool_call_id}`);
                  return false;
             }

             return true;
           });

            // Final sanity check: Ensure alternating user/assistant/tool sequence where appropriate
           // Remove consecutive messages of the same role (except 'tool' which follows 'assistant')
           const finalFiltered = [];
           for (let i = 0; i < result.length; i++) {
              const currentMsg = result[i];
              const prevMsg = finalFiltered[finalFiltered.length - 1];

              if (prevMsg && currentMsg.role === prevMsg.role && currentMsg.role !== 'tool') {
                  console.warn(`Filtering consecutive message of role ${currentMsg.role} at index ${i}`);
                  continue; // Skip adding the consecutive message
              }
              // Ensure tool message follows an assistant message (loosely, filter handles specific ID matching)
              // if (currentMsg.role === 'tool' && (!prevMsg || prevMsg.role !== 'assistant')) {
              //     console.warn(`Filtering TOOL message not following an assistant message at index ${i}`);
              //     continue; // Skip adding the out-of-place tool message
              // }

              finalFiltered.push(currentMsg);
           }


           console.log(`Filtered ${msgs.length - finalFiltered.length} invalid/malformed messages`);
           return finalFiltered;
      };


      // --- Main Reasoning Loop ---
      while (iteration < maxToolIterations) {
          iteration++;
          console.log(`\n--- Conversation Turn ${iteration}/${maxToolIterations} ---`);

          const messagesForAPI = filterMessagesForAPI(currentMessages);
          if (messagesForAPI.length === 0) {
              console.error("Message history became empty during filtering.");
              throw new Error("Internal error: Cannot proceed with empty message history.");
          }

          // ***** DEBUG LOG *****
          console.log(`Making API call #${iteration} with model: ${model}`);
          console.log(`Message History (Length: ${messagesForAPI.length}):`);
          messagesForAPI.forEach((msg, index) => {
              console.log(`  [${index}] Role: ${msg.role}`);
              if (msg.content) console.log(`      Content: ${String(msg.content).substring(0, 100)}...`); // Truncate, ensure string
              if (msg.tool_calls) console.log(`      Tool Calls: ${JSON.stringify(msg.tool_calls.map(tc => tc.id + ":" + tc.function?.name))}`);
              if (msg.tool_call_id) console.log(`      Tool Call ID: ${msg.tool_call_id}`);
          });
          console.log(`--- End API Call #${iteration} History --- \n`);
          // ***** END DEBUG LOG *****

          // --- Call OpenAI ---
          const response = await openai.chat.completions.create({
              model: model,
              messages: messagesForAPI,
              tools: tools, // Make tools available on every turn
              tool_choice: "auto", // Let the model decide if it needs tools
          });

          const responseMessage = response.choices[0].message;

          // --- Add Assistant Message to History (Local & DB) ---
          currentMessages.push(responseMessage);
          if (conversationId) {
              try {
                  await addMessageToConversation(
                      conversationId,
                      "assistant",
                      responseMessage.content || null, // Store null if no content 
                      { tool_calls: responseMessage.tool_calls || null } // Always pass an object, even if tool_calls is null
                  );
              } catch (dbError) {
                  console.error(`DB Error storing assistant message (iteration ${iteration}):`, dbError);
                  // Continue even if DB store fails for this message
              }
          }

          // --- Check for Tool Calls ---
          const assistantToolCalls = responseMessage.tool_calls;

          if (assistantToolCalls && assistantToolCalls.length > 0) {
              console.log(`Assistant requested ${assistantToolCalls.length} tool call(s) in iteration ${iteration}:`, JSON.stringify(assistantToolCalls.map(tc => ({ id: tc.id, name: tc.function?.name }))));

              // Inform client we're processing (if streaming)
              responseCallback?.({ type: 'processing', content: `Thinking (step ${iteration})...` });
              await new Promise(resolve => setTimeout(resolve, 200)); // Small delay for UI update

              // --- Process the requested tools ---
              // processToolCalls adds the tool responses to currentMessages and stores them in DB
              const toolResponses = await processToolCalls(assistantToolCalls, currentMessages, conversationId, userId, accessToken);

              // Check if any tool call failed critically, maybe stop early? (Optional enhancement)
              const hasCriticalFailure = toolResponses.some(tr => tr.content?.includes('(Status: FAILED)'));
              if (hasCriticalFailure) {
                   console.warn(`Critical tool failure detected in iteration ${iteration}. LLM will be informed.`);
                   // Let the loop continue, LLM should see the failure message
              }

              // --- Loop continues: Send tool results back to LLM ---

          } else {
              // --- No Tool Calls: This is the final response ---
              console.log(`No tool calls requested in iteration ${iteration}. Final response generated.`);
              finalContent = responseMessage.content ?? ""; // Use nullish coalescing for safety
              break; // Exit the loop
          }
      } // End of while loop

      // --- Handle loop exit ---
      if (iteration >= maxToolIterations) {
          console.warn(`Maximum tool iterations (${maxToolIterations}) reached. Returning last generated content or error.`);
          // Attempt to return the last content generated, even if it wasn't intended as final
          const lastAssistantMsg = currentMessages[currentMessages.length - 1];
          if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content) {
               finalContent = lastAssistantMsg.content;
          } else {
              finalContent = "I seem to be stuck in a loop trying to process that request. Could you try rephrasing it?";
              responseCallback?.({ type: 'error', content: finalContent });
          }
      }

      if (finalContent === null) {
          console.error("Loop finished without generating final content.");
          finalContent = "Sorry, I wasn't able to generate a final response after processing your request.";
          responseCallback?.({ type: 'error', content: finalContent });
      }

      // --- Stream the FINAL response ---
      if (responseCallback && finalContent) {
          // Send the final content chunk by chunk if desired, or as one piece
          // Simplified: Send as one piece after the loop
           responseCallback({ type: 'content', content: finalContent });
           await new Promise(resolve => setTimeout(resolve, 50)); // Short delay before end
           responseCallback({ type: 'end' });

      } else if (!responseCallback && finalContent) {
          // Non-streaming mode: return the final content
          return finalContent;
      } else if (!finalContent) {
           // Ensure something is returned/sent even if content is empty/null
           if (responseCallback) {
                responseCallback({ type: 'content', content: '' }); // Send empty content
                responseCallback({ type: 'end' });
           }
           return "";
      }

      console.log("Final response content:", finalContent);
      // The function implicitly returns finalContent if not streaming, or handles streaming via callback
      return finalContent; // Return for non-streaming case


  } catch (error) { // Catch errors from the entire runConversation flow
      console.error("FATAL Error in runConversation pipeline:", error);
      if (error.status === 400) {
          console.error("Message history at time of 400 error:", JSON.stringify(messages, null, 2)); // Log initial history state
      }
      // Ensure error is propagated to the client
      const errorMessage = `An error occurred: ${error.message || "Check server logs."}`;
      responseCallback?.({ type: 'error', content: errorMessage });
      // Throw or return error string based on expected caller behavior
      // throw error; // Re-throwing might be better for chat() function to catch
      return errorMessage; // Or return error string for non-streaming
  }
}



// --- Main Chat Entry Point ---
async function chat(userInput, userId = 'default', accessToken = null, streamCallback = null, startNewConversation = false) { // Added startNewConversation flag
  console.log(`Chat request: User=${userId}, Input="${userInput}", StartNew=${startNewConversation}`); // Log the flag
  if (!userId || userId === 'default') {
    streamCallback?.({ type: 'error', content: "User ID missing." });
    return "Error: User ID required.";
  }
   if (!userInput?.trim()) {
       streamCallback?.({ type: 'info', content: "Enter a message." }); return "";
   }

   // Send 'start' signal immediately for streaming
   streamCallback?.({ type: 'start' });

  try {
    const tokens = accessToken ? { access_token: accessToken } : null;
    let user;
    let conversation;
    let historyMessages = []; // Formatted history for OpenAI API

    // --- Load User & Conversation History ---
    if (!startNewConversation) {

    try {
        // **FIX:** Use the optimized query
        user = await getUserWithLatestConversation(userId);

        if (user?.Conversations?.length > 0) {
            conversation = user.Conversations[0];
            console.log(`Found active conversation ${conversation.conversation_id}`);
            if (conversation.ConversationMessages?.length > 0) {
                // Sort ASCENDING for API
                conversation.ConversationMessages.sort((a, b) => a.sequence_number - b.sequence_number);

                // **CRITICAL FIX: Robust History Mapping**
                historyMessages = conversation.ConversationMessages.map((msg, index, allMsgs) => {
                    const messageObject = { role: msg.role };

                    // Content: Mandatory unless assistant w/ tool calls
                    if (msg.content != null) {
                        messageObject.content = msg.content;
                    } else if (msg.role === 'assistant' && msg.tool_calls) {
                         // Check if tool_calls field actually contains valid calls
                         let validToolCallsExist = false;
                         if (msg.tool_calls.tool_calls && Array.isArray(msg.tool_calls.tool_calls) && msg.tool_calls.tool_calls.length > 0) {
                              validToolCallsExist = msg.tool_calls.tool_calls.some(tc => tc.id && tc.function?.name);
                         } else if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) { // Handle direct array storage possibility
                              validToolCallsExist = msg.tool_calls.some(tc => tc.id && tc.function?.name);
                         }
                         if (validToolCallsExist) {
                             messageObject.content = null; // API expects null/"" if only tool_calls
                         } else {
                             messageObject.content = ""; // Treat as empty content if tool_calls invalid/empty
                         }
                    } else {
                        messageObject.content = ""; // Default empty string
                    }


                    // Tool Calls (Assistant): Extract the array
                    if (msg.role === 'assistant' && msg.tool_calls) {
                        let toolCallsArray = null;
                        // Case 1: Stored as { tool_calls: [...] }
                        if (msg.tool_calls.tool_calls && Array.isArray(msg.tool_calls.tool_calls)) {
                            toolCallsArray = msg.tool_calls.tool_calls;
                        // Case 2: Stored as [...] (fallback)
                        } else if (Array.isArray(msg.tool_calls)) {
                            toolCallsArray = msg.tool_calls;
                        }

                        // Add ONLY if valid and non-empty
                        if (toolCallsArray && toolCallsArray.length > 0) {
                             const validToolCalls = toolCallsArray.filter(tc => tc.id && tc.type === 'function' && tc.function?.name);
                             if (validToolCalls.length > 0) {
                                 messageObject.tool_calls = validToolCalls;
                                 // Re-ensure content is null if ONLY tool calls
                                 if (messageObject.content === "" && validToolCalls.length === toolCallsArray.length) {
                                      messageObject.content = null;
                                 }
                             } else {
                                console.warn(`DB message ${msg.message_id} had tool_calls object but no valid calls.`);
                                // Don't add empty/invalid tool_calls array to API message
                             }
                        }
                    }

                    // Tool Call ID (Tool): Extract the ID string
                    if (msg.role === 'tool') {
                        let toolId = null;
                         // Case 1: Stored as { tool_call_id: "..." }
                        if (typeof msg.tool_call_id === 'object' && msg.tool_call_id !== null && msg.tool_call_id.tool_call_id) {
                            toolId = msg.tool_call_id.tool_call_id;
                         // Case 2: Stored as "..." (fallback)
                        } else if (typeof msg.tool_call_id === 'string') {
                            toolId = msg.tool_call_id;
                        }

                        // Tool message MUST have ID and content to be valid for API
                        if (toolId && messageObject.content != null) { // Content comes from formatToolResponse
                            messageObject.tool_call_id = toolId;
                        } else {
                            console.warn(`Filtering invalid TOOL message (missing ID or content): DB_ID=${msg.message_id}`);
                            return null; // Filter out invalid tool message
                        }
                    }

                    // API Validation Check: tool role must follow assistant role with tool_calls
                    // **REMOVED STRICT PRECEDING CHECK** - Relying on filterMessagesForAPI inside runConversation
                    // if (messageObject.role === 'tool') {
                    //     const prevMappedMessage = index > 0 ? historyMessages[index - 1] : null; // Check the *mapped* previous message
                    //     if (!prevMappedMessage || prevMappedMessage.role !== 'assistant' || !prevMappedMessage.tool_calls || !prevMappedMessage.tool_calls.some(tc => tc.id === messageObject.tool_call_id)) {
                    //          console.warn(`Filtering TOOL message not correctly preceded by assistant tool_call. DB_ID=${msg.message_id}, ToolCallID=${messageObject.tool_call_id}`);
                    //          return null; // Filter out orphaned/mismatched tool message
                    //     }
                    // }
                    // Filter out assistant messages that end up empty (no content, no valid tool calls)
                    if (messageObject.role === 'assistant' && messageObject.content == null && !messageObject.tool_calls) {
                         console.warn(`Filtering empty ASSISTANT message. DB_ID=${msg.message_id}`);
                        return null;
                    }

                    return messageObject;

                }).filter(Boolean); // Remove nulls from filtering

                console.log(`Loaded and mapped ${historyMessages.length} valid messages from history.`);
                // DEBUG: Log the final history being sent, ONLY FOR DEBUGGING SENSITIVE DATA
                // console.log("Final history for API:", JSON.stringify(historyMessages, null, 2));
            } else {
                 console.log(`Conversation ${conversation.conversation_id} has no messages.`);
            }
        } else {
             console.log(`No existing user/conversation found for ${userId}. Creating.`);
             if (!user) { // Ensure user exists
                 const isEmail = userId.includes('@');
                 const email = isEmail ? userId : `${userId}@example.com`;
                 const provider = isEmail ? 'email' : 'system'; // Adjust as needed
                 user = await getOrCreateUser(email, provider, userId, userId);
             }
        }
    } catch (error) {
        console.error("CRITICAL: Error loading user/history:", error);
        try { // Attempt recovery
            const isEmail = userId.includes('@');
            const email = isEmail ? userId : `${userId}@example.com`;
            user = await getOrCreateUser(email, isEmail ? 'email' : 'system', userId, userId);
        } catch (userError) {
            console.error("CRITICAL: Failed user recovery:", userError);
            streamCallback?.({ type: 'error', content: "Failed to load user profile." });
            return "Error: Could not load user profile.";
        }
        conversation = null; historyMessages = []; // Reset state
    }
    } else { // Handle startNewConversation = true
        console.log("Starting a new conversation as requested.");
        // Ensure user object is loaded, even if history loading was skipped
        if (!user) {
            try {
                const isEmail = userId.includes('@');
                const email = isEmail ? userId : `${userId}@example.com`;
                user = await getOrCreateUser(email, isEmail ? 'email' : 'system', userId, userId);
            } catch (userError) {
                console.error("CRITICAL: Failed user creation/retrieval when starting new conversation:", userError);
                streamCallback?.({ type: 'error', content: "Failed to load user profile for new chat." });
                return "Error: Could not load user profile.";
            }
        }
        // Explicitly clear conversation and history
        conversation = null;
        historyMessages = [];
    }

    // --- Create Conversation if needed & Add System Prompt ---
    if (!conversation) {
      try {
        conversation = await createConversation(user.user_id);
        console.log(`Created new conversation ${conversation.conversation_id}. Preparing system prompt.`);
        // Prepare system prompt (will be added later after checking for prefs)
        let systemPromptContent = getAthenaSystemPrompt(); 

        // Store the base system prompt in DB first
        await addMessageToConversation(conversation.conversation_id, "system", systemPromptContent);

        // Check for user preferences immediately after getting the base prompt
        if (user.UserPreference?.preferences_data && Object.keys(user.UserPreference.preferences_data).length > 0) {
            try {
                const prefsData = user.UserPreference.preferences_data;
                let prefsString = "\n\nUser Preferences Context (Consider when relevant):\n";
                prefsString += JSON.stringify(prefsData, null, 2);
                systemPromptContent += prefsString; // Append preferences to the main prompt
                console.log("Appended user preferences context to system prompt.");
            } catch (prefsError) { console.error("Error adding preferences context:", prefsError); }
        }

        // Add the potentially combined system prompt to the START of the local history array
        historyMessages.unshift({ role: "system", content: systemPromptContent });

      } catch (createError) {
         console.error("CRITICAL: Failed to create conversation:", createError);
         streamCallback?.({ type: 'error', content: "Failed to start chat session." });
         return "Error: Could not start chat session.";
      }
    }

    // --- Prepare messages for API ---
    const currentMessages = [...historyMessages]; // Start with history (incl sys prompt if new)

    // Add current user input
    const userMessageForAPI = { role: "user", content: userInput };
    currentMessages.push(userMessageForAPI);

    // Store user message in DB reliably
     try {
        await addMessageToConversation(conversation.conversation_id, "user", userInput);
     } catch(dbError) {
         console.error("Error storing user message:", dbError);
         // Non-critical? Log and continue.
     }

    // --- Run the conversation logic ---
    const response = await runConversation(
      currentMessages,
      userInput,
      conversation.conversation_id,
      user.user_id, // Pass UUID
      accessToken,
      streamCallback
    );

    // If not streaming, return the response.
    // If streaming, runConversation handles sending via callback, so we might just return void or true/false
    if (!streamCallback) {
        return response; // Final text response for non-streaming
    } else {
        // Streaming handled by runConversation's callbacks
         // Ensure 'end' was sent if an error occurred within runConversation before completion
         // (runConversation should ideally handle sending 'end' or 'error' in most cases)
         return; // Indicate success or simply complete for streaming
    }

  } catch (error) {
    console.error("Error in main chat function:", error);
    const errorMessage = `An unexpected error occurred: ${error.message || "Please try again."}`;
    // Ensure 'end' or 'error' is sent in case of top-level failure
    streamCallback?.({ type: 'error', content: errorMessage });
    streamCallback?.({ type: 'end' }); // Send end signal after error in streaming mode
    return errorMessage; // Return error string for non-streaming
  }
}


// --- Exports ---
export {
    chat as default,
    listTodaysEvents,
    suggestEventTime,
    getConversationsByUserId
};