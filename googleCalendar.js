const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs').promises;
const readline = require('readline');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

let calendar;

async function setupGoogleCalendar() {
  try {
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id } = credentials.installed;
    const oAuth2Client = new OAuth2Client(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');
    
    let token;
    try {
      token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
    } catch (error) {
      console.log('No existing token found or token invalid. Initiating new token retrieval.');
      token = await getNewToken(oAuth2Client);
      oAuth2Client.setCredentials(token);
    }
    
    calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
    console.log('Google Calendar setup completed successfully.');
    return true;
  } catch (error) {
    console.error('Error setting up Google Calendar:', error.message);
    return false;
  }
}

async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise((resolve) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      resolve(code);
    });
  });

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Token stored to', TOKEN_PATH);
    return tokens;
  } catch (err) {
    console.error('Error retrieving access token', err);
    throw err;
  }
}

async function addCalendarEvent(summary, start, end, description, location) {
  const event = {
    summary,
    location,
    description,
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
  };

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    return res.data;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

async function getCalendarEvents(start_date, end_date) {
  
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start_date.toISOString(),
      timeMax: end_date.toISOString(),
      maxResults: 1000,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items;
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

// Function to fetch events from Google Calendar
async function listEvents(auth, lastSyncedTime) {
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: lastSyncedTime,
    maxResults: 2500,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return res.data.items;
}

// Add these functions to your googleCalendar.js file

async function modifyCalendarEvent(eventId, updates) {
  if (!eventId) {
    throw new Error('Event ID is required to modify an event.');
  }

  try {
    // First, get the existing event
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    // Merge the updates with the existing event data
    const updatedEvent = {
      ...existingEvent.data,
      ...updates,
    };

    // Ensure start and end times are in the correct format
    if (updatedEvent.start && updatedEvent.start.dateTime) {
      updatedEvent.start.dateTime = new Date(updatedEvent.start.dateTime).toISOString();
    }
    if (updatedEvent.end && updatedEvent.end.dateTime) {
      updatedEvent.end.dateTime = new Date(updatedEvent.end.dateTime).toISOString();
    }

    // Update the event
    const res = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updatedEvent,
    });

    console.log(`Event updated successfully: ${res.data.htmlLink}`);
    return res.data;
  } catch (error) {
    console.error('Error modifying event:', error);
    if (error.code === 404) {
      throw new Error('Event not found. Please check the event ID.');
    }
    throw error;
  }
}

async function deleteCalendarEvent(eventId) {
  if (!eventId) {
    throw new Error('Event ID is required to delete an event.');
  }

  try {
    // First, get the event details
    const event = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    // Ask for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const confirmation = await new Promise((resolve) => {
      rl.question(`Are you sure you want to delete the event "${event.data.summary}"? (yes/no): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      });
    });

    if (!confirmation) {
      console.log('Event deletion cancelled.');
      return false;
    }

    // Delete the event
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log('Event deleted successfully.');
    return true;
  } catch (error) {
    console.error('Error deleting event:', error);
    if (error.code === 404) {
      throw new Error('Event not found. Please check the event ID.');
    }
    throw error;
  }
}

// Don't forget to export these new functions
module.exports = { 
  setupGoogleCalendar, 
  addCalendarEvent, 
  getCalendarEvents, 
  listEvents,
  modifyCalendarEvent,
  deleteCalendarEvent
};
