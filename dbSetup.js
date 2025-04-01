const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;

// MongoDB connection
const connectDB = async () => {
  if (isConnected) {
    console.log('Using existing database connection');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
    });
    
    isConnected = true;
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Define EventCache Schema
const eventCacheSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  events: { type: Array, required: true },
  lastUpdated: { type: Date, default: Date.now }
});

// Create EventCache model only if it doesn't already exist
const EventCache = mongoose.models.EventCache || mongoose.model('EventCache', eventCacheSchema);

module.exports = { connectDB, EventCache };
