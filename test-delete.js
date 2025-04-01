#!/usr/bin/env node

const readline = require('readline');
const { google } = require('googleapis');
const { getCalendarEvents, deleteCalendarEvent } = require('./googleCalendar');
require('dotenv').config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to create OAuth2 client and get tokens
function createOAuth2Client() {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = 'http://localhost:3000/api/auth/callback/google';
  
  if (!client_id || !client_secret) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file');
    process.exit(1);
  }
  
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
  
  // For CLI testing, we'll use a simple access token
  // In a real app, you'd implement the full OAuth flow
  const tokens = {
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  };
  
  if (!tokens.access_token) {
    console.error('Missing GOOGLE_ACCESS_TOKEN in .env file');
    console.error('Please add your Google access token to the .env file:');
    console.error('GOOGLE_ACCESS_TOKEN=your-access-token-here');
    console.error('GOOGLE_REFRESH_TOKEN=your-refresh-token-here (optional)');
    process.exit(1);
  }
  
  return tokens;
}

// Function to format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Main function to list and delete events
async function listAndDeleteEvents() {
  try {
    // Get OAuth tokens
    const tokens = createOAuth2Client();
    
    // Get today's date and 7 days from now
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    console.log('Fetching events for the next 7 days...');
    
    // Get calendar events
    const events = await getCalendarEvents(tokens, today, nextWeek);
    
    if (!events || events.length === 0) {
      console.log('No events found for the next 7 days.');
      rl.close();
      return;
    }
    
    // Display events with numbers
    console.log('\nYour upcoming events:');
    events.forEach((event, index) => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end.dateTime || event.end.date;
      console.log(`[${index + 1}] ${event.summary}`);
      console.log(`    ID: ${event.id}`);
      console.log(`    When: ${formatDate(start)} - ${formatDate(end)}`);
      if (event.location) console.log(`    Where: ${event.location}`);
      console.log('');
    });
    
    // Prompt user to select an event to delete
    rl.question('Enter the number of the event you want to delete (or "q" to quit): ', async (answer) => {
      if (answer.toLowerCase() === 'q') {
        console.log('Exiting without deleting any events.');
        rl.close();
        return;
      }
      
      const eventIndex = parseInt(answer) - 1;
      
      if (isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
        console.log('Invalid selection. Please enter a number between 1 and ' + events.length);
        rl.close();
        return;
      }
      
      const selectedEvent = events[eventIndex];
      
      // Confirm deletion
      rl.question(`Are you sure you want to delete "${selectedEvent.summary}"? (y/n): `, async (confirm) => {
        if (confirm.toLowerCase() === 'y') {
          try {
            console.log(`Deleting event: ${selectedEvent.summary}...`);
            const result = await deleteCalendarEvent(tokens, selectedEvent.id);
            
            if (result.success) {
              console.log(`Successfully deleted event: ${result.summary || selectedEvent.summary}`);
            } else {
              console.error(`Failed to delete event: ${result.error}`);
            }
          } catch (error) {
            console.error('Error deleting event:', error);
          }
        } else {
          console.log('Deletion cancelled.');
        }
        
        rl.close();
      });
    });
  } catch (error) {
    console.error('Error:', error);
    rl.close();
  }
}

// Run the main function
listAndDeleteEvents();