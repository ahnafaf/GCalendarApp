const sqlite3 = require('sqlite3').verbose();
const { google } = require('googleapis');
const { listEvents } = require('./googleCalendar');

// Function to create the SQLite database and table
function createDatabase() {
  const db = new sqlite3.Database('calendar.db');

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      summary TEXT,
      description TEXT,
      location TEXT,
      start_time TEXT,
      end_time TEXT,
      created_time TEXT,
      updated_time TEXT,
      recurrence TEXT,
      status TEXT,
      organizer TEXT,
      attendees TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sync_info (
      id INTEGER PRIMARY KEY,
      last_synced_time TEXT
    )`);

    // Insert initial sync_info if not exists
    db.get(`SELECT COUNT(*) AS count FROM sync_info`, (err, row) => {
      if (err) {
        console.error(err);
      } else if (row.count === 0) {
        db.run(`INSERT INTO sync_info (last_synced_time) VALUES (?)`, [new Date(0).toISOString()]);
      }
    });
  });

  return db;
}

// Function to get the last synced time
function getLastSyncedTime(db) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT last_synced_time FROM sync_info WHERE id = 1`, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.last_synced_time);
      }
    });
  });
}

// Function to update the last synced time
function updateLastSyncedTime(db, time) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE sync_info SET last_synced_time = ? WHERE id = 1`, [time], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Function to insert events into the database
function insertEvents(db, events) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO events (
    id, summary, description, location, start_time, end_time,
    created_time, updated_time, recurrence, status, organizer, attendees
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  events.forEach(event => {
    stmt.run(
      event.id,
      event.summary || '',
      event.description || '',
      event.location || '',
      event.start.dateTime || event.start.date,
      event.end.dateTime || event.end.date,
      event.created,
      event.updated,
      event.recurrence ? event.recurrence.join(',') : '',
      event.status,
      event.organizer ? event.organizer.email : '',
      event.attendees ? event.attendees.map(a => a.email).join(',') : ''
    );
  });

  stmt.finalize();
}

// Main function to fetch events and insert them into the database
async function main() {
  const db = createDatabase();

  try {
    const lastSyncedTime = await getLastSyncedTime(db);
    console.log('Last synced time:', lastSyncedTime);

    const events = await listEvents(auth, lastSyncedTime);
    console.log(`Fetched ${events.length} new or updated events.`);

    if (events.length > 0) {
      db.serialize(() => {
        insertEvents(db, events);
      });

      const latestEventTime = new Date().toISOString();
      await updateLastSyncedTime(db, latestEventTime);
      console.log('Updated last synced time to:', latestEventTime);
    } else {
      console.log('No new events to sync.');
    }
  } catch (error) {
    console.error('Error during sync:', error);
  } finally {
    db.close();
  }
}

main().catch(console.error);
