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
  /** A bucketed signature of the decision-relevant state (see decide.ts's
   * buildContextKey) -- e.g. "enemy:slime:none:heartsmid:starter". This is
   * what getMemory() groups by to build the "advanced hash" of past
   * choice -> outcome success rates the live prompt and the fallback both
   * draw on, so the game actually gets smarter across runs instead of just
   * logging decisions no one reads. */
  contextKey: string;
  /** The coarser sibling of contextKey (e.g. "enemy:slime:none", dropping hearts/form) --
   * see getMemory's hierarchical-backoff docstring for why a row is tagged with both. */
  contextKeyGeneral: string;
}

let db: Database.Database | null = null;

/** The repo's first schema migration path: CREATE TABLE IF NOT EXISTS alone can't add a
 * column to a decisions table that already exists on disk from a prior build. Safe to
 * call every time getDb() opens -- PRAGMA table_info + a no-op check keep it idempotent. */
function ensureColumn(database: Database.Database, table: string, column: string, decl: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

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
  ensureColumn(db, "decisions", "context_key", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "decisions", "context_key_general", "TEXT NOT NULL DEFAULT ''");
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

/** Wraps repeated recordDecision/recordOutcome calls in a single SQLite transaction.
 * Each call is normally its own implicit transaction -- a real fsync to disk per write,
 * the right default for real gameplay (roughly one decision every second or two) -- but
 * that same per-call fsync turns a few thousand scripted writes (see
 * scripts/seed-agent-memory.ts) into a multi-minute operation; live-tested, wrapping the
 * whole batch here brought that down from ~2 minutes to well under a second. Ordinary
 * request-handling code has no reason to reach for this -- it's for scripts writing many
 * rows in one process lifetime, not the live decide()/outcome-report path. */
export function withTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/** Returns the new row's id (needed so the client can report back what actually
 * happened -- see recordOutcome), or null on a write failure. History stays
 * best-effort observability, never load-bearing: a write failure (disk full, locked
 * file) must not take down a live decision call, so it's swallowed here rather than
 * propagated to decide.ts -- callers just get null back instead of an id to track. */
export function recordDecision(record: DecisionRecord): number | null {
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO decisions (run_id, decision_type, backend, model, choice, fallback, outcome, latency_ms, context_key, context_key_general)
         VALUES (@runId, @decisionType, @backend, @model, @choice, @fallback, @outcome, @latencyMs, @contextKey, @contextKeyGeneral)`,
      )
      .run({ ...record, fallback: record.fallback ? 1 : 0 });
    return Number(result.lastInsertRowid);
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_write_failed", error: String(error) }));
    return null;
  }
}

/** Fills in what a decision's outcome actually turned out to be, once the game resolves
 * it (enemy defeated, player took damage, or the enemy was avoided) -- see GameWorld's
 * outcome round trip in handleAgentEnemyDecision/applyAgentEnemyChoice. Every row starts
 * as "unknown" from decide.ts; this is the only thing that ever changes that. */
export function recordOutcome(id: number, outcome: DecisionRecord["outcome"]): void {
  try {
    getDb().prepare(`UPDATE decisions SET outcome = @outcome WHERE id = @id`).run({ id, outcome });
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_outcome_write_failed", error: String(error) }));
  }
}

export interface MemoryEntry {
  choice: string;
  /** Posterior mean (alpha / (alpha + beta)) -- a genuine Bayesian estimate, not a raw
   * ratio, so a choice with 1 win and 0 losses doesn't read as a false-confident 100%. */
  successRate: number;
  samples: number;
  /** Beta(alpha, beta) posterior parameters -- see decide.ts's thompsonSample(). Already
   * include the Laplace prior (start at 1,1) and any hierarchical backoff blending (see
   * getMemory's contextKeys.general param), so callers never need to know the difference
   * between "no data" and "data borrowed from a coarser context". */
  alpha: number;
  beta: number;
}

/** column is a trusted internal literal (never user input) -- selects which of the two
 * indexed key columns to match against, see getMemory. */
function queryOutcomeCounts(column: "context_key" | "context_key_general", key: string): Map<string, { success: number; failure: number }> {
  const byChoice = new Map<string, { success: number; failure: number }>();
  const rows = getDb()
    .prepare(
      `SELECT choice, outcome, COUNT(*) as count FROM decisions
       WHERE ${column} = @key AND outcome != 'unknown' AND choice IS NOT NULL
       GROUP BY choice, outcome`,
    )
    .all({ key }) as Array<{ choice: string; outcome: string; count: number }>;
  for (const row of rows) {
    const bucket = byChoice.get(row.choice) ?? { success: 0, failure: 0 };
    if (row.outcome === "enemy_defeated" || row.outcome === "avoided") bucket.success += row.count;
    else if (row.outcome === "player_damaged") bucket.failure += row.count;
    byChoice.set(row.choice, bucket);
  }
  return byChoice;
}

/** The "advanced hash", upgraded from a plain win-rate lookup to a real Bayesian
 * contextual bandit: every past resolved decision sharing a context_key becomes evidence
 * for a Beta(alpha, beta) posterior per choice (Laplace prior: start at Beta(1,1), i.e.
 * "50/50, totally unsure" before any data). decide.ts's thompsonSample() draws from these
 * posteriors rather than just taking the top mean, so an unproven choice still gets a
 * fair chance to be picked (exploration) while a choice with a strong track record gets
 * picked more and more often as its posterior narrows (exploitation) -- the standard
 * explore/exploit tradeoff a pure "best mean so far" policy can't give you.
 *
 * generalContextKey adds one more layer: hierarchical backoff. A specific context (this
 * exact enemy, boss tier, hearts bucket, and shoe form) can stay data-starved for a long
 * time even once the game has plenty of experience with the same enemy under slightly
 * different conditions. When given, its outcomes are blended in at BACKOFF_WEIGHT
 * strength -- real signal, but never enough to drown out specific evidence once there's
 * enough of it. This is the same idea n-gram language models call "backoff smoothing". */
const BACKOFF_WEIGHT = 0.35;

export function getMemory(contextKey: string, generalContextKey?: string): MemoryEntry[] {
  let specific: Map<string, { success: number; failure: number }>;
  let generalTotal: Map<string, { success: number; failure: number }>;
  try {
    specific = queryOutcomeCounts("context_key", contextKey);
    // context_key_general is stored on every row (see recordDecision), so this pool is a
    // superset that already contains the specific rows above -- subtracted out below so
    // BACKOFF_WEIGHT only applies to genuinely *other* contexts sharing this general
    // bucket, not double-counted evidence from the specific context itself.
    generalTotal = generalContextKey ? queryOutcomeCounts("context_key_general", generalContextKey) : new Map();
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_memory_read_failed", error: String(error) }));
    return [];
  }

  const choices = new Set<string>();
  specific.forEach((_value, choice) => choices.add(choice));
  generalTotal.forEach((_value, choice) => choices.add(choice));
  const entries: MemoryEntry[] = [];
  choices.forEach((choice) => {
    const s = specific.get(choice) ?? { success: 0, failure: 0 };
    const gTotal = generalTotal.get(choice) ?? { success: 0, failure: 0 };
    const gOther = { success: Math.max(0, gTotal.success - s.success), failure: Math.max(0, gTotal.failure - s.failure) };
    const alpha = 1 + s.success + BACKOFF_WEIGHT * gOther.success;
    const beta = 1 + s.failure + BACKOFF_WEIGHT * gOther.failure;
    entries.push({ choice, successRate: alpha / (alpha + beta), samples: s.success + s.failure, alpha, beta });
  });
  return entries.sort((a, b) => b.successRate - a.successRate);
}

export interface LatencyProfile {
  p90LatencyMs: number;
  samples: number;
}

/** Real observed latency for this specific backend+model, used by decide.ts to tighten
 * or loosen the per-request timeout dynamically instead of using one fixed global value
 * (agentConfig.decisionTimeoutMs) for every model regardless of how fast or slow it
 * actually is. Only ever looks at successful (non-fallback) calls -- a timed-out call's
 * latency is just the timeout itself, not a real measurement of how long the model
 * needed, so mixing them in would bias the estimate upward for no reason. */
export function getLatencyProfile(backend: string, model: string): LatencyProfile | null {
  let rows: Array<{ latencyMs: number }>;
  try {
    rows = getDb()
      .prepare(`SELECT latency_ms as latencyMs FROM decisions WHERE backend = @backend AND model = @model AND fallback = 0 ORDER BY latency_ms ASC`)
      .all({ backend, model }) as Array<{ latencyMs: number }>;
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_latency_read_failed", error: String(error) }));
    return null;
  }
  if (rows.length === 0) return null;
  const index = Math.min(rows.length - 1, Math.ceil(rows.length * 0.9) - 1);
  return { p90LatencyMs: rows[index].latencyMs, samples: rows.length };
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
