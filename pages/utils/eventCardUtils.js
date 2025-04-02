// utils/eventCardUtils.js
import { DateTime } from 'luxon';

/**
 * Converts a Google Calendar event object to the format expected by the EventCard component
 * @param {Object} event - Google Calendar event object
 * @returns {Object} - Formatted event data for EventCard
 */
export const formatEventForCard = (event) => {
  if (!event) return null;

  try {
    // Extract start and end times
    const start = event.start?.dateTime 
      ? DateTime.fromISO(event.start.dateTime) 
      : event.start?.date 
        ? DateTime.fromISO(event.start.date) 
        : null;
    
    const end = event.end?.dateTime 
      ? DateTime.fromISO(event.end.dateTime) 
      : event.end?.date 
        ? DateTime.fromISO(event.end.date) 
        : null;

    if (!start || !start.isValid) {
      console.error('Invalid start date/time for event:', event);
      return null;
    }

    const isAllDay = !event.start?.dateTime;
    
    return {
      title: event.summary || '(No Title)',
      startDate: start.toFormat('MMM d'), // Format: "Apr 1"
      startTime: isAllDay ? 'All Day' : start.toFormat('h:mm a').replace(':00', ''), // Format: "10 AM" instead of "10:00 AM"
      endTime: isAllDay ? '' : end?.isValid ? end.toFormat('h:mm a').replace(':00', '') : '', // Format: "11:30 AM"
      location: event.location || '',
      description: event.description || '',
      id: event.id,
      isAllDay,
      rawEvent: event // Include the raw event for reference if needed
    };
  } catch (error) {
    console.error('Error formatting event for card:', error, event);
    return null;
  }
};

/**
 * Converts an array of Google Calendar events to the format expected by EventCard components
 * @param {Array} events - Array of Google Calendar event objects
 * @returns {Array} - Array of formatted event data for EventCard
 */
export const formatEventsForCards = (events) => {
  if (!events || !Array.isArray(events)) return [];
  
  return events
    .map(formatEventForCard)
    .filter(event => event !== null); // Filter out any events that failed to format
};