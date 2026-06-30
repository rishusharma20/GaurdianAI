const path = require('path');

let db = null;
let isVercel = !!process.env.VERCEL;

let structuredMock = [];
let episodicMock = [];

if (!isVercel) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const DB_PATH = path.join(__dirname, 'memory.db');
    db = new sqlite3.Database(DB_PATH);
    
    // Initialize DB schema
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS structured_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE,
          val TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS episodic_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          summary TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  } catch (e) {
    console.warn("Failed to load sqlite3, falling back to mock memory:", e.message);
    isVercel = true;
  }
}

// Helper database functions
function runQuery(sql, params = []) {
  if (isVercel) return Promise.resolve();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allQuery(sql, params = []) {
  if (isVercel) return Promise.resolve([]);
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
    if (isVercel) {
      return structuredMock;
    }
    return await allQuery("SELECT * FROM structured_memory ORDER BY key ASC");
  },

  // Save/Update structured memory
  async saveStructured(key, val) {
    if (isVercel) {
      const idx = structuredMock.findIndex(m => m.key === key);
      if (idx !== -1) {
        structuredMock[idx].val = val;
      } else {
        structuredMock.push({ key, val, updated_at: new Date().toISOString() });
      }
      return;
    }
    return await runQuery(
      "INSERT INTO structured_memory (key, val) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = CURRENT_TIMESTAMP",
      [key, val]
    );
  },

  // Delete structured memory
  async deleteStructured(key) {
    if (isVercel) {
      structuredMock = structuredMock.filter(m => m.key !== key);
      return;
    }
    return await runQuery("DELETE FROM structured_memory WHERE key = ?", [key]);
  },

  // Get all episodic memories
  async getEpisodic(limit = 10) {
    if (isVercel) {
      return episodicMock.slice(0, limit);
    }
    return await allQuery("SELECT * FROM episodic_memory ORDER BY created_at DESC LIMIT ?", [limit]);
  },

  // Search episodic memories using keyword similarity
  async searchEpisodic(query, limit = 3) {
    if (isVercel) {
      const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      if (terms.length === 0) return episodicMock.slice(0, limit);
      return episodicMock.filter(e => terms.some(t => e.summary.toLowerCase().includes(t))).slice(0, limit);
    }
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) {
      return await allQuery("SELECT * FROM episodic_memory ORDER BY created_at DESC LIMIT ?", [limit]);
    }
    let likeClauses = terms.map(() => "summary LIKE ?").join(" OR ");
    let sql = `SELECT * FROM episodic_memory WHERE ${likeClauses} ORDER BY created_at DESC LIMIT ?`;
    let params = terms.map(t => `%${t}%`).concat(limit);
    return await allQuery(sql, params);
  },

  // Add episodic memory
  async addEpisodic(summary) {
    if (isVercel) {
      episodicMock.unshift({ summary, created_at: new Date().toISOString() });
      return;
    }
    return await runQuery("INSERT INTO episodic_memory (summary) VALUES (?)", [summary]);
  },

  // Clear all memories
  async clearAll() {
    if (isVercel) {
      structuredMock = [];
      episodicMock = [];
      return;
    }
    await runQuery("DELETE FROM structured_memory");
    await runQuery("DELETE FROM episodic_memory");
  }
};

module.exports = MemoryStore;
