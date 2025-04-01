import { DateTime } from 'luxon';
import * as chrono from 'chrono-node';

/**
 * Gets the user's configured timezone.
 * In a real application, this should ideally fetch from user database preferences
 * or potentially derive from the user's session/request context.
 *
 * @returns {string} - User's IANA timezone string (e.g., "America/Winnipeg"). Defaults to 'UTC'.
 */
export function getUserTimezone() {
  try {
    // --- PLACEHOLDER: Replace with actual logic ---
    // Option 1: Fetch from User Preferences (requires passing userId or context)
    // const userPrefs = await fetchUserPreferences(userId);
    // if (userPrefs?.timezone) return userPrefs.timezone;

    // Option 2: Get from environment/config (less flexible)
    // if (process.env.DEFAULT_USER_TIMEZONE) return process.env.DEFAULT_USER_TIMEZONE;

    // Fallback for this example (as used previously)
    const defaultTimezone = 'America/Winnipeg'; // Or load from .env
    console.log(`DEBUG: Using timezone: ${defaultTimezone}`); // Add log for visibility
    return defaultTimezone;
    // --- End Placeholder ---

  } catch (error) {
    console.error('Error getting user timezone:', error);
    return 'UTC'; // Safe fallback
  }
}


/**
 * Converts a potentially natural language date/time string into a standardized
 * ISO 8601 UTC string (YYYY-MM-DDTHH:mm:ssZ).
 * It uses chrono-node for parsing and Luxon for timezone handling and formatting.
 * Interprets ambiguous times relative to the user's local timezone.
 *
 * @param {string} timeString - The date/time string from user/LLM (e.g., "Friday at 2 PM", "tomorrow morning", "2025-04-04T14:00:00").
 * @param {string} [userTimezone] - Optional. The user's IANA timezone (e.g., "America/Winnipeg"). If not provided, getUserTimezone() is called.
 * @returns {string | null} - The date/time in ISO 8601 UTC format (ending in 'Z'), or null if parsing fails.
 */
export function convertToUTCISOString(timeString, userTimezone) {
  if (!timeString) {
    console.error('convertToUTCISOString received empty timeString.');
    return null;
  }

  const tz = userTimezone || getUserTimezone();

  try {
    // --- Step 1: Handle if input is ALREADY a valid ISO string ---
    // Basic check first to avoid unnecessary chrono parsing
    if (typeof timeString === 'string' && timeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        const dtFromISO = DateTime.fromISO(timeString, { zone: 'keepLocalTime' }); // Try parsing first

        if (dtFromISO.isValid) {
            let finalDt;
            // Check if the original string had timezone info (Z or offset)
            if (timeString.includes('Z') || timeString.includes('+') || timeString.match(/-\d{2}:\d{2}$/)) {
                 // It has timezone info, use it directly but ensure it's DateTime object
                 finalDt = DateTime.fromISO(timeString, { setZone: true }); // Let Luxon handle the provided zone/offset
                 console.log(`DEBUG: Parsed existing ISO with TZ: ${timeString} -> ${finalDt.toISO()}`);
            } else {
                 // No timezone info, assume it's in the user's local timezone
                 finalDt = DateTime.fromISO(timeString, { zone: tz }); // Interpret in user's zone
                 console.log(`DEBUG: Parsed existing ISO (assumed local ${tz}): ${timeString} -> ${finalDt.toISO()}`);
            }

            // Ensure the final result is valid and convert to UTC ISO
            if (finalDt.isValid) {
                 return finalDt.toUTC().set({ millisecond: 0 }).toISO(); // Convert to UTC
            } else {
                 console.warn(`convertToUTCISOString: Luxon deemed parsed ISO invalid: ${timeString}`);
                 // Fall through to chrono parsing as a last resort maybe? Or return null? Let's return null for now.
                 return null;
            }
        }
         // If Luxon couldn't parse it as ISO, let chrono try below
         console.log(`DEBUG: Input looked like ISO but failed Luxon parse, trying chrono: ${timeString}`);
    }


    // --- Step 2: Use chrono-node for natural language parsing ---
    // Create a reference date ("now") in the user's timezone for chrono's context
    const referenceDate = DateTime.now().setZone(tz).toJSDate();

    // Use chrono.parseDate which returns a single Date object or null
    // 'forwardDate: true' helps interpret ambiguous dates (like "Friday") as upcoming
    const parsedDate = chrono.parseDate(timeString, referenceDate, { forwardDate: true });

    if (!parsedDate) {
      console.warn(`convertToUTCISOString: chrono-node could not parse: "${timeString}" with reference timezone ${tz}`);
      return null; // Parsing failed
    }

    // --- Step 3: Convert the JS Date (interpreted relative to user TZ) to UTC ISO ---
    // Wrap the JS Date in Luxon, explicitly state it represents time in the user's zone, then convert to UTC
    const finalDt = DateTime.fromJSDate(parsedDate, { zone: tz });

    if (!finalDt.isValid) {
        console.error(`convertToUTCISOString: Luxon failed to create valid DateTime from chrono result for "${timeString}"`);
        return null;
    }

    console.log(`DEBUG: Parsed NL "${timeString}" (ref: ${tz}) -> ${finalDt.toISO()}`);

    // Convert to UTC and format as ISO 8601 string, removing milliseconds
    const utcIsoString = finalDt.toUTC().set({ millisecond: 0 }).toISO();
    console.log(`DEBUG: Converted "${timeString}" to UTC ISO: ${utcIsoString}`);

    return utcIsoString;

  } catch (error) {
    console.error(`Error converting time string "${timeString}" to UTC ISO with timezone ${tz}:`, error);
    return null; // Return null on error
  }
}

// Example Usage (for testing, not part of the export usually):
/*
const userTZ = getUserTimezone(); // e.g., "America/Winnipeg"
console.log("User Timezone:", userTZ);
console.log("--- Examples ---");
console.log(`"Friday at 2 PM" ->`, convertToUTCISOString("Friday at 2 PM", userTZ));
console.log(`"tomorrow morning" ->`, convertToUTCISOString("tomorrow morning", userTZ)); // Chrono defaults morning to ~9 AM
console.log(`"next monday 10:30am" ->`, convertToUTCISOString("next monday 10:30am", userTZ));
console.log(`"2025-04-04T14:00:00" ->`, convertToUTCISOString("2025-04-04T14:00:00", userTZ)); // Assumes local time
console.log(`"2025-04-04T19:00:00-05:00" ->`, convertToUTCISOString("2025-04-04T19:00:00-05:00", userTZ)); // Has offset
console.log(`"2025-04-04T19:00:00Z" ->`, convertToUTCISOString("2025-04-04T19:00:00Z", userTZ)); // Already UTC
console.log(`"gibberish" ->`, convertToUTCISOString("gibberish", userTZ));
*/