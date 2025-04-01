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
    // invalidateDateRangeCache, // Replaced by invalidateCache from cacheService
} from '../redisClient.js';

// Import from cacheService.js
import {
    // getCachedEvents, // Not used directly, using redisClient specific range functions
    invalidateCache // Used for invalidating based on ranges or tokens
} from '../services/cacheService.js';

// Import from schedulingUtils.js
import { findAvailableSlots as findAvailableSlotsUtil } from './schedulingUtils.js'; // Renamed to avoid conflict with tool name

// Import from checkForConflicts.js
import { checkForConflicts } from './checkForConflicts.js';

// Import from timeUtils.js
import { getUserTimezone, convertToUTCISOString } from './timeUtils.js';

// Import from formatters.js - Assuming these might be used by the caller, not directly here
// import { formatEventTime, formatCalendarEvents, formatToolResponse } from './formatters.js';

// Import from postgresClient.js
import {
    UserPreference, // Assuming models are exported from postgresClient
    addMessageToConversation, // Needed by potential processToolCalls - *This ideally belongs in databaseService*
    createOrUpdateEventMetadata,
    getEventMetadataBatch,
    deleteEventMetadata // Corrected: Missing comma added
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
                                priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"], description: "Optional priority level for the event." },
                                tags: { type: "array", items: { type: "string" }, description: "Optional tags to categorize the event." },
                                overrideConflicts: { type: "boolean", description: "Optional flag to override conflicts and add the event anyway. Default is false." }
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
                            end: { type: "string", description: "New end time in ISO 8601 format (e.g., '2025-04-01T17:00:00-07:00')." },
                            priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"], description: "Optional priority level for the event." },
                            tags: { type: "array", items: { type: "string" }, description: "Optional tags to categorize the event." }
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
        if (!userId || userId === 'default') return { success: false, message: "Error: User ID is missing." };
        console.log(`DEBUG: saveUserPreference called with userId=${userId}, args:`, JSON.stringify(args));
        
        const { category, key, value, context } = args;
        // Basic validation
        if (!category || !key || value === undefined) {
            return { success: false, message: "Error: Missing required fields (category, key, value) for preference." };
        }
        
        try {
            // First, find or create the UserPreference record
            const [userPref, created] = await UserPreference.findOrCreate({
                where: { user_id: userId },
                defaults: { user_id: userId, preferences_data: {} }
            });
            
            console.log(`DEBUG: UserPreference record ${created ? 'created' : 'found'} for user ${userId}`);
            
            // Get the current preferences data
            const currentPrefs = created ? {} : (userPref.preferences_data || {});
            console.log("DEBUG: Current preferences_data:", JSON.stringify(currentPrefs));
            
            // Create a new preferences object with the updated values
            const updatedPrefs = { ...currentPrefs };
            
            // Ensure category exists
            if (!updatedPrefs[category]) updatedPrefs[category] = {};
            
            // Update the value
            updatedPrefs[category][key] = value;
            
            // Handle context if provided
            if (context !== undefined) {
                const contextKey = `${category}_context`;
                if (!updatedPrefs[contextKey]) updatedPrefs[contextKey] = {};
                updatedPrefs[contextKey][key] = context;
            }
            
            console.log("DEBUG: Updated preferences_data to be saved:", JSON.stringify(updatedPrefs));
            
            // Use UPDATE instead of save() to ensure the JSONB field is properly updated
            // This is the key change to fix the issue with Sequelize not detecting changes to JSONB fields
            const [updateCount] = await UserPreference.update(
                { preferences_data: updatedPrefs },
                { where: { user_id: userId } }
            );
            
            console.log(`DEBUG: Update result: ${updateCount} rows affected`);
            
            // Verify the update by fetching the record again
            const verifyPref = await UserPreference.findOne({ where: { user_id: userId } });
            console.log("DEBUG: Verified preferences_data after update:", 
                JSON.stringify(verifyPref.preferences_data));
            
            return { 
                success: true, 
                message: `Preference saved: ${category}.${key} = ${JSON.stringify(value)}`,
                updateCount: updateCount
            };
        } catch (error) {
            console.error(`Error saving preference for user ${userId}:`, error);
            return { success: false, message: `Failed to save preference: ${error.message}` };
        }
    },

    addCalendarEvents: async (args, userId = 'default', accessToken = null) => {
        if (!accessToken) return { error: "User not authenticated.", success: false };
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
            
            // Get user timezone
            const userTimezone = getUserTimezone();
            
            try {
                // Convert start and end times to UTC ISO strings with proper timezone handling
                const startUtc = convertToUTCISOString(event.start, userTimezone);
                const endUtc = convertToUTCISOString(event.end, userTimezone);
                
                if (!startUtc || !endUtc) {
                    throw new Error('Failed to convert time strings to UTC ISO format');
                }
                
                // Update event with properly converted times
                event.start = startUtc;
                event.end = endUtc;
                
                const startDt = DateTime.fromISO(startUtc);
                const endDt = DateTime.fromISO(endUtc);
                
                if (!startDt.isValid || !endDt.isValid) throw new Error('Invalid date format');
                if (startDt >= endDt) throw new Error('Start time must be before end time');
            } catch (e) {
                results.push({ summary: event.summary, error: `Invalid date format or logic: ${e.message}. Use ISO 8601 format.`, success: false });
                continue;
            }

            try {
                 // Check for conflicts before attempting to add
                const conflictCheckResult = await checkForConflicts(tokens, event.start, event.end, event.overrideConflicts === true);
                if (conflictCheckResult.conflicts) {
                    console.warn(`Conflict detected for event: ${event.summary}`);
                    results.push({
                        summary: event.summary,
                        conflict: true,
                        suggestions: conflictCheckResult.suggestions || [], // Pass suggestions back
                        error: conflictCheckResult.error || `Event conflicts with existing schedule.`, // Include error if any from check
                        success: false
                    });
                } else if (conflictCheckResult.overridden) {
                    console.log(`Conflict detected for event: ${event.summary} but override flag is set. Proceeding with event creation.`);
                    
                    // Add the event despite conflict
                    const addedEvent = await addGCalendarEventInternal(
                        tokens,
                        event.summary,
                        event.start,
                        event.end,
                        event.description,
                        event.location,
                        event.reminders
                    );
                    
                    // Store metadata if priority or tags are provided
                    const hasMetadata = event.priority !== undefined || (event.tags && event.tags.length > 0);
                    if (hasMetadata) {
                        try {
                            await createOrUpdateEventMetadata(userId, addedEvent.id, {
                                priority: event.priority, // Will be null if undefined
                                tags: event.tags // Will be null if undefined or empty
                            });
                            console.log(`Metadata saved for event "${event.summary}" (ID: ${addedEvent.id})`);
                        } catch (metadataError) {
                            console.error(`Error saving metadata for event "${event.summary}" (ID: ${addedEvent.id}):`, metadataError);
                            // Log error but don't fail the entire event addition
                            addedEvent.metadataError = `Failed to save metadata: ${metadataError.message}`;
                        }
                    }
                    
                    // Add a note about the conflict being overridden
                    addedEvent.conflictOverridden = true;
                    addedEvent.conflictCount = conflictCheckResult.conflictCount;
                    
                    // Assuming addGCalendarEventInternal returns the created event object on success
                    results.push({ ...addedEvent, success: true }); // Add success flag
                    affectedDateRanges.push({ start: event.start, end: event.end });
                    console.log(`Event added despite conflicts: ${event.summary} (ID: ${addedEvent.id})`);
                } else {
                    // Add the event
                    const addedEvent = await addGCalendarEventInternal(
                        tokens,
                        event.summary,
                        event.start,
                        event.end,
                        event.description,
                        event.location,
                        event.reminders
                    );

                    // Store metadata if priority or tags are provided
                    const hasMetadata = event.priority !== undefined || (event.tags && event.tags.length > 0);
                    if (hasMetadata) {
                        try {
                            await createOrUpdateEventMetadata(userId, addedEvent.id, {
                                priority: event.priority, // Will be null if undefined
                                tags: event.tags // Will be null if undefined or empty
                            });
                            console.log(`Metadata saved for event "${event.summary}" (ID: ${addedEvent.id})`);
                        } catch (metadataError) {
                            console.error(`Error saving metadata for event "${event.summary}" (ID: ${addedEvent.id}):`, metadataError);
                            // Log error but don't fail the entire event addition
                            addedEvent.metadataError = `Failed to save metadata: ${metadataError.message}`;
                        }
                    }

                    // Assuming addGCalendarEventInternal returns the created event object on success
                    results.push({ ...addedEvent, success: true }); // Add success flag
                    affectedDateRanges.push({ start: event.start, end: event.end });
                    console.log(`Event added: ${event.summary} (ID: ${addedEvent.id})`);
                }
            } catch (addError) {
                console.error(`Error adding event "${event.summary}" during conflict check or API call:`, addError);
                results.push({ summary: event.summary, error: `Failed to process event: ${addError.message}`, success: false });
            }
        }

        // Invalidate cache for all ranges where events were successfully added
        // Use invalidateCache from cacheService
        for (const range of affectedDateRanges) {
            try {
                await invalidateCache(tokens, range.start, range.end);
                console.log(`Invalidated cache for range: ${range.start} - ${range.end}`);
            } catch (cacheError) {
                console.error("Error invalidating cache after add:", cacheError);
            }
        }

        return results; // Return array of result objects (with success flags/errors)
    },

    getCalendarEvents: async (args, userId = 'default', accessToken = null) => {
        if (!accessToken) return { error: "User not authenticated.", success: false, events: [] }; // Return structured error
        const tokens = { access_token: accessToken };
        const { start_date, end_date } = args;

        // Validate dates
        if (!start_date || !end_date) {
             return { error: "Both start_date and end_date are required.", success: false, events: [] };
        }
        const startDt = DateTime.fromISO(start_date);
        const endDt = DateTime.fromISO(end_date);
        if (!startDt.isValid || !endDt.isValid) {
             return { error: `Invalid date format. Please use ISO 8601 (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ). Received: start=${start_date}, end=${end_date}`, success: false, events: [] };
        }
        if (startDt >= endDt) {
            return { error: "Start date must be before end date.", success: false, events: [] };
        }

        let finalEvents = []; // Initialize events array

        try {
            // Define cache keys using daily granularity for broader cache hits
            const cacheKeyStart = startDt.startOf('day').toISODate();
            const cacheKeyEnd = endDt.endOf('day').toISODate(); // Inclusive end day for key
            const tokenHash = accessToken.substring(accessToken.length - 10); // Simple hash
            const userIdCachePrefix = `user_${tokenHash}`; // Or use actual stable userId

            // Attempt to fetch from cache first
            let cachedEvents = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);

            if (cachedEvents) {
                console.log(`Cache HIT for events ${cacheKeyStart} to ${cacheKeyEnd}`);
                 // Filter cached events based on the *exact* start/end time requested by the user
                 finalEvents = cachedEvents.filter(event => {
                     const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
                     const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
                     // Ensure valid dates before comparison
                     if (!eventStart.isValid || !eventEnd.isValid) return false;
                     // Event overlaps with the requested range [startDt, endDt)
                     return eventStart < endDt && eventEnd > startDt;
                 });
                 console.log(`Filtered ${cachedEvents.length} cached events down to ${finalEvents.length} for exact range.`);

            } else {
                console.log(`Cache MISS for events ${cacheKeyStart} to ${cacheKeyEnd}`);
                // Fetch from Google Calendar API for the *exact* requested range
                const apiEvents = await fetchGCalendarEventsInternal(tokens, startDt.toJSDate(), endDt.toJSDate()); // Fetch exact range

                if (apiEvents && Array.isArray(apiEvents)) {
                    finalEvents = apiEvents; // Use the precisely fetched events
                    console.log(`Fetched ${finalEvents.length} events from API for range ${startDt.toISO()} - ${endDt.toISO()}.`);
                    // Cache the result using the daily range key for potential future broader queries
                    // Cache the events fetched for the *exact* range, but use the *daily* key
                    // This means subsequent wider queries might hit cache, but specific narrow queries within the day will still filter
                    await cacheEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd, finalEvents, 300); // 5 min TTL
                    console.log(`Stored ${finalEvents.length} events in Redis cache under key range ${cacheKeyStart} to ${cacheKeyEnd}`);
                } else {
                    console.warn(`No events returned or non-array from fetchGCalendarEventsInternal for ${startDt.toISO()}-${endDt.toISO()}`);
                    finalEvents = []; // Ensure it's an empty array on failure or no results
                }
            }

            // Enrich events with metadata if there are any events
            if (finalEvents.length > 0 && userId !== 'default') {
                try {
                    // Extract all Google event IDs
                    const googleEventIds = finalEvents.map(event => event.id).filter(id => id); // Filter out potential null/undefined IDs

                    if (googleEventIds.length > 0) {
                        // Fetch metadata for all events in a single batch query
                        const metadataRecords = await getEventMetadataBatch(userId, googleEventIds);

                        // Create a lookup map for efficient access
                        const metadataMap = new Map();
                        metadataRecords.forEach(record => {
                            metadataMap.set(record.google_event_id, record);
                        });

                        // Enrich events with metadata
                        finalEvents = finalEvents.map(event => {
                            const metadata = metadataMap.get(event.id);
                            if (metadata) {
                                // Add only non-null metadata fields
                                const enrichment = {};
                                if (metadata.priority !== null) enrichment.priority = metadata.priority;
                                if (metadata.tags !== null && metadata.tags.length > 0) enrichment.tags = metadata.tags;
                                return { ...event, ...enrichment };
                            }
                            return event; // Return original event if no metadata found
                        });
                         console.log(`Enriched ${metadataMap.size} events with metadata.`);
                    }
                } catch (metadataError) {
                    console.error(`Error fetching or merging event metadata:`, metadataError);
                    // Proceed without metadata, but log the error
                }
            }

            console.log("DEBUG: toolFunctions.getCalendarEvents is returning:", JSON.stringify(finalEvents, null, 2)); // Keep debug log
            return finalEvents; // Return just the events array

        } catch (error) {
            console.error(`Error in getCalendarEvents tool (${start_date} to ${end_date}):`, error);
            // Provide a user-friendly structured error message
            throw new Error(`Failed to fetch calendar events: ${error.message}. Check connection or permissions.`);
        }
    },

    deleteCalendarEvent: async (args, userId = 'default', accessToken = null) => {
        if (!accessToken) return { error: "User not authenticated.", success: false, eventId: args.eventId };
        const tokens = { access_token: accessToken };
        const { eventId } = args;
        if (!eventId) return { error: "Event ID is required.", success: false };

        let originalStartDate, originalEndDate, eventSummary = eventId; // Default summary to ID
        try {
            // 1. Get the event details first for cache invalidation and user feedback
            const oauth2Client = createOAuth2Client(tokens);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            try {
                console.log(`Fetching event details for deletion: ${eventId}`);
                const event = await calendar.events.get({ calendarId: 'primary', eventId: eventId });
                originalStartDate = event.data.start?.dateTime || event.data.start?.date;
                originalEndDate = event.data.end?.dateTime || event.data.end?.date;
                eventSummary = event.data.summary || eventId;
                console.log(`Found event "${eventSummary}" starting ${originalStartDate} for deletion.`);
            } catch (getError) {
                 if (getError.code === 404) {
                     console.log(`Event ${eventId} not found for deletion (may already be deleted).`);
                     // Consider this a "success" in the sense that the desired state (event gone) is achieved.
                     return { success: true, message: `Event ${eventId} not found (already deleted?).`, eventId: eventId, summary: eventSummary };
                 }
                 // Rethrow other errors during get
                 throw new Error(`Failed to retrieve event details before delete: ${getError.message}`);
            }

            // 2. Delete the event via internal function
            console.log(`Attempting to delete event: ${eventId}`);
            await deleteGCalendarEventInternal(tokens, eventId); // Assumes this throws on API error
            console.log(`Successfully deleted event from Google Calendar: ${eventId}`);

            // 3. Delete associated metadata
            if (userId !== 'default') {
                try {
                    await deleteEventMetadata(userId, eventId);
                    console.log(`Successfully deleted metadata for event: ${eventId}`);
                } catch (metadataError) {
                    console.error(`Error deleting metadata for event ${eventId} (proceeding anyway):`, metadataError);
                    // Log error but don't fail the overall deletion if calendar delete succeeded
                }
            }

            // 4. Invalidate cache for the event's date range
            if (originalStartDate && originalEndDate) {
                try {
                    await invalidateCache(tokens, originalStartDate, originalEndDate);
                    console.log(`Invalidated cache for range: ${originalStartDate} - ${originalEndDate}`);
                } catch (cacheError) {
                    console.error("Error invalidating cache after delete:", cacheError);
                }
            } else {
                console.warn(`Could not determine date range for event ${eventId}, invalidating token cache.`);
                try {
                    await invalidateCache(tokens); // Invalidate broader cache associated with token
                } catch (cacheError) {
                    console.error("Error invalidating cache after delete (fallback):", cacheError);
                }
            }

            return { success: true, message: `Successfully deleted event: "${eventSummary}"`, eventId: eventId, summary: eventSummary }; // Return success object

        } catch (error) {
            console.error(`Error deleting event ${eventId}:`, error);
            // Don't invalidate cache on error here, as the state is uncertain
            return {
                success: false,
                error: `Failed to delete event ${eventId} (${eventSummary}): ${error.message}`,
                eventId: eventId,
                summary: eventSummary // Include summary if retrieved
            };
        }
    },

    updateCalendarEvent: async (args, userId = 'default', accessToken = null) => {
       if (!accessToken) return { error: "User not authenticated.", success: false, eventId: args.eventId };
       const tokens = { access_token: accessToken };
       const { eventId, updates } = args;

       if (!eventId || !updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
           return { error: "Event ID and a non-empty updates object are required.", success: false, eventId: eventId };
       }

       // Validate update values (basic check for ISO dates if provided)
       let updateStartDt, updateEndDt;
       try {
           if (updates.start) {
               updateStartDt = DateTime.fromISO(updates.start);
               if (!updateStartDt.isValid) throw new Error("Invalid start date format");
           }
           if (updates.end) {
               updateEndDt = DateTime.fromISO(updates.end);
               if (!updateEndDt.isValid) throw new Error("Invalid end date format");
           }
           // Use retrieved original times if only one end of the date is provided in updates
           // (This requires getting the original event *first*)
           // We will perform this check after fetching the original event.

       } catch (validationError) {
            return { error: `Invalid update data: ${validationError.message}. Use ISO 8601 format.`, success: false, eventId: eventId };
       }


       let originalStartDate, originalEndDate, originalSummary = eventId;
       try {
            // 1. Get original event times for cache invalidation and potential date logic
            const oauth2Client = createOAuth2Client(tokens);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            let originalEventData;
            try {
                console.log(`Fetching event details for update: ${eventId}`);
                const eventResponse = await calendar.events.get({ calendarId: 'primary', eventId: eventId });
                originalEventData = eventResponse.data;
                originalStartDate = originalEventData.start?.dateTime || originalEventData.start?.date;
                originalEndDate = originalEventData.end?.dateTime || originalEventData.end?.date;
                originalSummary = originalEventData.summary || eventId;
                console.log(`Found event "${originalSummary}" starting ${originalStartDate} for update.`);
            } catch (getError) {
               if (getError.code === 404) {
                    return { success: false, error: `Event ${eventId} not found for update.`, eventId: eventId };
               }
               throw new Error(`Failed to retrieve event details before update: ${getError.message}`);
            }

            // Refined Date Validation: Check start < end using original dates if needed
            const finalStart = updates.start ? updateStartDt : DateTime.fromISO(originalStartDate);
            const finalEnd = updates.end ? updateEndDt : DateTime.fromISO(originalEndDate);

            if (finalStart.isValid && finalEnd.isValid && finalStart >= finalEnd) {
                throw new Error("Start time must be before end time after updates are applied.");
            }


            // 2. Update the event via internal function
            console.log(`Attempting to update event: ${eventId} with updates:`, updates);
            // Pass only the fields present in the 'updates' object
            const updatePayload = { ...updates }; // Shallow copy
            const updatedEvent = await updateGCalendarEventInternal(tokens, eventId, updatePayload); // Assume throws on API error
            console.log(`Successfully updated event in Google Calendar: ${eventId}`);


            // 3. Update metadata if priority or tags are provided in the updates
            const hasMetadataUpdate = updates.priority !== undefined || updates.tags !== undefined;
            if (hasMetadataUpdate && userId !== 'default') {
                try {
                    // We only update the fields provided in the 'updates' object.
                    // createOrUpdateEventMetadata handles merging/overwriting correctly.
                    await createOrUpdateEventMetadata(userId, eventId, {
                        priority: updates.priority, // Will be null if undefined, handled by DB function
                        tags: updates.tags // Will be null if undefined, handled by DB function
                    });
                    console.log(`Metadata updated for event ${eventId}.`);
                } catch (metadataError) {
                    console.error(`Error updating metadata for event ${eventId} (proceeding anyway):`, metadataError);
                    // Attach metadata error info to the result, but don't fail the update
                    updatedEvent.metadataError = `Failed to update metadata: ${metadataError.message}`;
                }
            }

            // 4. Invalidate cache for both original and new ranges
            const rangesToInvalidate = [];
            if (originalStartDate && originalEndDate) rangesToInvalidate.push({start: originalStartDate, end: originalEndDate});
            // Use updated event data for the new range
            const newStartDate = updatedEvent.start?.dateTime || updatedEvent.start?.date;
            const newEndDate = updatedEvent.end?.dateTime || updatedEvent.end?.date;
            if (newStartDate && newEndDate) rangesToInvalidate.push({start: newStartDate, end: newEndDate});

            if (rangesToInvalidate.length > 0) {
                 // Deduplicate ranges before invalidating
                 const uniqueRanges = [...new Set(rangesToInvalidate.map(r => `${r.start}|${r.end}`))].map(s => {
                     const [start, end] = s.split('|');
                     return { start, end };
                 });
                 console.log("Invalidating cache ranges:", uniqueRanges);
                 for (const range of uniqueRanges) {
                    try {
                        await invalidateCache(tokens, range.start, range.end);
                        console.log(`Invalidated cache for range: ${range.start} - ${range.end}`);
                    }
                    catch (cacheError) { console.error(`Error invalidating cache range ${range.start}-${range.end}:`, cacheError); }
                 }
             } else {
                 console.warn(`Could not determine date range(s) for event ${eventId} update, invalidating token cache.`);
                 try {
                     await invalidateCache(tokens); // Fallback invalidate
                 } catch (cacheError) {
                     console.error("Error invalidating cache after update (fallback):", cacheError);
                 }
             }

           // Return the updated event object from the API, adding a success flag
           return { ...updatedEvent, success: true };

       } catch (error) {
           console.error(`Error updating event ${eventId}:`, error);
           return {
                success: false,
                error: `Failed to update event ${eventId} (${originalSummary || eventId}): ${error.message}`,
                eventId: eventId,
                summary: originalSummary // Include original summary if retrieved
           };
       }
    },

    findAvailableSlots: async (args, userId = 'default', accessToken = null) => {
        if (!accessToken) return { error: "User not authenticated.", success: false, slots: [] };
        const tokens = { access_token: accessToken };
        const { duration, startDate: reqStartDate, endDate: reqEndDate, timePreference = 'any', activity = 'event' } = args;

        if (!duration || typeof duration !== 'number' || duration <= 0) {
            return { error: "Valid duration (in minutes) is required.", success: false, slots: [] };
        }

        // Define search range with defaults
        const now = DateTime.now();
        const startDate = reqStartDate ? DateTime.fromISO(reqStartDate) : now;
        // Default end date is 7 days from the resolved start date
        const endDate = reqEndDate ? DateTime.fromISO(reqEndDate) : startDate.plus({ days: 7 });

        if (!startDate.isValid || !endDate.isValid) {
             return { error: `Invalid date format. Use ISO 8601. Received start=${reqStartDate}, end=${reqEndDate}`, success: false, slots: [] };
        }
        if (startDate >= endDate) {
             return { error: "Start date must be before end date.", success: false, slots: [] };
        }

        let fetchedEvents = []; // Initialize events array

        try {
            // Fetch events for the *entire* potential search range first (cache-aware)
            // Use daily granularity for cache keys
            const cacheKeyStart = startDate.startOf('day').toISODate();
            const cacheKeyEnd = endDate.endOf('day').toISODate(); // Inclusive end day for key
            const tokenHash = accessToken.substring(accessToken.length - 10);
            const userIdCachePrefix = `user_${tokenHash}`;

            let cachedEvents = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);
            if (cachedEvents) {
                 console.log(`Cache HIT for slot search events ${cacheKeyStart} to ${cacheKeyEnd}`);
                 fetchedEvents = cachedEvents; // Use cached events (will be filtered later)
            } else {
                 console.log(`Cache MISS for slot search events ${cacheKeyStart} to ${cacheKeyEnd}`);
                 // Fetch events covering the *broadest* possible range (start of start day to end of end day) for caching
                 const apiEvents = await fetchGCalendarEventsInternal(tokens, startDate.startOf('day').toJSDate(), endDate.endOf('day').toJSDate());
                 if (apiEvents && Array.isArray(apiEvents)) {
                    fetchedEvents = apiEvents;
                    await cacheEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd, fetchedEvents, 300); // Cache the broad fetch
                    console.log(`Fetched and cached ${fetchedEvents.length} events for slot search.`);
                 } else {
                    fetchedEvents = []; // Assume no events if fetch fails
                    console.warn(`No events returned or fetch failed for slot search range.`);
                 }
            }

            // Filter the fetched events (from cache or API) to the precise requested time window *before* finding slots
             const relevantEvents = fetchedEvents.filter(event => {
                 const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
                 const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
                 // Check overlap with the *precise* user-requested range [startDate, endDate)
                 return eventStart.isValid && eventEnd.isValid && eventStart < endDate && eventEnd > startDate;
             });
             console.log(`Filtered ${fetchedEvents.length} events down to ${relevantEvents.length} relevant for the precise slot search window.`);

            // Use the imported utility function (renamed to avoid conflict)
            const slotsResult = await findAvailableSlotsUtil(
                relevantEvents, // Pass precisely filtered events
                duration,
                startDate.toISO(), // Pass precise ISO strings to util
                endDate.toISO(),
                timePreference, // Pass preference directly
                activity // Pass activity directly
            );

            // findAvailableSlotsUtil should return an object like { slots: [...] } or { error: ..., slots: [] }
            // Return the result directly, adding a success flag based on whether an error occurred within the util
           // Return the slots array directly
           if (slotsResult.error) {
               throw new Error(slotsResult.error);
            }
            return slotsResult.slots || [];

        } catch (error) {
            console.error(`Error in findAvailableSlots tool (${duration}min, ${startDate.toISO()} to ${endDate.toISO()}):`, error);
            // Return a structured error object
            throw new Error(`Failed to find available slots: ${error.message}`);
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
                success: false, // Indicate data is not actual / API not implemented
                location: location,
                date: formattedDate,
                forecast: `Weather data for ${location} on ${formattedDate} is currently unavailable (feature not implemented).`, // Placeholder message
                error: "Weather API integration is pending."
            };
        } catch (error) {
            console.error(`Error fetching weather for ${location}, ${formattedDate}:`, error);
             return {
                 success: false,
                 location: location,
                 date: formattedDate,
                 error: `Failed to get weather forecast: ${error.message}`,
             };
        }
    },

    deleteCalendarEventsByQuery: async (args, userId = 'default', accessToken = null) => {
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
        let fetchedEvents = []; // Initialize events array

        try {
            // 1. Get all events potentially in the range (use cache)
            const cacheKeyStart = startDt.startOf('day').toISODate();
            const cacheKeyEnd = endDt.endOf('day').toISODate(); // Inclusive end day
            const tokenHash = accessToken.substring(accessToken.length - 10);
            const userIdCachePrefix = `user_${tokenHash}`;

            let cachedEvents = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);
             if (cachedEvents) {
                 console.log(`Cache HIT for bulk delete search ${cacheKeyStart} to ${cacheKeyEnd}`);
                 fetchedEvents = cachedEvents;
             } else {
                 console.log(`Cache MISS for bulk delete search ${cacheKeyStart} to ${cacheKeyEnd}`);
                 // Fetch broadly for potential caching benefit if deletion fails or is partial
                 const apiEvents = await fetchGCalendarEventsInternal(tokens, startDt.startOf('day').toJSDate(), endDate.endOf('day').toJSDate());
                 fetchedEvents = (Array.isArray(apiEvents)) ? apiEvents : [];
                 // Don't cache here immediately, as we might delete many. Cache might get invalidated anyway.
                 console.log(`Fetched ${fetchedEvents.length} potential events for bulk delete query.`);
             }

             // 2. Filter fetched events precisely by requested time *and* query
            const queryLower = query.toLowerCase();
            const matchingEvents = fetchedEvents.filter(event => {
                const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
                const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
                const summaryLower = event.summary?.toLowerCase() || '';

                return eventStart.isValid && eventEnd.isValid &&
                       eventStart < endDt && eventEnd > startDt && // Check time overlap with precise range
                       summaryLower.includes(queryLower); // Check summary match
            });

            if (matchingEvents.length === 0) {
                console.log(`No events matching "${query}" found in the specified range.`);
                return { success: true, message: `No events matching "${query}" found.`, deletedCount: 0 };
            }

            console.log(`Found ${matchingEvents.length} events matching query. Proceeding with deletion...`);

            // 3. Delete each matching event and invalidate cache individually
            const deleteResults = [];
            const failedDeletes = [];
            const invalidatedRanges = new Set(); // Track ranges to invalidate efficiently

            for (const event of matchingEvents) {
                try {
                    // Delete from Google Calendar
                    await deleteGCalendarEventInternal(tokens, event.id);
                     console.log(`Successfully deleted event from Google Calendar: ${event.id} ("${event.summary}")`);

                    // Delete associated metadata
                    if (userId !== 'default') {
                        try {
                            await deleteEventMetadata(userId, event.id);
                            console.log(`Successfully deleted metadata for event: ${event.id}`);
                        } catch (metadataError) {
                            console.error(`Error deleting metadata for event ${event.id} during bulk delete (proceeding):`, metadataError);
                            // Log but don't count as a primary failure
                        }
                    }

                    deleteResults.push({ id: event.id, summary: event.summary });

                    // Add event's range to the set for cache invalidation
                    const eventStartIso = event.start?.dateTime || event.start?.date;
                    const eventEndIso = event.end?.dateTime || event.end?.date;
                    if (eventStartIso && eventEndIso) {
                        invalidatedRanges.add(`${eventStartIso}|${eventEndIso}`);
                    }

                } catch (deleteError) {
                    console.error(`Failed to delete event ${event.id} ("${event.summary}") during bulk operation:`, deleteError);
                    failedDeletes.push({ id: event.id, summary: event.summary, error: deleteError.message });
                }
            }

            // 4. Invalidate cache for all affected ranges
            if (invalidatedRanges.size > 0) {
                console.log(`Invalidating cache for ${invalidatedRanges.size} unique date ranges.`);
                for (const rangeString of invalidatedRanges) {
                    const [start, end] = rangeString.split('|');
                    try {
                        await invalidateCache(tokens, start, end);
                         console.log(`Invalidated cache range: ${start} - ${end}`);
                    } catch(cacheError) {
                        console.error(`Cache invalidation error during bulk delete for range ${start}-${end}:`, cacheError);
                    }
                }
            } else if (deleteResults.length > 0) {
                // If deletes succeeded but ranges couldn't be determined, invalidate broadly
                console.warn("Could not determine specific ranges for cache invalidation during bulk delete, invalidating token cache.");
                try { await invalidateCache(tokens); }
                catch(cacheError) { console.error("Error invalidating cache after bulk delete (fallback):", cacheError); }
            }


            // 5. Compile and return result
             const successCount = deleteResults.length;
             let message = `Successfully deleted ${successCount} event(s) matching "${query}".`;
             if (failedDeletes.length > 0) {
                 message += ` Failed to delete ${failedDeletes.length} event(s). Check logs for details.`;
                 console.warn("Failures during bulk delete:", failedDeletes);
             }

            return {
                success: failedDeletes.length === 0, // Overall success only if no failures
                message: message,
                deletedCount: successCount,
                deletedItems: deleteResults, // List successful ones
                failedItems: failedDeletes   // List failures
            };

        } catch (error) {
            console.error(`Critical error during deleteCalendarEventsByQuery (${query}, ${start_date}-${end_date}):`, error);
             return {
                 success: false,
                 error: `An unexpected error occurred during the bulk delete operation: ${error.message}`,
                 deletedCount: 0
             };
        }
    }
};

// --- Exports ---
// Export the schema and the implementation map
export { tools, toolFunctions };