const fs = require('fs');
const path = require('path');
const config = require('./config');

let dbDriver = null;
let pgPool = null;
let sqliteDb = null;

// Ensure data folder exists for sqlite
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.error('Failed to create data dir', e);
  }
}

const sqliteFilePath = path.join(dataDir, 'addaverse.db');

async function initDb() {
  if (config.databaseUrl && (config.databaseUrl.startsWith('postgres://') || config.databaseUrl.startsWith('postgresql://'))) {
    console.log('[DB] Connecting to PostgreSQL database...');
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: config.databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    dbDriver = 'pg';
    await initPgSchema();
  } else {
    console.log('[DB] Using SQLite database at', sqliteFilePath);
    dbDriver = 'sqlite';
    try {
      const { DatabaseSync } = require('node:sqlite');
      sqliteDb = new DatabaseSync(sqliteFilePath);
      sqliteDb.isNodeSqlite = true;
    } catch (err) {
      const sqlite3 = require('sqlite3').verbose();
      sqliteDb = new sqlite3.Database(sqliteFilePath);
      sqliteDb.isNodeSqlite = false;
    }
    initSqliteSchema();
  }
}

async function initPgSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      google_client_id TEXT,
      google_client_secret TEXT,
      google_access_token TEXT,
      google_refresh_token TEXT,
      google_token_expiry BIGINT,
      channel_id TEXT,
      channel_title TEXT,
      channel_avatar TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_jobs (
      id VARCHAR(64) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      drive_file_id TEXT NOT NULL,
      drive_file_name TEXT,
      video_title TEXT NOT NULL,
      privacy_status VARCHAR(20) DEFAULT 'private',
      youtube_video_id TEXT,
      status VARCHAR(30) DEFAULT 'pending',
      bytes_uploaded BIGINT DEFAULT 0,
      total_bytes BIGINT DEFAULT 0,
      progress_percent INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_upload_jobs_user ON upload_jobs(user_id);
  `;
  await pgPool.query(schema);
  console.log('[DB] PostgreSQL tables verified.');
}

function initSqliteSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      google_client_id TEXT,
      google_client_secret TEXT,
      google_access_token TEXT,
      google_refresh_token TEXT,
      google_token_expiry INTEGER,
      channel_id TEXT,
      channel_title TEXT,
      channel_avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_jobs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      drive_file_id TEXT NOT NULL,
      drive_file_name TEXT,
      video_title TEXT NOT NULL,
      privacy_status TEXT DEFAULT 'private',
      youtube_video_id TEXT,
      status TEXT DEFAULT 'pending',
      bytes_uploaded INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      progress_percent INTEGER DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_upload_jobs_user ON upload_jobs(user_id);
  `;

  if (sqliteDb.isNodeSqlite) {
    sqliteDb.exec(schema);
  } else {
    sqliteDb.exec(schema, (err) => {
      if (err) console.error('[DB] SQLite schema error:', err);
    });
  }
  console.log('[DB] SQLite tables verified.');
}

// Convert ? to $1, $2 for PostgreSQL if needed
function formatPgSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

async function query(sql, params = []) {
  if (dbDriver === 'pg') {
    const pgSql = formatPgSql(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  }

  if (sqliteDb.isNodeSqlite) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params);
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

async function get(sql, params = []) {
  if (dbDriver === 'pg') {
    const pgSql = formatPgSql(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows[0] || null;
  }

  if (sqliteDb.isNodeSqlite) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.get(...params) || null;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
}

async function run(sql, params = []) {
  if (dbDriver === 'pg') {
    const pgSql = formatPgSql(sql);
    const res = await pgPool.query(pgSql, params);
    return { changes: res.rowCount, lastInsertRowid: null };
  }

  if (sqliteDb.isNodeSqlite) {
    const stmt = sqliteDb.prepare(sql);
    const res = stmt.run(...params);
    return {
      changes: res.changes,
      lastInsertRowid: Number(res.lastInsertRowid)
    };
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastInsertRowid: this.lastID });
      });
    });
  }
}

module.exports = {
  initDb,
  query,
  get,
  run
};
