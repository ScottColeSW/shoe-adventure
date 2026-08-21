// SQLite run history: one row per completed playthrough, human or agent. Kept as its own
// connection to the same database file server/agent/history.ts already uses (agentConfig.dbPath)
// rather than folding this into that module -- two tables, two independent concerns, smaller
// and safer than reshaping an already-shipped module for this pass.

import Database from "better-sqlite3";
import { agentConfig } from "./agent/config";

export interface RunRecord {
  runId: string;
  mode: "human" | "agent";
  backend: string | null;
  model: string | null;
  seconds: number;
  hearts: number;
  buttons: number;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(agentConfig.dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      backend TEXT,
      model TEXT,
      seconds REAL NOT NULL,
      hearts INTEGER NOT NULL,
      buttons INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export function recordRun(record: RunRecord): void {
  // Same best-effort discipline as server/agent/history.ts's recordDecision: a completed
  // run must never fail to reach the player's win screen just because this write failed.
  try {
    getDb()
      .prepare(
        `INSERT INTO runs (run_id, mode, backend, model, seconds, hearts, buttons)
         VALUES (@runId, @mode, @backend, @model, @seconds, @hearts, @buttons)`,
      )
      .run(record);
  } catch (error) {
    console.error(JSON.stringify({ event: "run_history_write_failed", error: String(error) }));
  }
}

export interface LeaderboardEntry {
  mode: "human" | "agent";
  backend: string | null;
  model: string | null;
  seconds: number;
  createdAt: string;
}

export function getLeaderboard(limit: number): LeaderboardEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT mode, backend, model, seconds, created_at as createdAt
       FROM runs ORDER BY seconds ASC LIMIT @limit`,
    )
    .all({ limit }) as LeaderboardEntry[];
  return rows;
}
