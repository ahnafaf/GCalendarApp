
let dbInitPromise = null;


function getDatabaseInitPromise() {
    if (!dbInitPromise) {
      dbInitPromise = initializeDatabase().catch(err => {
        console.error('Failed to initialize PostgreSQL database:', err);
        dbInitPromise = null; // Reset promise on error
        throw err;
      });
    }
    return dbInitPromise;
  }
  