import { DatabaseSync } from "node:sqlite"; // built into Node 22.5+, no install needed

const db = new DatabaseSync("twin.db");
db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, mode TEXT, role TEXT, content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY, content TEXT, tag TEXT DEFAULT 'general',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY, decision TEXT, options TEXT, expected TEXT,
  confidence INTEGER, outcome TEXT, resolved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// ---- messages (history is kept separately per mode) ----
export const saveMessage = (mode, role, content) =>
  db.prepare("INSERT INTO messages (mode, role, content) VALUES (?,?,?)").run(mode, role, content);

export function recentMessages(mode, limit = 20) {
  const rows = db
    .prepare("SELECT role, content FROM messages WHERE mode = ? ORDER BY id DESC LIMIT ?")
    .all(mode, limit)
    .reverse();
  while (rows.length && rows[0].role !== "user") rows.shift(); // API needs to start with user
  return rows;
}

// ---- journal ----
// Entries in "past" mode are tagged 'past' and never mix with other modes.
export const addJournal = (content, tag = "general") =>
  db.prepare("INSERT INTO journal (content, tag) VALUES (?,?)").run(content, tag);

export function searchJournal(query, mode, limit = 5) {
  const tagClause = mode === "past" ? "tag = 'past'" : "tag != 'past'";
  const words = [...new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 3))];
  const rows = db
    .prepare(`SELECT content, created_at FROM journal WHERE ${tagClause} ORDER BY id DESC LIMIT 300`)
    .all();
  const scored = rows
    .map((r) => ({ ...r, score: words.filter((w) => r.content.toLowerCase().includes(w)).length }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.length ? scored : rows.slice(0, 3); // fall back to most recent
}

// ---- decisions ----
export const addDecision = ({ decision, options, expected, confidence }) =>
  db.prepare("INSERT INTO decisions (decision, options, expected, confidence) VALUES (?,?,?,?)")
    .run(decision, options, expected, confidence);

export const openDecisions = () =>
  db.prepare("SELECT * FROM decisions WHERE outcome IS NULL ORDER BY id DESC").all();

export const resolvedDecisions = (limit = 10) =>
  db.prepare("SELECT * FROM decisions WHERE outcome IS NOT NULL ORDER BY id DESC LIMIT ?").all(limit);

export const resolveDecision = (id, outcome) =>
  db.prepare("UPDATE decisions SET outcome = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(outcome, id).changes;
