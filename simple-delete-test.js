#!/usr/bin/env node

/**
 * Simple test script for deleting Google Calendar events
 * This script uses the googleCalendar.js module directly
 */

const readline = require('readline');
const { getCalendarEvents, deleteCalendarEvent } = require('./googleCalendar');
require('dotenv').config();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Mock tokens for testing - in a real app, you'd get these from the user's session
const mockTokens = {
  access_token: process.env.GOOGLE_ACCESS_TOKEN || 'test-access-token'
};

// Function to format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Main function
async function main() {
  try {
    console.log('Fetching calendar events...');
    
    // Get today's date and 7 days from now
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    // Get events
    const events = await getCalendarEvents(mockTokens, today, nextWeek);
    
    if (!events || events.length === 0) {
      console.log('No events found for the next 7 days.');
      rl.close();
      return;
    }
    
    // Display events
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
    
    // Prompt for selection
    rl.question('Enter the number of the event to delete (or q to quit): ', async (answer) => {
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
            const result = await deleteCalendarEvent(mockTokens, selectedEvent.id);
            
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
main();