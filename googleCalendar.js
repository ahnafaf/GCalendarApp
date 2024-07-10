const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs').promises;

let calendar;

const setupGoogleCalendar = async () => {
  const credentials = JSON.parse(await fs.readFile('credentials.json'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  try {
    const token = JSON.parse(await fs.readFile('token.json'));
    oAuth2Client.setCredentials(token);
  } catch (error) {
    await getAccessToken(oAuth2Client);
  }

  calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
};

const getAccessToken = async (oAuth2Client) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  // Implement token retrieval logic here
};

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

module.exports = { setupGoogleCalendar, addCalendarEvent };
