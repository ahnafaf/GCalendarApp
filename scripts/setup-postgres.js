import { Sequelize } from 'sequelize';
import { initializeDatabase } from '../lib/postgresClient.js';
import 'dotenv/config';

// This script initializes the PostgreSQL database with the required schema
async function setupPostgresDatabase() {
  console.log('Starting PostgreSQL database setup...');
  
  try {
    // First, create the database if it doesn't exist
    await createDatabaseIfNotExists();
    
    // Then initialize the database schema (creates tables, extensions, and triggers)
    await initializeDatabase();
    
    console.log('PostgreSQL database setup completed successfully!');
    console.log('The following tables have been created:');
    console.log('- users: Stores user information');
    console.log('- user_preferences: Stores user preferences');
    console.log('- conversations: Stores conversation metadata');
    console.log('- conversation_messages: Stores individual messages within conversations');
    console.log('- calendar_event_metadata: Stores metadata for Google Calendar events');
    
    process.exit(0);
  } catch (error) {
    console.error('Error setting up PostgreSQL database:', error);
    process.exit(1);
  }
}

// Function to create the database if it doesn't exist
async function createDatabaseIfNotExists() {
  const dbName = process.env.POSTGRES_DB || 'gcalendarapp';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || 5432;
  const username = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';
  
  console.log(`Checking if database "${dbName}" exists...`);
  
  // Connect to the default 'postgres' database to create our app database
  const sequelize = new Sequelize('postgres', username, password, {
    host,
    port,
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.POSTGRES_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });
  
  try {
    await sequelize.authenticate();
    console.log('Connected to PostgreSQL server');
    
    // Check if database exists
    const [results] = await sequelize.query(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
    );
    
    if (results.length === 0) {
      console.log(`Database "${dbName}" does not exist, creating it now...`);
      await sequelize.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully`);
    } else {
      console.log(`Database "${dbName}" already exists`);
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('Error connecting to PostgreSQL or creating database:', error);
    throw error;
  }
}

// Run the setup
setupPostgresDatabase();