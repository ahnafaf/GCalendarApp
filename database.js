const sqlite3 = require('sqlite3').verbose();

let db;

const setupDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database('./user_data.db', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run(`CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT,
          title TEXT,
          location TEXT
        )`, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }
    });
  });
};

const addEvent = (date, title, location) => {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO events (date, title, location) VALUES (?, ?, ?)`,
      [date, title, location],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

const getEvents = (date) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM events WHERE date = ?`, [date], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

module.exports = { setupDatabase, addEvent, getEvents };
