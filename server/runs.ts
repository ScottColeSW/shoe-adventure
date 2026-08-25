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

/** Same standalone-openable helper as server/agent/history.ts's own
 * ensureReady() -- see that one's comment. Both modules resolve
 * agentConfig.dbPath independently but point at the same underlying file,
 * so checking either one here would do, this one is checked too only so
 * scripts/check-env.ts reads as a complete preflight rather than a partial
 * one. */
export function ensureReady(): void {
  getDb();
}

/** Closes this module's own connection if one is open -- fire-and-forget best-effort
 * disk hygiene on process shutdown (see server/index.ts's and vite.config.ts's own SIGINT
 * handlers), not a correctness requirement: better-sqlite3 is a plain file handle inside
 * this process, not a separate resource that can leak, and SQLite's on-disk format
 * survives an ungraceful stop fine either way. This just avoids leaving a stray -wal/-shm
 * sidecar file behind. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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
  hearts: number;
  createdAt: string;
}

/** Raw dump for /api/agent/stats (see history.ts's getStats): every completed run, not
 * just the leaderboard's top-N-by-speed slice, and including run_id so a stats query can
 * cross-reference against server/agent/history.ts's decisions table (which knows about
 * every attempt, win or lose -- this table only ever gets a row on a win, see
 * recordRunCompletion's own comment in GameWorld.ts). run_id is what makes that join
 * possible; getLeaderboard() above deliberately omits it since the public leaderboard has
 * no use for it. */
export function getAllRuns(): RunRecord[] {
  try {
    return getDb()
      .prepare(`SELECT run_id as runId, mode, backend, model, seconds, hearts, buttons FROM runs`)
      .all() as RunRecord[];
  } catch (error) {
    console.error(JSON.stringify({ event: "run_history_read_failed", error: String(error) }));
    return [];
  }
}

export function getLeaderboard(limit: number): LeaderboardEntry[] {
  // Same best-effort discipline as recordRun above: a read failure here
  // (a bad db path, a locked file) must show an empty leaderboard, never
  // crash the whole dev server out from under whoever is mid-run.
  try {
    return getDb()
      .prepare(
        `SELECT mode, backend, model, seconds, hearts, created_at as createdAt
         FROM runs ORDER BY seconds ASC LIMIT @limit`,
      )
      .all({ limit }) as LeaderboardEntry[];
  } catch (error) {
    console.error(JSON.stringify({ event: "run_leaderboard_read_failed", error: String(error) }));
    return [];
  }
}
