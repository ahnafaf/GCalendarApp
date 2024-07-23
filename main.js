#!/usr/bin/env node

const { chat } = require('./chatbot');
const { setupDatabase } = require('./database');
const { setupGoogleCalendar } = require('./googleCalendar');

async function main() {
  try {
    console.log("Setting up database...");
    await setupDatabase();
    
    console.log("Setting up Google Calendar...");
    const isCalendarSetup = await setupGoogleCalendar();
    if (isCalendarSetup) {
      console.log("Google Calendar setup successful!");
    } else {
      console.log("Failed to set up Google Calendar. Some features may not work.");
    }

    console.log("Starting chat...");
    await chat();
  } catch (error) {
    console.error("An error occurred during setup:", error.message);
  }
}

main();