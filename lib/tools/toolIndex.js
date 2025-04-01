// lib/tools/index.js
// Purpose: Defines the tools (schema) available to the LLM and maps them
//          to their corresponding implementation functions. Also includes
//          helper functions for processing tool calls.

// --- IMPORTS ---
import { DateTime } from 'luxon';
import { google } from 'googleapis'; // Used for get/update event before calling specific functions

// Import from googleCalendar.js
import {
    createOAuth2Client,
    getCalendarEvents as fetchGCalendarEventsInternal, // Renamed to avoid conflict
    addCalendarEvent as addGCalendarEventInternal,
    deleteCalendarEvent as deleteGCalendarEventInternal,
    updateCalendarEvent as updateGCalendarEventInternal
} from '../../googleCalendar.js';

// Import from redisClient.js
import {
    getCachedEventsForDateRange,
    cacheEventsForDateRange,
    invalidateDateRangeCache,
} from '../redisClient.js';

// Import from cacheService.js
import {
    getCachedEvents,
    invalidateCache
} from '../services/cacheService.js';

// Import from schedulingUtils.js
import { findAvailableSlots } from './schedulingUtils.js';

// Import from checkForConflicts.js
import { checkForConflicts } from './checkForConflicts.js';

// Import from formatters.js
import { formatEventTime, formatCalendarEvents, formatToolResponse } from './formatters.js';

// Import from postgresClient.js
import {
    UserPreference, // Assuming models are exported from postgresClient
    addMessageToConversation // Needed by processToolCalls - *This ideally belongs in databaseService*
} from '../postgresClient.js';



// --- Tool Schema Definitions (for OpenAI) ---
const tools = [
    {
        type: "function",
        function: {
            name: "saveUserPreference",
            description: "Save a user preference for future reference. Use this when you identify important user preferences (like preferred meeting times, locations, activity types, scheduling constraints) that should be remembered long-term.",
            parameters: {
                type: "object",
                properties: {
                    category: { type: "string", description: "The broad category of the preference (e.g., 'scheduling', 'location', 'activity')." },
                    key: { type: "string", description: "The specific preference key within the category (e.g., 'preferredMeetingHours', 'defaultCity', 'favoriteWorkout')." },
                    value: { 
                        oneOf: [
                            { type: "string" },
                            { type: "number" },
                            { type: "boolean" },
                            { type: "array", items: {} },
                            { type: "object" }
                        ],
                        description: "The value of the preference (e.g., '9am-12pm', 'New York', 'running'). Can be string, number, boolean, array, or object." 
                    },
                    context: { type: "string", description: "Optional: Additional context about when or why this preference applies (e.g., 'work meetings', 'weekends')." },
                },
                required: ["category", "key", "value"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "addCalendarEvents",
            description: "Creates one or more new events directly in the user's primary Google Calendar based on their request. Extracts details like title, location, and resolves start/end times (using current time context for relative references like 'tomorrow 4pm') into absolute ISO 8601 format. Assumes a 1-hour duration if not specified. Checks for conflicts before adding.",
            parameters: {
                type: "object",
                properties: {
                    events: {
                        type: "array",
                        description: "An array of one or more event objects to create.",
                        items: {
                            type: "object",
                            properties: {
                                summary: { type: "string", description: "The title/summary of the event (e.g., 'Meeting with Clyde')." },
                                start: { type: "string", description: "The start date and time of the event in STRICT ISO 8601 format including timezone offset (e.g., '2025-04-01T16:00:00-07:00'). Resolve relative times (like 'tomorrow 4pm') based on current time context before calling." },
                                end: { type: "string", description: "The end date and time of the event in STRICT ISO 8601 format including timezone offset (e.g., '2025-04-01T17:00:00-07:00'). Resolve relative times; assume 1hr duration from start if end time is not specified." },
                                description: { type: "string", description: "Optional description or notes for the event." },
                                location: { type: "string", description: "Optional location for the event (e.g., 'Starbucks Main St', 'Zoom Link')." },
                                reminders: { type: "array", items: { type: "number" }, description: "Optional reminder times in minutes before the event start (e.g., [10, 30])." },
                            },
                            required: ["summary", "start", "end"],
                        },
                    },
                },
                required: ["events"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "getCalendarEvents",
            description: "Retrieves events from the user's primary Google Calendar within a specified date range.",
            parameters: {
                type: "object",
                properties: {
                    start_date: { type: "string", description: "The start date/time for the query range in ISO 8601 format (e.g., '2025-04-01T00:00:00Z' or '2025-04-01')." },
                    end_date: { type: "string", description: "The end date/time for the query range in ISO 8601 format (e.g., '2025-04-02T00:00:00Z' or '2025-04-02')." },
                },
                required: ["start_date", "end_date"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "deleteCalendarEvent",
            description: "Deletes a specific event from the user's primary Google Calendar using its unique event ID. Retrieves event details first to invalidate specific cache range.",
            parameters: {
                type: "object",
                properties: {
                    eventId: {
                        type: "string",
                        description: "The unique ID of the event to delete (e.g., '8ut3a6eol1ov5ovv23v85osssg'). The user might provide the event title/time, use getCalendarEvents first if ID is unknown."
                    }
                },
                required: ["eventId"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "updateCalendarEvent",
            description: "Updates details (like time, title, location, description) of an existing event in the user's primary Google Calendar using its ID.",
            parameters: {
                type: "object",
                properties: {
                    eventId: {
                        type: "string",
                        description: "The unique ID of the event to update (e.g., '8ut3a6eol1ov5ovv23v85osssg'). The user might provide the event title/time, use getCalendarEvents first if ID is unknown."
                    },
                    updates: {
                        type: "object",
                        properties: {
                            summary: { type: "string", description: "New title/summary for the event." },
                            description: { type: "string", description: "New description for the event." },
                            location: { type: "string", description: "New location for the event." },
                            start: { type: "string", description: "New start time in ISO 8601 format (e.g., '2025-04-01T16:30:00-07:00')." },
                            end: { type: "string", description: "New end time in ISO 8601 format (e.g., '2025-04-01T17:00:00-07:00')." }
                            // Note: Add reminders update if needed/implemented
                        },
                        description: "Object containing AT LEAST ONE field to update. Include only fields that are changing.",
                        minProperties: 1 // Ensure at least one update is provided
                    }
                },
                required: ["eventId", "updates"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "findAvailableSlots",
            description: "Finds multiple available time slots in the user's calendar suitable for scheduling a new event. Considers existing events.",
            parameters: {
                type: "object",
                properties: {
                    duration: { type: "number", description: "Required duration of the event in minutes (e.g., 30, 60)." },
                    startDate: { type: "string", description: "The start date/time to search from, in ISO 8601 format. Defaults to the current time if not provided." },
                    endDate: { type: "string", description: "The end date/time to search until, in ISO 8601 format. Defaults to 7 days from startDate if not provided." },
                    timePreference: { type: "string", enum: ["morning", "afternoon", "evening", "any"], description: "Optional preferred time of day (defaults to 'any'). Morning (~9am-12pm), Afternoon (~12pm-5pm), Evening (~5pm-9pm)." },
                    activity: { type: "string", description: "Optional: The type of activity being scheduled (e.g., 'meeting', 'workout', 'call') to potentially influence suggestions or check constraints." },
                },
                required: ["duration"], // Only duration is strictly required, others can have defaults.
            },
        },
    },
    {
        type: "function",
        function: {
            name: "getWeatherForecast",
            description: "Gets the weather forecast for a specific location and date.",
            parameters: {
                type: "object",
                properties: {
                    location: { type: "string", description: "The city and state, or zip code for the weather forecast (e.g., 'San Francisco, CA', '94107')." },
                    date: { type: "string", description: "The date for the forecast in ISO 8601 format (YYYY-MM-DD). Defaults to today if not specified." }
                },
                required: ["location"],
            },
        }
    },
    {
        type: "function",
        function: {
            name: "deleteCalendarEventsByQuery",
            description: "Deletes multiple calendar events within a specified date range that match a search query in their title/summary. Use with caution.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query to match against event summaries (e.g., 'gym', 'meeting with project X'). Case-insensitive."
                    },
                    start_date: { type: "string", description: "The start date/time for the search range in ISO 8601 format (e.g., '2025-04-01'). Required." },
                    end_date: { type: "string", description: "The end date/time for the search range in ISO 8601 format (e.g., '2025-04-30'). Required." },
                },
                required: ["query", "start_date", "end_date"],
            },
        },
    },
];


// --- Tool Function Implementations ---
// Maps tool names (from schema) to the actual functions that execute them.
const toolFunctions = {
    saveUserPreference: async (args, userId = 'default', accessToken = null) => {
        // Accessing UserPreference model directly - ideally use databaseService
        if (!userId || userId === 'default') return { success: false, message: "Error: User ID is missing." };
        try {
            // **Requires UserPreference model to be imported**
            let userPref = await UserPreference.findOne({ where: { user_id: userId } });
            if (!userPref) userPref = await UserPreference.create({ user_id: userId, preferences_data: {} });

            const { category, key, value, context } = args;
            // Basic validation
            if (!category || !key || value === undefined) {
                 return { success: false, message: "Error: Missing required fields (category, key, value) for preference." };
            }

            const prefsData = userPref.preferences_data || {};
            if (!prefsData[category]) prefsData[category] = {};
            prefsData[category][key] = value; // Overwrite existing value simply
            // Handle context separately if provided
            if (context !== undefined) { // Allow empty string for context
                const contextKey = `${category}_context`;
                if (!prefsData[contextKey]) prefsData[contextKey] = {};
                prefsData[contextKey][key] = context;
            }

            await userPref.update({ preferences_data: prefsData });
            console.log(`Preference saved for user ${userId}: ${category}.${key}`);
            return { success: true, message: `Preference saved: ${category}.${key} = ${JSON.stringify(value)}` };
        } catch (error) {
            console.error(`Error saving preference for user ${userId}:`, error);
            return { success: false, message: `Failed to save preference: ${error.message}` };
        }
    },

    addCalendarEvents: async (args, userId = 'default', accessToken = null) => {
        // Uses imported addGCalendarEventInternal, checkForConflicts, invalidateCache
        if (!accessToken) return { error: "User not authenticated.", success: false }; // Return error object
        const tokens = { access_token: accessToken };
        const { events } = args;
        if (!Array.isArray(events) || events.length === 0) return { message: "No event data provided.", success: false };

        const results = [];
        const affectedDateRanges = [];

        for (const event of events) {
            if (!event.summary || !event.start || !event.end) {
                results.push({ summary: event.summary || '?', error: "Missing required fields (summary, start, end).", success: false });
                continue;
            }
            try {
                const startDt = DateTime.fromISO(event.start);
                const endDt = DateTime.fromISO(event.end);
                if (!startDt.isValid || !endDt.isValid) throw new Error('Invalid date format');
                if (startDt >= endDt) throw new Error('Start time must be before end time');
            } catch (e) {
                results.push({ summary: event.summary, error: `Invalid date format or logic: ${e.message}. Use ISO 8601 format.`, success: false });
                continue;
            }

            try {
                 // **Requires checkForConflicts function to be available**
                const conflictCheckResult = await checkForConflicts(tokens, event.start, event.end);
                if (conflictCheckResult.conflicts) {
                    console.warn(`Conflict detected for event: ${event.summary}`);
                    results.push({
                        summary: event.summary,
                        conflict: true,
                        suggestions: conflictCheckResult.suggestions || [], // Pass suggestions back
                        error: conflictCheckResult.error || `Event conflicts with existing schedule.`, // Include error if any from check
                        success: false
                    });
                } else {
                    // **Requires addGCalendarEventInternal function**
                    const addedEvent = await addGCalendarEventInternal(
                        tokens,
                        event.summary,
                        event.start,
                        event.end,
                        event.description,
                        event.location,
                        event.reminders
                    );
                    // Assuming addGCalendarEventInternal returns the created event object on success
                    results.push({ ...addedEvent, success: true }); // Add success flag
                    affectedDateRanges.push({ start: event.start, end: event.end });
                    console.log(`Event added: ${event.summary}`);
                }
            } catch (addError) {
                console.error(`Error adding event "${event.summary}" during conflict check or API call:`, addError);
                results.push({ summary: event.summary, error: `Failed to process event: ${addError.message}`, success: false });
            }
        }

        // Invalidate cache for all ranges where events were successfully added
        // **Requires invalidateCache function**
        for (const range of affectedDateRanges) {
            try { await invalidateCache(tokens, range.start, range.end); }
            catch (cacheError) { console.error("Error invalidating cache after add:", cacheError); }
        }

        return results; // Return array of result objects (with success flags/errors)
    },

    getCalendarEvents: async (args, userId = 'default', accessToken = null) => {
        // Uses getCachedEventsForDateRange -> fetchGCalendarEventsInternal
        if (!accessToken) return "Error: User not authenticated."; // Return error string
        const tokens = { access_token: accessToken };
        const { start_date, end_date } = args;

        // Validate dates
        if (!start_date || !end_date) {
             return "Error: Both start_date and end_date are required.";
        }
        const startDt = DateTime.fromISO(start_date);
        const endDt = DateTime.fromISO(end_date);
        if (!startDt.isValid || !endDt.isValid) {
             return `Error: Invalid date format. Please use ISO 8601 (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ). Received: start=${start_date}, end=${end_date}`;
        }
        if (startDt >= endDt) {
            return "Error: Start date must be before end date.";
        }

        try {
             // **Requires getCachedEventsForDateRange function** (which likely calls fetchGCalendarEventsInternal)
            // Use the specific function for date range caching
            const cacheKeyStart = startDt.toISODate();
            const cacheKeyEnd = endDt.toISODate(); // Use consistent date-only keys for daily cache range
            const tokenHash = accessToken.substring(accessToken.length - 10); // Simple hash for user separation
            const userIdCachePrefix = `user_${tokenHash}`; // Or use actual stable userId if available

            // Fetch from cache or API
            let events = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);

            if (events) {
                console.log(`Cache HIT for events ${cacheKeyStart} to ${cacheKeyEnd}`);
                 // Filter events based on the *exact* start/end time requested by the user, as cache might be broader (daily)
                 events = events.filter(event => {
                     const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
                     const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
                     // Ensure valid dates before comparison
                     if (!eventStart.isValid || !eventEnd.isValid) return false;
                     // Event overlaps with the requested range [startDt, endDt)
                     return eventStart < endDt && eventEnd > startDt;
                 });
                return events; // Return potentially filtered events array
            } else {
                console.log(`Cache MISS for events ${cacheKeyStart} to ${cacheKeyEnd}`);
                // **Requires fetchGCalendarEventsInternal function**
                const apiEvents = await fetchGCalendarEventsInternal(tokens, startDt.toJSDate(), endDt.toJSDate()); // Fetch exact range
                 if (apiEvents && Array.isArray(apiEvents)) {
                      // Cache the result using the daily range key
                      await cacheEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd, apiEvents, 300); // 5 min TTL
                      console.log(`Stored events in Redis cache for ${cacheKeyStart} to ${cacheKeyEnd}`);
                      return apiEvents; // Return the fetched events
                 } else {
                      console.warn(`No events returned or non-array from fetchGCalendarEventsInternal for ${startDt.toISO()}-${endDt.toISO()}`);
                      return []; // Return empty array on failure or non-array result
                 }
            }
        } catch (error) {
            console.error(`Error in getCalendarEvents tool (${start_date} to ${end_date}):`, error);
            // Provide a user-friendly error message
            return `Error fetching calendar events: ${error.message}. Check connection or permissions.`;
        }
    },

    deleteCalendarEvent: async (args, userId = 'default', accessToken = null) => {
        // Uses google.calendar API directly for 'get', then deleteGCalendarEventInternal, invalidateCache
        if (!accessToken) return { error: "User not authenticated.", success: false, eventId: args.eventId };
        const tokens = { access_token: accessToken };
        const { eventId } = args;
        if (!eventId) return { error: "Event ID is required.", success: false };

        let originalStartDate, originalEndDate, eventSummary;
        try {
            // Need to GET the event first to know its date range for cache invalidation
            // **Requires createOAuth2Client function**
            const oauth2Client = createOAuth2Client(tokens);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            try {
                console.log(`Fetching event details for deletion: ${eventId}`);
                const event = await calendar.events.get({ calendarId: 'primary', eventId: eventId });
                originalStartDate = event.data.start?.dateTime || event.data.start?.date;
                originalEndDate = event.data.end?.dateTime || event.data.end?.date;
                eventSummary = event.data.summary || eventId; // Use summary if available for result message
                console.log(`Found event "${eventSummary}" starting ${originalStartDate}`);
            } catch (getError) {
                 // Handle case where event doesn't exist (e.g., already deleted)
                 if (getError.code === 404) {
                     console.log(`Event ${eventId} not found for deletion (may already be deleted).`);
                     return { success: true, message: `Event ${eventId} not found (already deleted?).`, eventId: eventId, summary: eventId };
                 }
                 // Rethrow other errors during get
                 throw new Error(`Failed to retrieve event details before delete: ${getError.message}`);
            }

            // **Requires deleteGCalendarEventInternal function**
            console.log(`Attempting to delete event: ${eventId}`);
            await deleteGCalendarEventInternal(tokens, eventId); // Assume this throws on API error
            console.log(`Successfully deleted event: ${eventId}`);

            // Invalidate cache for the specific range if known
            // **Requires invalidateCache function**
            if (originalStartDate && originalEndDate) {
                try { await invalidateCache(tokens, originalStartDate, originalEndDate); }
                catch (cacheError) { console.error("Error invalidating cache after delete:", cacheError); }
            } else {
                // Fallback: maybe invalidate a broader range or just memory cache if range unknown
                console.warn(`Could not determine date range for event ${eventId}, broad cache invalidation might be needed.`);
                try { await invalidateCache(tokens); } // Call invalidate without specific range
                catch (cacheError) { console.error("Error invalidating cache after delete (fallback):", cacheError); }
            }

            return { success: true, eventId: eventId, summary: eventSummary }; // Return success object
        } catch (error) {
            console.error(`Error deleting event ${eventId}:`, error);
            // Don't invalidate cache on error here, as the state is uncertain
            return {
                success: false,
                error: `Failed to delete event ${eventId}: ${error.message}`,
                eventId: eventId
            };
        }
    },

    updateCalendarEvent: async (args, userId = 'default', accessToken = null) => {
        // Uses google.calendar API directly for 'get', then updateGCalendarEventInternal, invalidateCache
       if (!accessToken) return { error: "User not authenticated.", success: false, eventId: args.eventId };
       const tokens = { access_token: accessToken };
       const { eventId, updates } = args;

       if (!eventId || !updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
           return { error: "Event ID and a non-empty updates object are required.", success: false, eventId: eventId };
       }

       // Validate update values (basic check for ISO dates if provided)
       try {
           if (updates.start && !DateTime.fromISO(updates.start).isValid) throw new Error("Invalid start date format");
           if (updates.end && !DateTime.fromISO(updates.end).isValid) throw new Error("Invalid end date format");
           if (updates.start && updates.end && DateTime.fromISO(updates.start) >= DateTime.fromISO(updates.end)) {
               throw new Error("Start time must be before end time");
           }
       } catch (validationError) {
            return { error: `Invalid update data: ${validationError.message}. Use ISO 8601 format.`, success: false, eventId: eventId };
       }


       let originalStartDate, originalEndDate;
       try {
            // Get original event times for cache invalidation
            // **Requires createOAuth2Client function**
           const oauth2Client = createOAuth2Client(tokens);
           const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
           try {
                console.log(`Fetching event details for update: ${eventId}`);
                const event = await calendar.events.get({ calendarId: 'primary', eventId: eventId });
                originalStartDate = event.data.start?.dateTime || event.data.start?.date;
                originalEndDate = event.data.end?.dateTime || event.data.end?.date;
                console.log(`Found event "${event.data.summary}" starting ${originalStartDate}`);
           } catch (getError) {
               if (getError.code === 404) {
                    return { success: false, error: `Event ${eventId} not found for update.`, eventId: eventId };
               }
               throw new Error(`Failed to retrieve event details before update: ${getError.message}`);
           }


            // **Requires updateGCalendarEventInternal function**
           console.log(`Attempting to update event: ${eventId} with updates:`, updates);
           const updatedEvent = await updateGCalendarEventInternal(tokens, eventId, updates); // Assume throws on API error
           console.log(`Successfully updated event: ${eventId}`);

           // Invalidate cache for both original and new ranges
           // **Requires invalidateCache function**
           const rangesToInvalidate = [];
           if (originalStartDate && originalEndDate) rangesToInvalidate.push({start: originalStartDate, end: originalEndDate});
           // Use updated event data for new range
           const newStartDate = updatedEvent.start?.dateTime || updatedEvent.start?.date;
           const newEndDate = updatedEvent.end?.dateTime || updatedEvent.end?.date;
           if (newStartDate && newEndDate) rangesToInvalidate.push({start: newStartDate, end: newEndDate});

            if (rangesToInvalidate.length > 0) {
                 const uniqueRanges = [...new Set(rangesToInvalidate.map(JSON.stringify))].map(JSON.parse);
                 console.log("Invalidating cache ranges:", uniqueRanges);
                 for (const range of uniqueRanges) {
                    try { await invalidateCache(tokens, range.start, range.end); }
                    catch (cacheError) { console.error(`Error invalidating cache range ${range.start}-${range.end}:`, cacheError); }
                 }
             } else {
                 console.warn(`Could not determine date range(s) for event ${eventId} update, broad cache invalidation might be needed.`);
                 try { await invalidateCache(tokens); } // Fallback invalidate
                 catch (cacheError) { console.error("Error invalidating cache after update (fallback):", cacheError); }
             }

           // Return the updated event object, adding a success flag
           return { ...updatedEvent, success: true };
       } catch (error) {
           console.error(`Error updating event ${eventId}:`, error);
           return {
                success: false,
                error: `Failed to update event ${eventId}: ${error.message}`,
                eventId: eventId
           };
       }
    },

    findAvailableSlots: async (args, userId = 'default', accessToken = null) => {
        // Uses getCachedEventsForDateRange, findAvailableSlotsUtil
        if (!accessToken) return { error: "User not authenticated.", slots: [] };
        const tokens = { access_token: accessToken };
        const { duration, startDate: reqStartDate, endDate: reqEndDate, timePreference = 'any', activity = 'event' } = args;

        if (!duration || typeof duration !== 'number' || duration <= 0) {
            return { error: "Valid duration (in minutes) is required.", slots: [] };
        }

        // Default search range: next 7 days from now
        const now = DateTime.now();
        const startDate = reqStartDate ? DateTime.fromISO(reqStartDate) : now;
        const endDate = reqEndDate ? DateTime.fromISO(reqEndDate) : startDate.plus({ days: 7 });

        if (!startDate.isValid || !endDate.isValid) {
             return { error: `Invalid date format. Use ISO 8601. Received start=${reqStartDate}, end=${reqEndDate}`, slots: [] };
        }
        if (startDate >= endDate) {
             return { error: "Start date must be before end date.", slots: [] };
        }


        try {
            // Fetch events for the entire search range first (cache-aware)
             // **Requires getCachedEventsForDateRange function**
            const cacheKeyStart = startDate.startOf('day').toISODate();
            const cacheKeyEnd = endDate.endOf('day').toISODate(); // Cache daily granularity
            const tokenHash = accessToken.substring(accessToken.length - 10);
            const userIdCachePrefix = `user_${tokenHash}`;

            let events = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);
            if (!events) {
                 console.log(`Cache MISS for slot search events ${cacheKeyStart} to ${cacheKeyEnd}`);
                 // **Requires fetchGCalendarEventsInternal function**
                 const apiEvents = await fetchGCalendarEventsInternal(tokens, startDate.startOf('day').toJSDate(), endDate.endOf('day').toJSDate());
                 if (apiEvents && Array.isArray(apiEvents)) {
                    events = apiEvents;
                    await cacheEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd, events, 300);
                 } else {
                    events = []; // Assume no events if fetch fails
                 }
            } else {
                console.log(`Cache HIT for slot search events ${cacheKeyStart} to ${cacheKeyEnd}`);
            }

            // Filter events to the precise requested time window *before* finding slots
             const relevantEvents = events.filter(event => {
                 const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
                 const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
                 return eventStart.isValid && eventEnd.isValid && eventStart < endDate && eventEnd > startDate;
             });


            // Use the imported findAvailableSlots function
            const slots = await findAvailableSlots(
                relevantEvents, // Use precisely filtered events
                duration,
                startDate.toISO(), // Pass precise ISO strings to util
                endDate.toISO(),
                activity,
                timePreference
            );
            return slots; // Return raw slots array (formatToolResponse handles presentation)
        } catch (error) {
            console.error(`Error in findAvailableSlots tool (${duration}min, ${startDate.toISO()} to ${endDate.toISO()}):`, error);
            // Return an error object instead of throwing
            return { error: `Failed to find available slots: ${error.message}`, slots: [] };
        }
    },

    getWeatherForecast: async (args, userId = 'default', accessToken = null) => {
        // Placeholder - requires actual weather API integration
        const { location, date: dateString } = args;
        if (!location) return { error: "Location is required for weather forecast.", success: false };

        // Default to today if date is missing or invalid
        let forecastDate = dateString ? DateTime.fromISO(dateString) : DateTime.now();
        if (!forecastDate.isValid) {
            console.warn(`Invalid date provided for weather forecast: ${dateString}. Defaulting to today.`);
            forecastDate = DateTime.now();
        }
        const formattedDate = forecastDate.toISODate(); // YYYY-MM-DD

        console.log(`Placeholder: Fetching weather for ${location} on ${formattedDate}`);
        try {
            // --- Replace with actual weather API call ---
            // Example: const weatherData = await getWeatherData(location, formattedDate);
            // return { ...weatherData, success: true };
            // --- Placeholder response ---
            return {
                location: location,
                date: formattedDate,
                forecast: `Weather data for ${location} on ${formattedDate} is currently unavailable.`, // Placeholder message
                success: false // Indicate data is not actual
            };
        } catch (error) {
            console.error(`Error fetching weather for ${location}, ${formattedDate}:`, error);
             return {
                 location: location,
                 date: formattedDate,
                 error: `Failed to get weather forecast: ${error.message}`,
                 success: false
             };
        }
    },

    deleteCalendarEventsByQuery: async (args, userId = 'default', accessToken = null) => {
        // Uses getCachedEventsForDateRange, deleteGCalendarEventInternal, invalidateCache
        if (!accessToken) {
            return { error: "User not authenticated.", success: false, deletedCount: 0 };
        }
        const tokens = { access_token: accessToken };
        const { query, start_date, end_date } = args;

        if (!query || !start_date || !end_date) {
            return { error: "Query, start date, and end date are required.", success: false, deletedCount: 0 };
        }

        const startDt = DateTime.fromISO(start_date);
        const endDt = DateTime.fromISO(end_date);
         if (!startDt.isValid || !endDt.isValid) {
             return { error: `Invalid date format. Use ISO 8601.`, success: false, deletedCount: 0 };
         }
        if (startDt >= endDt) {
            return { error: "Start date must be before end date.", success: false, deletedCount: 0 };
        }

        console.log(`Attempting to delete events matching "${query}" between ${startDt.toISO()} and ${endDt.toISO()}`);

        try {
            // 1. Get all events in the range (use cache)
            // **Requires getCachedEventsForDateRange function**
            const cacheKeyStart = startDt.startOf('day').toISODate();
            const cacheKeyEnd = endDt.endOf('day').toISODate();
            const tokenHash = accessToken.substring(accessToken.length - 10);
            const userIdCachePrefix = `user_${tokenHash}`;

            let events = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);
             if (!events) {
                 console.log(`Cache MISS for bulk delete search ${cacheKeyStart} to ${cacheKeyEnd}`);
                  // **Requires fetchGCalendarEventsInternal function**
                 const apiEvents = await fetchGCalendarEventsInternal(tokens, startDt.startOf('day').toJSDate(), endDt.endOf('day').toJSDate());
                 events = (Array.isArray(apiEvents)) ? apiEvents : [];
                 // No need to cache here as we are about to delete potentially many events
             } else {
                  console.log(`Cache HIT for bulk delete search ${cacheKeyStart} to ${cacheKeyEnd}`);
             }

             // Filter events precisely by requested time *and* query
            const queryLower = query.toLowerCase();
            const matchingEvents = events.filter(event => {
                const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
                const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
                const summaryLower = event.summary?.toLowerCase() || '';

                return eventStart.isValid && eventEnd.isValid &&
                       eventStart < endDt && eventEnd > startDt && // Check time overlap
                       summaryLower.includes(queryLower); // Check summary match
            });


            if (matchingEvents.length === 0) {
                console.log(`No events matching "${query}" found in the specified range.`);
                return { success: true, message: `No events matching "${query}" found.`, deletedCount: 0 };
            }

            console.log(`Found ${matchingEvents.length} events matching query. Proceeding with deletion...`);

            // 2. Delete each matching event
            const deleteResults = [];
            const failedDeletes = [];
            for (const event of matchingEvents) {
                try {
                    // **Requires deleteGCalendarEventInternal function**
                    const result = await deleteGCalendarEventInternal(tokens, event.id); // Assume returns minimal info or throws
                    deleteResults.push({ id: event.id, summary: event.summary });
                    // **Requires invalidateCache function** - Invalidate immediately after successful delete
                     try {
                         const eventStartIso = event.start?.dateTime || event.start?.date;
                         const eventEndIso = event.end?.dateTime || event.end?.date;
                         if (eventStartIso && eventEndIso) {
                            await invalidateCache(tokens, eventStartIso, eventEndIso);
                         } else {
                            await invalidateCache(tokens); // Fallback
                         }
                     } catch(cacheError) { console.error(`Cache invalidation error during bulk delete for ${event.id}:`, cacheError); }

                } catch (deleteError) {
                    console.error(`Failed to delete event ${event.id} ("${event.summary}") during bulk operation:`, deleteError);
                    failedDeletes.push({ id: event.id, summary: event.summary, error: deleteError.message });
                }
            }

            // 3. Compile and return result
             const successCount = deleteResults.length;
             let message = `Successfully deleted ${successCount} event(s) matching "${query}".`;
             if (failedDeletes.length > 0) {
                 message += ` Failed to delete ${failedDeletes.length} event(s).`;
                 console.warn("Failures during bulk delete:", failedDeletes);
             }

            return {
                success: failedDeletes.length === 0, // Overall success if no failures
                message: message,
                deletedCount: successCount,
                deletedItems: deleteResults, // List successful ones
                failedItems: failedDeletes   // List failures
            };

        } catch (error) {
            console.error(`Error during deleteCalendarEventsByQuery (${query}, ${start_date}-${end_date}):`, error);
             return {
                 success: false,
                 error: `An error occurred during the bulk delete operation: ${error.message}`,
                 deletedCount: 0
             };
        }
    }
};


  
  
  

// --- Exports ---
// Export the schema and the implementation map
export { tools, toolFunctions };


// processToolCalls is not typically exported from here, but kept for reference
// export { processToolCalls };
