
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs').promises;
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';

let calendar;

const setupGoogleCalendar = async () => {
  try {
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed;

    // Log the credentials to verify they are being read correctly
    console.log("Client ID:", client_id);
    console.log("Client Secret:", client_secret);

    if (!client_secret || !client_id) {
      throw new Error('Missing client_id or client_secret in credentials.json');
    }

    const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    try {
      const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
    } catch (error) {
      await getAccessToken(oAuth2Client);
    }

    calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  } catch (error) {
    console.error('Error setting up Google Calendar:', error.message);
    throw error;
  }
};

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    const oAuth2Client = new OAuth2Client();
    oAuth2Client.setCredentials(credentials);
    return oAuth2Client;
  } catch (err) {
    return null;
  }
}

async function authorize() {
  await setupGoogleCalendar();
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate();
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}



async function authenticate() {
  const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  // Log the credentials to verify they are being read correctly
  console.log("Client ID:", client_id);
  console.log("Client Secret:", client_secret);

  if (!client_secret || !client_id) {
    throw new Error('Missing client_id or client_secret in credentials.json');
  }

  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  await getAccessToken(oAuth2Client);
  return oAuth2Client;
}

async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
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

  const tokenResponse = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokenResponse.tokens);
  await saveCredentials(tokenResponse.tokens);
}

async function saveCredentials(token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token));
}

const addCalendarEvent = async (summary, start, end, description, location) => {
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
    console.log('Event created: %s', res.data.htmlLink);
    return res.data;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
};

const getCalendarEvent = async (start_date, end_date) => {
  if (!calendar) {
    await setupGoogleCalendar();
  }
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start_date,
      timeMax: end_date,
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


module.exports = { setupGoogleCalendar, addCalendarEvent, getCalendarEvent, authorize, getAccessToken };
