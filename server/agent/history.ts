// SQLite decision history, mirroring the role Dominion's engine/history.py
// plays: a durable record of every agent decision (not just the winning
// path) so /api/agent/stats can answer real questions later -- fallback
// rate, latency, and outcome by backend/model -- without re-instrumenting.

import Database from "better-sqlite3";
import { agentConfig } from "./config";

export interface DecisionRecord {
  runId: string;
  decisionType: string;
  backend: string;
  model: string;
  choice: string | null;
  fallback: boolean;
  outcome: "enemy_defeated" | "player_damaged" | "avoided" | "unknown";
  latencyMs: number;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(agentConfig.dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      backend TEXT NOT NULL,
      model TEXT NOT NULL,
      choice TEXT,
      fallback INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      latency_ms REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/** Opens the database and runs its CREATE TABLE IF NOT EXISTS -- the exact
 * same first-use path every real request already takes through getDb()
 * above, just callable standalone so scripts/check-env.ts can surface a
 * bad db path (see agentConfig.dbPath's own comment) as a clear one-line
 * failure instead of a stack trace the first time a real request hits it. */
export function ensureReady(): void {
  getDb();
}

export function recordDecision(record: DecisionRecord): void {
  // History is best-effort observability, never load-bearing -- a write
  // failure (disk full, locked file) must not take down a live decision
  // call, so it's swallowed here rather than propagated to decide.ts.
  try {
    getDb()
      .prepare(
        `INSERT INTO decisions (run_id, decision_type, backend, model, choice, fallback, outcome, latency_ms)
         VALUES (@runId, @decisionType, @backend, @model, @choice, @fallback, @outcome, @latencyMs)`,
      )
      .run({ ...record, fallback: record.fallback ? 1 : 0 });
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_write_failed", error: String(error) }));
  }
}

export interface BackendModelStats {
  backend: string;
  model: string;
  totalDecisions: number;
  fallbackRate: number;
  avgLatencyMs: number;
  outcomeBreakdown: Record<string, number>;
}

export function getStats(): { totalDecisions: number; byBackendModel: BackendModelStats[] } {
  // Same best-effort discipline as recordDecision above: a read failure
  // here must return an empty stats shape, never crash the dev server.
  let rows: Array<{ backend: string; model: string; fallback: number; outcome: string; latencyMs: number }>;
  try {
    rows = getDb()
      .prepare(
        `SELECT backend, model, choice, fallback, outcome, latency_ms as latencyMs FROM decisions`,
      )
      .all() as Array<{ backend: string; model: string; fallback: number; outcome: string; latencyMs: number }>;
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_read_failed", error: String(error) }));
    return { totalDecisions: 0, byBackendModel: [] };
  }

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.backend}::${row.model}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const byBackendModel: BackendModelStats[] = Array.from(groups.entries()).map(([key, group]) => {
    const [backend, model] = key.split("::");
    const outcomeBreakdown: Record<string, number> = {};
    for (const row of group) outcomeBreakdown[row.outcome] = (outcomeBreakdown[row.outcome] ?? 0) + 1;
    return {
      backend,
      model,
      totalDecisions: group.length,
      fallbackRate: group.filter((row) => row.fallback).length / group.length,
      avgLatencyMs: group.reduce((sum, row) => sum + row.latencyMs, 0) / group.length,
      outcomeBreakdown,
    };
  });

  return { totalDecisions: rows.length, byBackendModel };
}
