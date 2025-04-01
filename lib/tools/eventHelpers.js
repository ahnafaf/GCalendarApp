
import { DateTime } from 'luxon';
import { getCachedEvents } from '../services/cacheService.js';
import { formatCalendarEvents, formatToolResponse } from './formatters.js';
import { findAvailableSlots } from './schedulingUtils.js';

// --- Additional Utility Functions ---
async function listTodaysEvents(accessToken = null) {
  if (!accessToken) return "Authentication required.";
  try {
    const tokens = { access_token: accessToken };
    const today = DateTime.now();
    const startOfDay = today.startOf('day').toISO();
    const endOfDay = today.endOf('day').toISO();
    const events = await getCachedEvents(tokens, startOfDay, endOfDay);
    return formatCalendarEvents(events);
  } catch (error) {
    console.error("Failed to fetch today's events:", error);
    return `Failed to fetch events: ${error.message}`;
  }
}

async function suggestEventTime(duration, preferredTime = 'any', accessToken = null, activity = "event") {
   if (!accessToken) return "Authentication required.";
   if (!duration || typeof duration !== 'number' || duration <= 0) return "Invalid duration.";
  try {
    const tokens = { access_token: accessToken };
    const now = DateTime.now();
    const startDate = now.toISO();
    const endDate = now.plus({ days: 7 }).endOf('day').toISO(); // Search next 7 days
    const suggestions = await findAvailableSlots(
      [], // Will be fetched inside findAvailableSlots
      duration, 
      startDate, 
      endDate, 
      activity,
      preferredTime
    );
    return formatToolResponse('findAvailableSlots', suggestions);
  } catch (error) {
    console.error("Failed to suggest event time:", error);
    return `Failed to suggest time: ${error.message}`;
  }
}

// Export the functions
export { listTodaysEvents, suggestEventTime };
