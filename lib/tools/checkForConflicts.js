// lib/tools/checkForConflicts.js
import { DateTime } from 'luxon';
import { getCachedEvents } from '../services/cacheService.js';
import { getUserTimezone, convertToUTCISOString } from './timeUtils.js';
import { findAvailableSlots } from './schedulingUtils.js';

// --- Conflict Checking ---
async function checkForConflicts(tokens, start, end, overrideConflict = false) {
  try {
    // Ensure start and end times have proper timezone information
    const userTimezone = getUserTimezone();
    const startWithTz = typeof start === 'string' ? convertToUTCISOString(start, userTimezone) : start;
    const endWithTz = typeof end === 'string' ? convertToUTCISOString(end, userTimezone) : end;
    
    const checkStart = DateTime.fromISO(startWithTz);
    const checkEnd = DateTime.fromISO(endWithTz);
    
    console.log(`Checking conflicts for: ${startWithTz} to ${endWithTz}`);
    console.log(`Parsed DateTime objects: ${checkStart.toISO()} to ${checkEnd.toISO()}`);
    console.log(`Override conflict flag: ${overrideConflict}`);

    if (!checkStart.isValid || !checkEnd.isValid) {
        throw new Error(`Invalid start/end time for conflict check: start=${startWithTz}, end=${endWithTz}`);
    }

    // Use the exact time range instead of the whole day to avoid unnecessary conflicts
    // This is especially important for events after 7 PM Zulu time
    const fetchStart = checkStart.minus({ hours: 1 }).toISO(); // Buffer of 1 hour before
    const fetchEnd = checkEnd.plus({ hours: 1 }).toISO();   // Buffer of 1 hour after
    
    console.log(`Fetching events from: ${fetchStart} to ${fetchEnd}`);

    const events = await getCachedEvents(tokens, fetchStart, fetchEnd);
    console.log(`Found ${events.length} events in the fetch window`);

    const conflicts = events.filter(event => {
       try {
           const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
           const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
           
           // Debug log for events near the conflict time
           console.log(`Comparing with event: "${event.summary}" - ${eventStart.toISO()} to ${eventEnd.toISO()}`);
           
           if (!eventStart.isValid || !eventEnd.isValid) return false; // Skip invalid event data
           
           // Check if this is an all-day event (has date but no dateTime)
           const isAllDayEvent = event.start?.date && !event.start?.dateTime;
           
           // Strict overlap condition - events must actually overlap in time
           let overlaps = eventStart < checkEnd && checkStart < eventEnd;
           
           // For all-day events, don't consider them as conflicts unless explicitly configured
           // This allows regular timed events to be scheduled during all-day events
           if (isAllDayEvent) {
               // Check if the event summary contains keywords that indicate it should block time
               const blockingKeywords = ['meeting', 'appointment', 'interview', 'call', 'conference'];
               const shouldBlock = blockingKeywords.some(keyword => 
                   event.summary?.toLowerCase().includes(keyword)
               );
               
               if (!shouldBlock) {
                   console.log(`All-day event "${event.summary}" is not blocking time slots.`);
                   overlaps = false; // Don't consider this a conflict
               } else {
                   console.log(`All-day event "${event.summary}" is blocking time slots due to keywords.`);
               }
           }
           
           if (overlaps) {
               console.log(`CONFLICT detected with: "${event.summary}" - ${eventStart.toISO()} to ${eventEnd.toISO()}`);
           }
           
           return overlaps;
       } catch { return false; } // Ignore parsing errors for individual events
    });

    if (conflicts.length > 0 && !overrideConflict) {
      console.log(`Conflict detected for ${startWithTz} - ${endWithTz}. Override flag: ${overrideConflict}`);
      const duration = checkEnd.diff(checkStart, 'minutes').minutes;
      // Ensure findAvailableSlotsUtil handles potential errors gracefully
      let suggestions = [];
      try {
            // Use a wider range for suggestions but centered around the requested time
            const suggestStart = checkStart.minus({ hours: 12 }).toISO();
            const suggestEnd = checkEnd.plus({ hours: 12 }).toISO();
           suggestions = await findAvailableSlots(events, duration, suggestStart, suggestEnd, "Event", "any");
      } catch (suggestionError) {
           console.error("Error finding suggestions during conflict check:", suggestionError);
      }
      return { conflicts: true, suggestions: suggestions || [] };
    } else if (conflicts.length > 0 && overrideConflict) {
      console.log(`Conflict detected but override flag is set to true. Proceeding with event creation.`);
      return { conflicts: false, overridden: true, conflictCount: conflicts.length };
    }
    return { conflicts: false, suggestions: [] };
  } catch (error) {
      console.error("Error checking for conflicts:", error);
      // Return conflict=true to be safe on error, prevents accidental scheduling
      return { conflicts: true, suggestions: [], error: `Conflict check failed: ${error.message}` };
  }
}

// Export the function
export { checkForConflicts };
