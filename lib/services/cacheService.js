// ES Module imports
import NodeCache from 'node-cache';
import { DateTime } from 'luxon';
// Import the calendar function with correct name
import { getCalendarEvents } from '../../googleCalendar.js';
// Import Redis functions
import { getCachedEventsForDateRange, cacheEventsForDateRange, invalidateDateRangeCache } from '../redisClient.js';

// Consider calling initializeDatabase() at application startup

// --- Cache ---
const memoryCache = new NodeCache({ stdTTL: 300 }); // 5 minutes TTL

// --- Caching Logic ---
// (Keep getCachedEvents and invalidateCache as previously defined and refined)
async function getCachedEvents(tokens, start_date, end_date) {
  if (!tokens?.access_token) {
     console.warn("Attempting to get events without access token. Required for calendar operations.");
     throw new Error("User authentication required to fetch calendar events.");
  }
  // Derive a user-specific cache key prefix (more stable than token hash if possible)
  // For now, using token hash as fallback
  const tokenHash = tokens.access_token.substring(tokens.access_token.length - 10);
  const userIdCachePrefix = `user_${tokenHash}`; // Replace with stable user ID if available

  // Normalize dates for cache key consistency
  const cacheKeyStart = DateTime.fromISO(start_date).toISODate();
  const cacheKeyEnd = DateTime.fromISO(end_date).toISODate();
   if (!cacheKeyStart || !cacheKeyEnd) {
       throw new Error(`Invalid date format for caching: ${start_date}, ${end_date}`);
   }

  try {
    const cachedEvents = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);
    if (cachedEvents) {
      console.log(`Cache HIT for events ${cacheKeyStart} to ${cacheKeyEnd}`);
      // Ensure it returns an array even if cache stores null/undefined mistakenly
      return Array.isArray(cachedEvents) ? cachedEvents : [];
    }
     console.log(`Cache MISS for events ${cacheKeyStart} to ${cacheKeyEnd}`);

    // Fetch from API using the actual Calendar function
    const events = await getCalendarEvents(tokens, new Date(start_date), new Date(end_date)); // Use imported function
    if (events && Array.isArray(events)) {
      await cacheEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd, events, 300); // 5 min TTL
      console.log(`Stored events in Redis cache for ${cacheKeyStart} to ${cacheKeyEnd}`);
      return events;
    } else {
        console.warn(`No events returned or non-array from fetchGCalendarEvents for ${cacheKeyStart}-${cacheKeyEnd}`);
        return []; // Return empty array on failure or non-array result
    }
  } catch (error) {
    console.error(`Error in getCachedEvents (${cacheKeyStart} to ${cacheKeyEnd}):`, error);
    throw new Error(`Failed to fetch or cache calendar events: ${error.message}`);
  }
}

async function invalidateCache(tokens = null, startDate = null, endDate = null) {
    memoryCache.flushAll(); // Always flush memory cache
    console.log("Memory cache invalidated");

    if (tokens?.access_token && startDate && endDate) {
        try {
            const tokenHash = tokens.access_token.substring(tokens.access_token.length - 10);
            const userIdCachePrefix = `user_${tokenHash}`; // Use consistent prefix
            const startKey = DateTime.fromISO(startDate).toISODate();
            const endKey = DateTime.fromISO(endDate).toISODate();
             if (!startKey || !endKey) {
                 console.warn(`Cannot invalidate Redis: Invalid date format ${startDate}, ${endDate}`);
                 return;
             }
            await invalidateDateRangeCache(userIdCachePrefix, startKey, endKey);
            console.log(`Invalidated Redis cache for user ${userIdCachePrefix}, range ${startKey} to ${endKey}`);
        } catch (error) {
            console.error("Error invalidating Redis date range cache:", error);
        }
    } else {
        console.log("Skipping granular Redis cache invalidation (missing token or date range)");
    }
}

// Export the functions
export { getCachedEvents, invalidateCache };
