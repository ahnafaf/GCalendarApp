import { DateTime, Interval, Duration } from 'luxon';

/**
 * Default working hours configuration
 * Can be extended to fetch from user preferences in the future
 */
const DEFAULT_WORKING_HOURS = {
  start: 9, // 9 AM
  end: 17,  // 5 PM
  workDays: [1, 2, 3, 4, 5], // Monday to Friday (1-5)
};

/**
 * Find available time slots for a new event
 * @param {Array} events - List of calendar events
 * @param {number} duration - Duration of the event in minutes
 * @param {string} startDate - Start date to search from in ISO format
 * @param {string} endDate - End date to search until in ISO format
 * @param {string} activity - Type of activity being scheduled
 * @param {string} timePreference - Preferred time of day (morning, afternoon, evening, any)
 * @param {Object} workingHours - Optional working hours configuration
 * @returns {Array} - List of available time slots with pros and cons
 */
export function findAvailableSlots(
  events, 
  duration, 
  startDate, 
  endDate, 
  activity, 
  timePreference = 'any',
  workingHours = DEFAULT_WORKING_HOURS
) {
  // Convert inputs to Luxon objects
  const start = DateTime.fromISO(startDate);
  const end = DateTime.fromISO(endDate);
  const durationMinutes = duration;
  
  // Create a list of busy intervals from events
  const busyIntervals = events.map(event => {
    const eventStart = DateTime.fromISO(event.start.dateTime || event.start.date);
    const eventEnd = DateTime.fromISO(event.end.dateTime || event.end.date);
    return {
      interval: Interval.fromDateTimes(eventStart, eventEnd),
      summary: event.summary
    };
  });
  
  // Generate potential slots
  const slots = generatePotentialSlots(
    start, 
    end, 
    durationMinutes, 
    busyIntervals, 
    timePreference,
    workingHours
  );
  
  // Evaluate and rank slots
  const evaluatedSlots = evaluateSlots(
    slots, 
    busyIntervals, 
    durationMinutes, 
    activity, 
    timePreference
  );
  
  // Return top slots (limited to 3)
  return evaluatedSlots.slice(0, 3);
}

/**
 * Generate potential time slots based on constraints
 * @param {DateTime} start - Start date/time to search from
 * @param {DateTime} end - End date/time to search until
 * @param {number} durationMinutes - Duration in minutes
 * @param {Array} busyIntervals - List of busy time intervals
 * @param {string} timePreference - Preferred time of day
 * @param {Object} workingHours - Working hours configuration
 * @returns {Array} - List of potential time slots
 */
function generatePotentialSlots(
  start, 
  end, 
  durationMinutes, 
  busyIntervals, 
  timePreference,
  workingHours
) {
  const slots = [];
  const slotDuration = Duration.fromObject({ minutes: durationMinutes });
  
  // Start from the beginning of the search period
  let currentTime = start;
  
  // Iterate through each day in the search period
  while (currentTime < end) {
    // Check if this is a working day
    const isWorkingDay = workingHours.workDays.includes(currentTime.weekday);
    
    if (isWorkingDay) {
      // Set start time to either current time or beginning of working hours
      let dayStart = currentTime.set({ 
        hour: workingHours.start, 
        minute: 0, 
        second: 0, 
        millisecond: 0 
      });
      
      // If we're already past the working hours start for today, use current time
      if (currentTime > dayStart) {
        dayStart = currentTime;
      }
      
      // End of working hours for today
      const dayEnd = currentTime.set({ 
        hour: workingHours.end, 
        minute: 0, 
        second: 0, 
        millisecond: 0 
      });
      
      // Generate slots for this day
      let slotStart = dayStart;
      
      // Use 30-minute increments for slot generation
      while (slotStart.plus(slotDuration) <= dayEnd) {
        const slotEnd = slotStart.plus(slotDuration);
        const currentSlot = Interval.fromDateTimes(slotStart, slotEnd);
        
        // Check if this slot overlaps with any busy intervals
        const isAvailable = !busyIntervals.some(busy => 
          busy.interval.overlaps(currentSlot)
        );
        
        if (isAvailable) {
          // Check if this slot matches the time preference
          const hour = slotStart.hour;
          let matchesPreference = true;
          
          if (timePreference === 'morning' && (hour < 8 || hour >= 12)) {
            matchesPreference = false;
          } else if (timePreference === 'afternoon' && (hour < 12 || hour >= 17)) {
            matchesPreference = false;
          } else if (timePreference === 'evening' && (hour < 17 || hour >= 21)) {
            matchesPreference = false;
          }
          
          if (matchesPreference) {
            slots.push({
              start: slotStart.toISO(),
              end: slotEnd.toISO(),
              startDateTime: slotStart,
              endDateTime: slotEnd
            });
          }
        }
        
        // Move to next slot (30-minute increments)
        slotStart = slotStart.plus({ minutes: 30 });
      }
    }
    
    // Move to next day
    currentTime = currentTime.plus({ days: 1 }).startOf('day');
  }
  
  return slots;
}

/**
 * Evaluate and rank available time slots
 * @param {Array} slots - List of potential time slots
 * @param {Array} busyIntervals - List of busy time intervals
 * @param {number} durationMinutes - Duration in minutes
 * @param {string} activity - Type of activity
 * @param {string} timePreference - Preferred time of day
 * @returns {Array} - Evaluated and ranked slots with pros and cons
 */
function evaluateSlots(slots, busyIntervals, durationMinutes, activity, timePreference) {
  return slots.map(slot => {
    const slotStart = DateTime.fromISO(slot.start);
    const slotEnd = DateTime.fromISO(slot.end);
    const slotInterval = Interval.fromDateTimes(slotStart, slotEnd);
    
    // Generate pros and cons
    const { pros, cons } = generateProsAndCons(
      slotStart, 
      slotEnd, 
      busyIntervals, 
      activity, 
      timePreference
    );
    
    // Calculate a score based on pros and cons
    const score = calculateScore(slotStart, pros, cons, timePreference);
    
    return {
      start: slot.start,
      end: slot.end,
      pros,
      cons,
      score
    };
  })
  // Sort by score (highest first)
  .sort((a, b) => b.score - a.score);
}

/**
 * Generate pros and cons for a time slot
 * @param {DateTime} slotStart - Start time of the slot
 * @param {DateTime} slotEnd - End time of the slot
 * @param {Array} busyIntervals - List of busy time intervals
 * @param {string} activity - Type of activity
 * @param {string} timePreference - Preferred time of day
 * @returns {Object} - Object containing pros and cons arrays
 */
function generateProsAndCons(slotStart, slotEnd, busyIntervals, activity, timePreference) {
  const pros = [];
  const cons = [];
  
  // Time of day factors
  const hour = slotStart.hour;
  
  // Check if slot is during preferred time
  if (timePreference === 'morning' && hour >= 8 && hour < 12) {
    pros.push('Matches your morning time preference');
  } else if (timePreference === 'afternoon' && hour >= 12 && hour < 17) {
    pros.push('Matches your afternoon time preference');
  } else if (timePreference === 'evening' && hour >= 17 && hour < 21) {
    pros.push('Matches your evening time preference');
  } else if (timePreference !== 'any') {
    cons.push(`Outside your preferred ${timePreference} time`);
  }
  
  // Early morning/late evening factors
  if (hour < 8) {
    cons.push('Early morning slot may be difficult to attend');
  } else if (hour >= 20) {
    cons.push('Late evening slot may interfere with personal time');
  }
  
  // Ideal working hours
  if (hour >= 9 && hour < 17) {
    pros.push('During standard working hours');
  }
  
  // Lunch time
  if (hour >= 12 && hour < 14) {
    if (activity.toLowerCase().includes('lunch') || 
        activity.toLowerCase().includes('meal') || 
        activity.toLowerCase().includes('eat')) {
      pros.push('Ideal time for a meal');
    } else {
      cons.push('May conflict with lunch time');
    }
  }
  
  // Proximity to other events
  const bufferTime = Duration.fromObject({ minutes: 30 });
  let hasEventBefore = false;
  let hasEventAfter = false;
  
  for (const busy of busyIntervals) {
    const busyEnd = busy.interval.end;
    const busyStart = busy.interval.start;
    
    // Check if there's an event ending right before this slot
    if (busyEnd <= slotStart && busyEnd.plus(bufferTime) >= slotStart) {
      hasEventBefore = true;
      pros.push(`Convenient timing after "${busy.summary}"`);
    }
    
    // Check if there's an event starting right after this slot
    if (busyStart >= slotEnd && busyStart.minus(bufferTime) <= slotEnd) {
      hasEventAfter = true;
      pros.push(`Convenient timing before "${busy.summary}"`);
    }
  }
  
  // If the slot is sandwiched between events
  if (hasEventBefore && hasEventAfter) {
    pros.push('Efficiently uses gap between events');
  }
  
  // Day of week factors
  const dayOfWeek = slotStart.weekday;
  
  if (dayOfWeek === 1) { // Monday
    if (hour < 11) {
      cons.push('Early Monday morning may be busy with weekly planning');
    } else {
      pros.push('Good for setting the tone for the week');
    }
  } else if (dayOfWeek === 5) { // Friday
    if (hour >= 15) {
      cons.push('Late Friday may conflict with weekend plans');
    } else {
      pros.push('Good for wrapping up the week');
    }
  } else if (dayOfWeek === 6 || dayOfWeek === 7) { // Weekend
    if (activity.toLowerCase().includes('work') || 
        activity.toLowerCase().includes('meeting') || 
        activity.toLowerCase().includes('call')) {
      cons.push('Weekend slot for work-related activity');
    } else {
      pros.push('Weekend slot good for personal activities');
    }
  }
  
  // Activity-specific factors
  if (activity.toLowerCase().includes('exercise') || 
      activity.toLowerCase().includes('workout') || 
      activity.toLowerCase().includes('gym')) {
    if (hour >= 6 && hour < 9) {
      pros.push('Morning exercise can boost energy for the day');
    } else if (hour >= 17 && hour < 20) {
      pros.push('Evening exercise can help unwind after work');
    }
  }
  
  // Ensure we have at least one pro and con
  if (pros.length === 0) {
    pros.push('Available time slot that fits your schedule');
  }
  
  if (cons.length === 0) {
    // Look for any minor drawback
    if (slotStart.minute !== 0 && slotStart.minute !== 30) {
      cons.push('Starts at an unusual time');
    } else if (dayOfWeek >= 1 && dayOfWeek <= 5 && (hour < 9 || hour >= 17)) {
      cons.push('Outside standard working hours');
    } else {
      cons.push('No significant drawbacks identified');
    }
  }
  
  return { pros, cons };
}

/**
 * Calculate a score for ranking time slots
 * @param {DateTime} slotStart - Start time of the slot
 * @param {Array} pros - List of pros
 * @param {Array} cons - List of cons
 * @param {string} timePreference - Preferred time of day
 * @returns {number} - Score for ranking
 */
function calculateScore(slotStart, pros, cons, timePreference) {
  let score = 0;
  
  // Base score from pros and cons count
  score += pros.length * 10;
  score -= cons.length * 8;
  
  // Preferred time bonus
  const hour = slotStart.hour;
  if (timePreference === 'morning' && hour >= 8 && hour < 12) {
    score += 15;
  } else if (timePreference === 'afternoon' && hour >= 12 && hour < 17) {
    score += 15;
  } else if (timePreference === 'evening' && hour >= 17 && hour < 21) {
    score += 15;
  }
  
  // Ideal working hours bonus
  if (hour >= 9 && hour < 17) {
    score += 5;
  }
  
  // Prefer earlier slots when all else is equal (for consistent sorting)
  score -= slotStart.hour * 0.1;
  
  return score;
}

/**
 * Format available slots for display
 * @param {Array} slots - List of available slots with pros and cons
 * @returns {string} - Formatted string for display
 */
export function formatAvailableSlots(slots) {
  if (!slots || slots.length === 0) {
    return "No available slots found.";
  }
  
  let result = "Available time slots:\n\n";
  
  slots.forEach((slot, index) => {
    const start = DateTime.fromISO(slot.start);
    const end = DateTime.fromISO(slot.end);
    
    result += `Option ${index + 1}: ${start.toFormat('ccc, LLL d')} from ${start.toFormat('h:mm a')} to ${end.toFormat('h:mm a')}\n`;
    
    result += "Pros:\n";
    slot.pros.forEach(pro => {
      result += `- ${pro}\n`;
    });
    
    result += "Cons:\n";
    slot.cons.forEach(con => {
      result += `- ${con}\n`;
    });
    
    if (index < slots.length - 1) {
      result += "\n";
    }
  });
  
  return result;
}