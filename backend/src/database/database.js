const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../atlas.db');

const db = new Database(dbPath);


function initializeDatabase() {

    db.exec(`

        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );


        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME
        );


        CREATE TABLE IF NOT EXISTS user_profile (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            category TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,

            confidence REAL DEFAULT 1.0,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(category, key, value)
        );


        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            type TEXT NOT NULL,
            content TEXT NOT NULL,

            importance INTEGER DEFAULT 1,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );


        CREATE TABLE IF NOT EXISTS reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            insight TEXT NOT NULL,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );


        CREATE TABLE IF NOT EXISTS user_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            category TEXT,
            key TEXT,
            value TEXT,

            confidence REAL DEFAULT 1,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(category, key, value)
        );


        CREATE INDEX IF NOT EXISTS idx_profile_key
        ON user_profile(key);


        CREATE INDEX IF NOT EXISTS idx_profile_category
        ON user_profile(category);


        CREATE INDEX IF NOT EXISTS idx_conversation_session
        ON conversations(session_id);


        CREATE INDEX IF NOT EXISTS idx_memory_importance
        ON memories(importance);

    `);


    // Automatically update profile timestamps
    db.exec(`

        CREATE TRIGGER IF NOT EXISTS update_profile_timestamp
        AFTER UPDATE ON user_profile

        BEGIN
            UPDATE user_profile
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END;

    `);
}


initializeDatabase();


module.exports = db;