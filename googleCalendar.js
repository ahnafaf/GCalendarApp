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
    console.log('Event created:', res.data.htmlLink);
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
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items;
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

module.exports = { setupGoogleCalendar, addCalendarEvent, getCalendarEvents };