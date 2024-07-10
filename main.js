#!/usr/bin/env node

const { chat } = require('./chatbot');
const { setupDatabase } = require('./database');
const { setupGoogleCalendar } = require('./googleCalendar');

async function main() {
  try {
    await setupDatabase();
    await setupGoogleCalendar();
    await chat();
  } catch (error) {
    console.error("An error occurred during setup:", error.message);
  }
}

main();
