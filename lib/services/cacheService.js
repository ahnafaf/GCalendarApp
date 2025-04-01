// ES Module imports
import NodeCache from 'node-cache';
import { DateTime } from 'luxon';
import { getUserTimezone, convertToUTCISOString } from '../tools/timeUtils.js';
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
  
  // Ensure start_date and end_date have proper timezone information
  const userTimezone = getUserTimezone();
  const startWithTz = typeof start_date === 'string' ? convertToUTCISOString(start_date, userTimezone) || start_date : start_date;
  const endWithTz = typeof end_date === 'string' ? convertToUTCISOString(end_date, userTimezone) || end_date : end_date;
  
  // Derive a user-specific cache key prefix (more stable than token hash if possible)
  // For now, using token hash as fallback
  const tokenHash = tokens.access_token.substring(tokens.access_token.length - 10);
  const userIdCachePrefix = `user_${tokenHash}`; // Replace with stable user ID if available

  // Parse dates and preserve timezone information
  const startDt = DateTime.fromISO(startWithTz);
  const endDt = DateTime.fromISO(endWithTz);
  
  // Log the original and parsed dates for debugging
  console.log(`getCachedEvents original range: ${start_date} to ${end_date} (converted to: ${startWithTz} to ${endWithTz})`);
  console.log(`getCachedEvents parsed range: ${startDt.toISO()} to ${endDt.toISO()}`);
  
  // Use full ISO strings for cache keys to preserve timezone information
  // This is especially important for events after 7 PM Zulu time
  const cacheKeyStart = startDt.toISO();
  const cacheKeyEnd = endDt.toISO();
  
   if (!cacheKeyStart || !cacheKeyEnd) {
       throw new Error(`Invalid date format for caching: ${start_date}, ${end_date}`);
   }

  try {
    const cachedEvents = await getCachedEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd);
    if (cachedEvents) {
      console.log(`Cache HIT for events from ${cacheKeyStart} to ${cacheKeyEnd}`);
      // Ensure it returns an array even if cache stores null/undefined mistakenly
      return Array.isArray(cachedEvents) ? cachedEvents : [];
    }
     console.log(`Cache MISS for events from ${cacheKeyStart} to ${cacheKeyEnd}`);

    // Fetch from API using the actual Calendar function
    // Pass the exact ISO strings to preserve timezone information
    const events = await getCalendarEvents(tokens, new Date(startWithTz), new Date(endWithTz));
    if (events && Array.isArray(events)) {
      await cacheEventsForDateRange(userIdCachePrefix, cacheKeyStart, cacheKeyEnd, events, 300); // 5 min TTL
      console.log(`Stored ${events.length} events in Redis cache for range ${cacheKeyStart} to ${cacheKeyEnd}`);
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
    
    // If we have a specific date range to invalidate
    if (tokens?.access_token && startDate && endDate) {
        try {
            // Ensure startDate and endDate have proper timezone information
            const userTimezone = getUserTimezone();
            const startWithTz = typeof startDate === 'string' ? convertToUTCISOString(startDate, userTimezone) || startDate : startDate;
            const endWithTz = typeof endDate === 'string' ? convertToUTCISOString(endDate, userTimezone) || endDate : endDate;

            const tokenHash = tokens.access_token.substring(tokens.access_token.length - 10);
            const userIdCachePrefix = `user_${tokenHash}`; // Use consistent prefix
            
            // Parse dates and preserve timezone information
            const startDt = DateTime.fromISO(startWithTz);
            const endDt = DateTime.fromISO(endWithTz);
            
            // Log the original and parsed dates for debugging
            console.log(`invalidateCache original range: ${startDate} to ${endDate} (converted to: ${startWithTz} to ${endWithTz})`);
            console.log(`invalidateCache parsed range: ${startDt.toISO()} to ${endDt.toISO()}`);
            
            // Use full ISO strings for cache keys to preserve timezone information
            const startKey = startDt.toISO();
            const endKey = endDt.toISO();
            
            if (!startKey || !endKey) {
                 console.warn(`Cannot invalidate Redis: Invalid date format ${startDate}, ${endDate}`);
                 return;
             }
            await invalidateDateRangeCache(userIdCachePrefix, startKey, endKey);
            console.log(`Invalidated Redis cache for user ${userIdCachePrefix}, exact range ${startKey} to ${endKey}`);
        } catch (error) {
            console.error("Error invalidating Redis date range cache:", error);
        }
    } else {
        console.log("Skipping granular Redis cache invalidation (missing token or date range)");
    }
}

// Export the functions
export { getCachedEvents, invalidateCache };
