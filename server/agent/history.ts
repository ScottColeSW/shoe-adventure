// SQLite decision history, mirroring the role Dominion's engine/history.py
// plays: a durable record of every agent decision (not just the winning
// path) so /api/agent/stats can answer real questions later -- fallback
// rate, latency, and outcome by backend/model -- without re-instrumenting.

import Database from "better-sqlite3";
import { agentConfig } from "./config";
import { getAllRuns } from "../runs";

export interface DecisionRecord {
  runId: string;
  decisionType: string;
  backend: string;
  model: string;
  choice: string | null;
  fallback: boolean;
  /** True when a live, parseable model answer disagreed with a well-established memory
   * signal by a wide margin (see decide.ts's CONFIDENCE_OVERRIDE_MIN_SAMPLES/GAP) --
   * choice is still always the model's own real answer, never silently replaced. This
   * used to be called "overridden" back when decide.ts actually swapped the choice out;
   * the user asked for that swap removed (spoon-feeding the model its answer defeats the
   * point of watching it get better at reasoning) but the disagreement itself kept as a
   * recorded signal -- worth noting when model and data disagree, not acting on it for them. */
  disagreesWithMemory: boolean;
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

/** Bumped whenever a change lands that meaningfully invalidates prior decisions as a fair
 * comparison point for future ones -- a different prompt (different framing, different
 * option order), a fixed bug in how outcomes get recorded, anything that changes what the
 * numbers actually mean. recordDecision always stamps new rows with the current value;
 * getMemory/getStats only ever look at rows from the current generation, so live decisions
 * keep learning from a clean baseline instead of averaging in behavior nothing here still
 * does. Older rows are never deleted -- they stay queryable for historical analysis, just
 * excluded from what actively drives the game.
 *
 * Generation 2 (2026-08-25): the reportAgentOutcome race that left ~40% of decisions stuck
 * at "unknown" forever got fixed (see GameWorld.ts's own comment on it), priorityAction's
 * option order and memory-summary wording changed, and the learning-phase timeout was
 * raised -- all in the same pass, all changing what a decision recorded before this point
 * actually represents compared to one recorded after. */
export const CURRENT_GENERATION = 2;

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
  // "overridden" (below) is legacy -- decide.ts no longer swaps the model's choice out, so
  // nothing writes to it anymore; left in place rather than dropped since SQLite column
  // drops are more trouble than a harmless always-0 leftover is worth. disagrees_with_memory
  // is its real replacement: the same detection, recorded instead of acted on.
  ensureColumn(db, "decisions", "overridden", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "decisions", "disagrees_with_memory", "INTEGER NOT NULL DEFAULT 0");
  // Existing rows default to 1 -- see CURRENT_GENERATION's own comment. Everything on disk
  // before this column existed predates every generation-2 change by definition.
  ensureColumn(db, "decisions", "generation", "INTEGER NOT NULL DEFAULT 1");
  // Set retroactively by markRunWon once a run actually wins -- see its own comment and
  // WIN_REWARD_MULTIPLIER in queryOutcomeCounts for why this exists at all.
  ensureColumn(db, "decisions", "run_won", "INTEGER NOT NULL DEFAULT 0");
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

/** See server/runs.ts's closeDb (the same pattern, mirrored here for this module's own
 * private connection) -- best-effort disk hygiene on shutdown, not a correctness fix. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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
        `INSERT INTO decisions (run_id, decision_type, backend, model, choice, fallback, outcome, latency_ms, context_key, context_key_general, disagrees_with_memory, generation)
         VALUES (@runId, @decisionType, @backend, @model, @choice, @fallback, @outcome, @latencyMs, @contextKey, @contextKeyGeneral, @disagreesWithMemory, @generation)`,
      )
      .run({ ...record, fallback: record.fallback ? 1 : 0, disagreesWithMemory: record.disagreesWithMemory ? 1 : 0, generation: CURRENT_GENERATION });
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

/** The "big reward" for actually winning, not just for a locally-good outcome -- the
 * Bayesian memory previously only ever knew about *local* per-decision outcomes
 * (enemy_defeated/player_damaged/avoided), with no concept of whether the run those
 * decisions belonged to actually won. A choice that helped win and the same choice in a
 * run that later died looked identical to it. Called once, retroactively, the moment a
 * run actually wins (see runsRouter.ts's /complete handler -- every POST there already
 * represents a win, see GameWorld.ts's recordRunCompletion, which is only ever called
 * from checkRescue()'s win branch). Marks every decision from that run so
 * queryOutcomeCounts can weight them higher, letting win-correlated choices float to the
 * top of getMemory's rankings on their own over enough real runs -- not a hardcoded
 * priority in the prompt, the same posterior math that already ranks everything else. */
export function markRunWon(runId: string): void {
  try {
    getDb().prepare(`UPDATE decisions SET run_won = 1 WHERE run_id = @runId`).run({ runId });
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_run_won_write_failed", error: String(error) }));
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

/** A success that was also part of a run that actually won counts this many times over
 * an ordinary success -- see markRunWon's own comment for the reasoning. Only applied to
 * already-successful outcomes (enemy_defeated/avoided): a player_damaged decision doesn't
 * get rehabilitated just because the run survived it anyway, it's still locally a hit
 * taken. 3x is a first cut, not a tuned constant -- there isn't enough won-run data yet
 * (generation 2 is brand new) to know the right strength, but the mechanism is what
 * matters: this is still the same posterior math every other choice goes through, not a
 * hardcoded priority order in the prompt. */
const WIN_REWARD_MULTIPLIER = 3;

/** column is a trusted internal literal (never user input) -- selects which of the two
 * indexed key columns to match against, see getMemory. */
function queryOutcomeCounts(column: "context_key" | "context_key_general", key: string): Map<string, { success: number; failure: number }> {
  const byChoice = new Map<string, { success: number; failure: number }>();
  // generation = CURRENT_GENERATION, not just "the latest" -- see its own comment. Live
  // decision-making should never average in behavior from before a change that made the
  // recorded numbers mean something different (a fixed outcome-reporting bug, a reordered
  // prompt). Older rows stay on disk for historical reads, just excluded from what
  // actually informs a real decision.
  const rows = getDb()
    .prepare(
      `SELECT choice, outcome, run_won as runWon, COUNT(*) as count FROM decisions
       WHERE ${column} = @key AND outcome != 'unknown' AND choice IS NOT NULL AND generation = @generation
       GROUP BY choice, outcome, run_won`,
    )
    .all({ key, generation: CURRENT_GENERATION }) as Array<{ choice: string; outcome: string; runWon: number; count: number }>;
  for (const row of rows) {
    const bucket = byChoice.get(row.choice) ?? { success: 0, failure: 0 };
    if (row.outcome === "enemy_defeated" || row.outcome === "avoided") {
      bucket.success += row.count * (row.runWon ? WIN_REWARD_MULTIPLIER : 1);
    } else if (row.outcome === "player_damaged") {
      bucket.failure += row.count;
    }
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
  /** See DecisionRecord.disagreesWithMemory's own comment -- how often the model's own
   * answer diverged sharply from what the data would have picked. Purely observational: the
   * model's choice always executes as given. Tracked separately from fallbackRate since they
   * read very differently (the model never answered vs. it answered and reasoned against
   * the numbers) -- and this is the number to watch for whether the agent's own reasoning
   * is closing that gap over time, independent of the data ever correcting it. */
  disagreesWithMemoryRate: number;
  avgLatencyMs: number;
  outcomeBreakdown: Record<string, number>;
  /** Choice distribution split by decision type -- outcomeBreakdown above mixes
   * enemyResponse and priorityAction choices together, which hides exactly the kind of
   * lopsided behavior (e.g. "advance" picked 9x out of 10) a stats page exists to surface. */
  choicesByDecisionType: Record<string, Record<string, number>>;
  totalRuns: number;
  wins: number;
  losses: number;
  winRate: number;
  fastestWinSeconds: number | null;
  currentStreak: { type: "win" | "loss"; length: number } | null;
  longestWinStreak: number;
  /** Chronological win/loss timeline, oldest first -- enough to render a streak strip or
   * spot when a model's fortunes actually turned, not just the summary numbers. */
  timeline: Array<{ runId: string; won: boolean; startedAt: string; seconds: number | null }>;
}

export function getStats(): { totalDecisions: number; legacyDecisions: number; byBackendModel: BackendModelStats[] } {
  // Same best-effort discipline as recordDecision above: a read failure
  // here must return an empty stats shape, never crash the dev server.
  let rows: Array<{ backend: string; model: string; runId: string; decisionType: string; choice: string | null; fallback: number; disagreesWithMemory: number; outcome: string; latencyMs: number; createdAt: string }>;
  let legacyDecisions = 0;
  try {
    // Scoped to CURRENT_GENERATION, same reasoning as queryOutcomeCounts -- a stats page
    // (or leaderboard, or a future report) mixing pre-fix and post-fix decisions would
    // look exactly as lopsided as before even though the live system no longer behaves
    // that way. legacyDecisions below keeps that history visible rather than silently
    // hiding it, just not blended into "how is the game doing right now."
    rows = getDb()
      .prepare(
        `SELECT backend, model, run_id as runId, decision_type as decisionType, choice, fallback, disagrees_with_memory as disagreesWithMemory, outcome, latency_ms as latencyMs, created_at as createdAt FROM decisions WHERE generation = @generation`,
      )
      .all({ generation: CURRENT_GENERATION }) as typeof rows;
    legacyDecisions = (getDb().prepare(`SELECT COUNT(*) as c FROM decisions WHERE generation != @generation`).get({ generation: CURRENT_GENERATION }) as { c: number }).c;
  } catch (error) {
    console.error(JSON.stringify({ event: "agent_history_read_failed", error: String(error) }));
    return { totalDecisions: 0, legacyDecisions: 0, byBackendModel: [] };
  }

  // Every completed run (win only -- see recordRunCompletion's own comment on why losses
  // never reach this table) for the backend/model + run_id cross-reference below.
  const wins = getAllRuns().filter((run) => run.mode === "agent");
  const winByRunId = new Map(wins.map((run) => [run.runId, run]));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    // scripts/seed-agent-memory.ts's synthetic bootstrap rows (backend "ollama", model
    // "seed-data") exist to warm the Bayesian bandit before any real model has played, not
    // to represent a model that actually ran -- showing them on a stats page as if they
    // were a competitor would misattribute made-up numbers to nobody.
    if (row.model === "seed-data") continue;
    const key = `${row.backend}::${row.model}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const byBackendModel: BackendModelStats[] = Array.from(groups.entries()).map(([key, group]) => {
    const [backend, model] = key.split("::");
    const outcomeBreakdown: Record<string, number> = {};
    const choicesByDecisionType: Record<string, Record<string, number>> = {};
    for (const row of group) {
      outcomeBreakdown[row.outcome] = (outcomeBreakdown[row.outcome] ?? 0) + 1;
      if (row.choice) {
        const byChoice = choicesByDecisionType[row.decisionType] ?? {};
        byChoice[row.choice] = (byChoice[row.choice] ?? 0) + 1;
        choicesByDecisionType[row.decisionType] = byChoice;
      }
    }

    // One row per distinct run_id, earliest decision timestamp as the run's start --
    // cross-referenced against winByRunId (a win if present there, a loss otherwise, since
    // every attempt -- win or lose -- generates at least one decision but only a win
    // reaches the runs table).
    const runStarts = new Map<string, string>();
    for (const row of group) {
      const existing = runStarts.get(row.runId);
      if (!existing || row.createdAt < existing) runStarts.set(row.runId, row.createdAt);
    }
    const timeline = Array.from(runStarts.entries())
      .map(([runId, startedAt]) => {
        const win = winByRunId.get(runId);
        return { runId, won: Boolean(win), startedAt, seconds: win?.seconds ?? null };
      })
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    let longestWinStreak = 0;
    let running = 0;
    for (const entry of timeline) {
      running = entry.won ? running + 1 : 0;
      longestWinStreak = Math.max(longestWinStreak, running);
    }
    let currentStreak: BackendModelStats["currentStreak"] = null;
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const won = timeline[i].won;
      if (currentStreak === null) currentStreak = { type: won ? "win" : "loss", length: 1 };
      else if ((currentStreak.type === "win") === won) currentStreak.length += 1;
      else break;
    }

    const winCount = timeline.filter((entry) => entry.won).length;
    const fastestWinSeconds = timeline.reduce<number | null>(
      (fastest, entry) => (entry.won && entry.seconds != null && (fastest == null || entry.seconds < fastest) ? entry.seconds : fastest),
      null,
    );

    return {
      backend,
      model,
      totalDecisions: group.length,
      fallbackRate: group.filter((row) => row.fallback).length / group.length,
      disagreesWithMemoryRate: group.filter((row) => row.disagreesWithMemory).length / group.length,
      avgLatencyMs: group.reduce((sum, row) => sum + row.latencyMs, 0) / group.length,
      outcomeBreakdown,
      choicesByDecisionType,
      totalRuns: timeline.length,
      wins: winCount,
      losses: timeline.length - winCount,
      winRate: timeline.length > 0 ? winCount / timeline.length : 0,
      fastestWinSeconds,
      currentStreak,
      longestWinStreak,
      timeline,
    };
  });

  return { totalDecisions: rows.length, legacyDecisions, byBackendModel };
}
