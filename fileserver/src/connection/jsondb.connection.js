const { JsonDB, Config } = require('node-json-db');

let db;

try {
    console.log('[DB] Initializing node-json-db at fileDB.json');
    db = new JsonDB(new Config("fileDB", true, false, '/'));
    // Ensure base collection exists
    try {
        db.getData('/files');
        console.log('[DB] Collection /files found');
    } catch (e) {
        db.push('/files', {});
        console.log('[DB] Created collection /files');
    }
    console.log('[DB] Ready');
} catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
}

module.exports =  db ;