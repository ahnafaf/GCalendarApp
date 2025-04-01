// Database setup script
const { createDatabase, setupDatabase } = require('../src/database/db-client');

async function setup() {
  try {
    await createDatabase();
    await setupDatabase();
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setup();