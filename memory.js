const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'memory.db');
const db = new sqlite3.Database(DB_PATH);

// Initialize DB schema
db.serialize(() => {
  // Structured Memory table: key-value facts about the user
  db.run(`
    CREATE TABLE IF NOT EXISTS structured_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      val TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Episodic Memory table: raw searchable transcripts or summaries of past sessions
  db.run(`
    CREATE TABLE IF NOT EXISTS episodic_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Helper database functions
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

const MemoryStore = {
  // Get all structured memories
  async getStructured() {
    return await allQuery("SELECT * FROM structured_memory ORDER BY key ASC");
  },

  // Save/Update structured memory
  async saveStructured(key, val) {
    return await runQuery(
      "INSERT INTO structured_memory (key, val) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = CURRENT_TIMESTAMP",
      [key, val]
    );
  },

  // Delete structured memory
  async deleteStructured(key) {
    return await runQuery("DELETE FROM structured_memory WHERE key = ?", [key]);
  },

  // Get all episodic memories
  async getEpisodic(limit = 10) {
    return await allQuery("SELECT * FROM episodic_memory ORDER BY created_at DESC LIMIT ?", [limit]);
  },

  // Search episodic memories using keyword similarity
  async searchEpisodic(query, limit = 3) {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) {
      return await allQuery("SELECT * FROM episodic_memory ORDER BY created_at DESC LIMIT ?", [limit]);
    }
    // Build SQL query matching keywords
    let likeClauses = terms.map(() => "summary LIKE ?").join(" OR ");
    let sql = `SELECT * FROM episodic_memory WHERE ${likeClauses} ORDER BY created_at DESC LIMIT ?`;
    let params = terms.map(t => `%${t}%`).concat(limit);
    return await allQuery(sql, params);
  },

  // Add episodic memory
  async addEpisodic(summary) {
    return await runQuery("INSERT INTO episodic_memory (summary) VALUES (?)", [summary]);
  },

  // Clear all memories
  async clearAll() {
    await runQuery("DELETE FROM structured_memory");
    await runQuery("DELETE FROM episodic_memory");
  }
};

module.exports = MemoryStore;
