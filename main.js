#!/usr/bin/env node

const { chat } = require('./chatbot');
const { setupDatabase, syncCalendarEvents, createDatabase } = require('./database');
const { setupGoogleCalendar, getCalendarEvents } = require('./googleCalendar');


async function main() {
  try {
    console.log("Setting up database...");
    await createDatabase();
    await setupDatabase();
    console.log("Database setup completed.");

    console.log("Setting up Google Calendar...");
    const isCalendarSetup = await setupGoogleCalendar();
    if (isCalendarSetup) {
      console.log("Google Calendar setup successful!");

      console.log("Syncing Google Calendar events...");
      await syncCalendarEvents();
      console.log("Google Calendar events sync completed!");
    } else {
      console.log("Failed to set up Google Calendar. Some features may not work.");
    }

    console.log("Starting chat...");
    console.log()
    await chat();
  } catch (error) {
    console.error("An error occurred during setup:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch(error => {
  console.error("Fatal error in main function:", error);
  process.exit(1);
});