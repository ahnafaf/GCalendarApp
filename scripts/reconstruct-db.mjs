import { initializeDatabase } from '../lib/postgresClient.js';
import 'dotenv/config';

// This script drops and recreates all database tables
async function reconstructDatabase() {
  console.log('Starting database reconstruction...');
  
  try {
    // Initialize the database with force: true to drop and recreate all tables
    await initializeDatabase();
    
    console.log('Database reconstruction completed successfully!');
    console.log('All tables have been dropped and recreated:');
    console.log('- users: Stores user information');
    console.log('- user_preferences: Stores user preferences');
    console.log('- conversations: Stores conversation metadata');
    console.log('- conversation_messages: Stores individual messages within conversations');
    console.log('- calendar_event_metadata: Stores metadata for Google Calendar events');
    
    process.exit(0);
  } catch (error) {
    console.error('Error reconstructing database:', error);
    process.exit(1);
  }
}

// Run the reconstruction
reconstructDatabase();