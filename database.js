const { Sequelize, DataTypes } = require('sequelize');
const { getCalendarEvents, listEvents } = require('./googleCalendar');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'calendar.db',
  logging: false,
  dialectOptions: {
    timeout: 10000, // Increase timeout to 30 seconds
  },
  pool: {
    max: 1, // Limit to one connection
    min: 0,
    acquire: 30000,
    idle: 10000
  },
});

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation(operation, maxRetries = 5, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`Operation failed, retrying (${attempt}/${maxRetries})...`);
      await wait(delay);
    }
  }
}


// Define the Event model
const Event = sequelize.define('Event', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  summary: DataTypes.STRING,
  description: DataTypes.TEXT,
  location: DataTypes.STRING,
  start_time: DataTypes.DATE,
  end_time: DataTypes.DATE,
  created_time: DataTypes.DATE,
  updated_time: DataTypes.DATE,
  recurrence: DataTypes.STRING,
  status: DataTypes.STRING,
  organizer: DataTypes.STRING,
  attendees: DataTypes.TEXT
});

// Define the SyncInfo model
const SyncInfo = sequelize.define('SyncInfo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  last_synced_time: DataTypes.DATE
});

// Function to create the database and tables
async function createDatabase() {
  try {
    await retryOperation(async () => {
      await sequelize.sync();
    });
    console.log('Database and tables created successfully.');
  } catch (error) {
    console.error('Error creating database and tables:', error);
    throw error;
  }
}

// Function to set up the database (initialize SyncInfo)
async function setupDatabase() {
  try {
    await retryOperation(async () => {
      await SyncInfo.findOrCreate({
        where: { id: 1 },
        defaults: { last_synced_time: new Date(0) }
      });
    });
    console.log('Database setup completed.');
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
}

// Function to get the last synced time
async function getLastSyncedTime() {
  try {
    const syncInfo = await SyncInfo.findByPk(1);
    return syncInfo ? syncInfo.last_synced_time : new Date(0);
  } catch (error) {
    console.error('Error getting last synced time:', error);
    throw error;
  }
}

// Function to update the last synced time
async function updateLastSyncedTime(time) {
  try {
    await SyncInfo.update({ last_synced_time: time }, { where: { id: 1 } });
  } catch (error) {
    console.error('Error updating last synced time:', error);
    throw error;
  }
}

// Function to insert or update events
async function insertEvents(events) {
  try {
    console.log(`Preparing to insert/update ${events.length} events...`);
    for (const event of events) {
      console.log(`Processing event: ${event.id} - ${event.summary}`);
      await Event.upsert({
        id: event.id,
        summary: event.summary || '',
        description: event.description || '',
        location: event.location || '',
        start_time: event.start.dateTime || event.start.date,
        end_time: event.end.dateTime || event.end.date,
        created_time: event.created,
        updated_time: event.updated,
        recurrence: event.recurrence ? event.recurrence.join(',') : '',
        status: event.status,
        organizer: event.organizer ? event.organizer.email : '',
        attendees: event.attendees ? event.attendees.map(a => a.email).join(',') : ''
      });
      console.log(`Event processed: ${event.id} - ${event.summary}`);
    }
    console.log('All events have been inserted/updated successfully.');
  } catch (error) {
    console.error('Error inserting events:', error);
    throw error;
  }
}


// Function to sync calendar events
async function syncCalendarEvents() {
  try {
    const lastSyncedTime = await getLastSyncedTime();
    console.log('Last synced time:', lastSyncedTime);

    console.log('Fetching events from Google Calendar...');
    const events = await listEvents(null, lastSyncedTime);
    console.log(`Fetched ${events.length} new or updated events.`);

    if (events.length > 0) {
      console.log('Inserting events into the database...');
      await insertEvents(events);
      console.log('Events inserted successfully.');

      const latestEventTime = new Date();
      await updateLastSyncedTime(latestEventTime);
      console.log('Updated last synced time to:', latestEventTime);
    } else {
      console.log('No new events to sync.');
    }

  } catch (error) {
    console.error('Error during calendar sync:', error);
    throw error;
  }
}

// Function to get all events
async function getAllEvents() {
  try {
    return await Event.findAll();
  } catch (error) {
    console.error('Error getting all events:', error);
    throw error;
  }
}

// Function to get events within a date range
async function getEventsByDateRange(startDate, endDate) {
  try {
    return await Event.findAll({
      where: {
        start_time: {
          [Sequelize.Op.between]: [startDate, endDate]
        }
      }
    });
  } catch (error) {
    console.error('Error getting events by date range:', error);
    throw error;
  }
}

module.exports = {
  createDatabase,
  setupDatabase,
  syncCalendarEvents,
  getAllEvents,
  getEventsByDateRange
};