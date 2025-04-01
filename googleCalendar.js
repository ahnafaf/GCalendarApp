const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

/**
 * Creates and configures an OAuth2Client with the provided tokens
 * @param {Object} tokens - The tokens object containing access_token and optionally refresh_token
 * @returns {OAuth2Client} - Configured OAuth2Client instance
 */
function createOAuth2Client(tokens) {
  try {
    const credentials = require('./credentials.json');
    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
    
    // Handle both full tokens object and just access_token
    if (typeof tokens === 'object' && tokens !== null) {
      if (tokens.access_token) {
        // If it's just the access_token from NextAuth session
        oauth2Client.setCredentials({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: 'Bearer'
        });
      } else {
        // If it's a full tokens object
        oauth2Client.setCredentials(tokens);
      }
    } else {
      console.error('Invalid tokens format:', tokens);
      throw new Error('Invalid tokens format');
    }
    
    return oauth2Client;
  } catch (error) {
    console.error('Error creating OAuth2Client:', error);
    throw error;
  }
}

/**
 * Get calendar events for a specific date range
 * @param {Object} tokens - User's OAuth tokens
 * @param {Date} start_date - Start date for events
 * @param {Date} end_date - End date for events
 * @returns {Array} - List of calendar events
 */
async function getCalendarEvents(tokens, start_date, end_date) {
  try {
    const oauth2Client = createOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start_date.toISOString(),
      timeMax: end_date.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items || [];
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
}

/**
 * Add a new calendar event
 * @param {Object} tokens - User's OAuth tokens
 * @param {string} summary - Event title
 * @param {string} start - Event start time
 * @param {string} end - Event end time
 * @param {string} description - Event description
 * @param {string} location - Event location
 * @param {Array} reminders - Optional reminders in minutes
 * @returns {Object} - Created event data
 */
async function addCalendarEvent(tokens, summary, start, end, description, location, reminders) {
  const oauth2Client = createOAuth2Client(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const event = {
    summary,
    description,
    location,
    start: { dateTime: start },
    end: { dateTime: end },
  };
  
  // Add reminders if provided
  if (reminders && Array.isArray(reminders) && reminders.length > 0) {
    event.reminders = {
      useDefault: false,
      overrides: reminders.map(minutes => ({
        method: 'popup',
        minutes: minutes
      }))
    };
  }

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    return res.data;
  } catch (error) {
    console.error('Error adding event:', error);
    throw error;
  }
}

/**
 * Delete a calendar event
 * @param {Object} tokens - User's OAuth tokens
 * @param {string} eventId - ID of the event to delete 
 * @param {string} calendarId - Calendar ID (defaults to 'primary')
 * @returns {Object} - Deleted event summary
 */
async function deleteCalendarEvent(tokens, eventId, calendarId = 'primary') {
  // Validate inputs
  if (!tokens) {
    throw new Error('OAuth tokens are required');
  }
  
  if (!eventId) {
    throw new Error('Event ID is required');
  }
  
  const oauth2Client = createOAuth2Client(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    // First get the event to return its summary after deletion
    let eventSummary = null;
    try {
      const event = await calendar.events.get({
        calendarId: calendarId,
        eventId: eventId,
      });
      eventSummary = event.data.summary;
    } catch (getError) {
      console.warn(`Could not retrieve event details before deletion: ${getError.message}`);
    }
    
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId,
    });
    return { success: true, summary: eventSummary, eventId: eventId };
  } catch (error) {
    console.error(`Error deleting event ${eventId}:`, error.message);
    return { success: false, error: error.message, eventId: eventId };
  }
}

/**
 * Update a calendar event
 * @param {Object} tokens - User's OAuth tokens
 * @param {string} eventId - ID of the event to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Object} - Updated event data
 */
async function updateCalendarEvent(tokens, eventId, updates) {
  const oauth2Client = createOAuth2Client(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    // First get the current event
    const currentEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    // Prepare the update payload
    const updatedEvent = { ...currentEvent.data };
    
    if (updates.summary) updatedEvent.summary = updates.summary;
    if (updates.description) updatedEvent.description = updates.description;
    if (updates.location) updatedEvent.location = updates.location;
    
    if (updates.start) {
      updatedEvent.start = {
        dateTime: updates.start,
        timeZone: currentEvent.data.start.timeZone
      };
    }
    
    if (updates.end) {
      updatedEvent.end = {
        dateTime: updates.end,
        timeZone: currentEvent.data.end.timeZone
      };
    }
    
    // Update the event
    const res = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updatedEvent,
    });
    
    return res.data;
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}

module.exports = {
  createOAuth2Client,
  getCalendarEvents,
  addCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent
};
