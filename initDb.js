// initDb.js
const { createDatabase, setupDatabase, syncCalendarEvents } = require('./database');

async function initializeDatabase() {
  try {
    console.log('Creating database...');
    await createDatabase();
    
    console.log('Setting up database...');
    await setupDatabase();
    
    console.log('Syncing calendar events...');
    await syncCalendarEvents();
    
    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase();
