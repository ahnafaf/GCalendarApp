
import { DateTime } from 'luxon';

function formatEventTime(eventTime) {
    // ... (Keep implementation from chatbot.js) ...
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
            // Check if the event has a priority property and display it
            if (event.priority) {
                formattedEvent += `   🚩 Priority: ${event.priority}\n`;
            }
            // Check if the event has tags and display them
            if (event.tags && Array.isArray(event.tags) && event.tags.length > 0) {
                formattedEvent += `   🏷️ Tags: ${event.tags.join(', ')}\n`;
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
                            let successMsg = `✅ Event added: "${item.summary}" starting ${startStr}. (ID: ${item.id})`;
                            // Add priority information if available
                            if (item.priority) {
                                successMsg += ` [Priority: ${item.priority}]`;
                            }
                            successMsg += " (Status: SUCCESS)";
                            return successMsg;
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
                
                // More robust handling of different response structures
                let events = [];
                
                if (Array.isArray(result)) {
                    // Direct array of events
                    events = result;
                } else if (result && typeof result === 'object') {
                    if (Array.isArray(result.events)) {
                        // Object with events array property
                        events = result.events;
                    } else if (result.success === false) {
                        // Error object with success: false
                        return `Error: ${result.error || 'Unknown error retrieving calendar events'} (Status: FAILED)`;
                    }
                } else {
                    return "Error: Invalid getCalendarEvents response format. (Status: FAILED)";
                }
                
                // Process the events array
                if (events.length === 0) {
                    return "🗓️ No events found. (Status: SUCCESS)";
                } else {
                    const priorityInfo = events.some(e => e.priority) ? ' (includes priority information)' : '';
                    return `🗓️ Found ${events.length} event(s)${priorityInfo}:\n\n${formatCalendarEvents(events)} (Status: SUCCESS)`;
                }

            case 'deleteCalendarEvent':
                return result.success
                    ? `🗑️ Event "${result.summary || result.eventId}" deleted. (Status: SUCCESS)` // Use eventId if summary wasn't fetched/returned
                    : `❌ Failed to delete event ${result.eventId || '?'}: ${result.error || result.message || '?'} (Status: FAILED)`;

            case 'updateCalendarEvent':
                 // Check if result has an ID, indicating success from googleCalendar update function
                if (result && result.id) {
                    let successMsg = `✏️ Event "${result.summary || result.id}" updated. (ID: ${result.id})`;
                    // Add priority information if available
                    if (result.priority) {
                        successMsg += ` [Priority: ${result.priority}]`;
                    }
                    successMsg += " (Status: SUCCESS)";
                    return successMsg;
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

// Export the functions
export { formatEventTime, formatCalendarEvents, formatToolResponse };
