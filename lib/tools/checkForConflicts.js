// lib/tools/checkForConflicts.js
import { DateTime } from 'luxon';
import { getCachedEvents } from '../services/cacheService.js';
import { findAvailableSlots } from './schedulingUtils.js';

// --- Conflict Checking ---
// (Keep checkForConflicts as previously defined and refined)
async function checkForConflicts(tokens, start, end) {
  try {
    const checkStart = DateTime.fromISO(start);
    const checkEnd = DateTime.fromISO(end);

    if (!checkStart.isValid || !checkEnd.isValid) {
        throw new Error(`Invalid start/end time for conflict check: start=${start}, end=${end}`);
    }

    const dayStart = checkStart.startOf('day').toISO();
    const dayEnd = checkEnd.endOf('day').toISO(); // Check whole day for simplicity

    const events = await getCachedEvents(tokens, dayStart, dayEnd);

    const conflicts = events.filter(event => {
       try {
           const eventStart = DateTime.fromISO(event.start?.dateTime || event.start?.date);
           const eventEnd = DateTime.fromISO(event.end?.dateTime || event.end?.date);
           if (!eventStart.isValid || !eventEnd.isValid) return false; // Skip invalid event data
           return eventStart < checkEnd && checkStart < eventEnd; // Overlap condition
       } catch { return false; } // Ignore parsing errors for individual events
    });

    if (conflicts.length > 0) {
      console.log(`Conflict detected for ${start} - ${end}.`);
      const duration = checkEnd.diff(checkStart, 'minutes').minutes;
      // Ensure findAvailableSlotsUtil handles potential errors gracefully
      let suggestions = [];
      try {
           suggestions = await findAvailableSlots(events, duration, dayStart, dayEnd, "Event", "any");
      } catch (suggestionError) {
           console.error("Error finding suggestions during conflict check:", suggestionError);
      }
      return { conflicts: true, suggestions: suggestions || [] };
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
