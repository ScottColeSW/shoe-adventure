// Pre-populates decision_history.db with plausible decision+outcome rows so a freshly
// deployed build's Bayesian bandit (see server/agent/decide.ts's getMemory/thompsonSample)
// starts with real priors instead of a cold Beta(1,1) "totally unsure" state for every
// context. This does NOT call a live model -- it writes synthetic-but-representative
// historical data directly through the same recordDecision/recordOutcome functions the
// live game uses, so it never depends on Ollama being installed on whatever machine runs
// this (a fresh clone may not have it), and the schema/context-key format always matches
// whatever the current code actually expects (see server/agent/decide.ts's
// buildContextKey -- the specific/general key formats below are hand-kept in sync with
// that function; if buildContextKey's format ever changes, update the two builders below
// to match).
//
// Every row is tagged runId "seed-data" and model "seed-data" (backend "ollama" just to
// satisfy the DecisionRequest["backend"] type) so it's trivially identifiable and
// separable from real play data -- `DELETE FROM decisions WHERE run_id = 'seed-data'`
// removes every trace of it, and it never touches the real per-backend-model latency
// tightening in decide.ts's resolveTimeoutMs, which keys strictly off genuine
// backend+model pairs like "ollama"/"llama3.2:latest".
//
// Prints progress as it goes rather than working silently -- meant to be legible to
// someone running this for the first time right after cloning the repo (see README's
// setup section), not just to whoever wrote it.

import { recordDecision, recordOutcome, getMemory, withTransaction } from "../server/agent/history";

const HEARTS_BUCKETS = ["low", "mid", "full"] as const;
const SHOE_FORMS = ["starter", "coralChrome", "moonstep", "pump", "hightop", "loafer", "cowboy", "sneaker"] as const;
// Mirrors the real roster (see GameWorld.ts's createEnemies): only "skate" ever appears
// as a mini-boss (Lace Captain, Gum Marshal are both createMiniBoss -> createRollerSkate),
// every other kind -- including gumTurret -- is always a regular (bossTier: none) enemy.
const ENEMY_KINDS = ["lace", "slime", "skate", "moth", "gumTurret"] as const;
const ENEMY_CHOICES = ["gum_stomp", "lace_lash", "super_kick", "avoid"] as const;
const GOAL_CHOICES = ["advance", "collect_pickup", "engage_enemy", "use_dash", "use_ultra"] as const;
const SEED_RUN_ID = "seed-data";
const SEED_MODEL = "seed-data";
const SEED_BACKEND = "ollama";
/** Rows written per exact (kind, bossTier, hearts, shoeForm) context per choice on
 * average -- enough for each choice's Beta posterior to move meaningfully off its
 * Laplace prior. Every context combination is seeded (not a random sample of them), so a
 * real decision almost always lands on a context with genuine direct evidence rather than
 * leaning on the general/backoff pool alone. */
const ROWS_PER_CHOICE = 6;

// Must match decide.ts's buildContextKey exactly -- see this file's own top comment.
function enemyContextKeys(kind: string, bossTier: "mini" | null, hearts: string, form: string) {
  return { specific: `enemy:${kind}:${bossTier ?? "none"}:hearts${hearts}:${form}`, general: `enemy:${kind}:${bossTier ?? "none"}` };
}
function goalContextKeys(situation: string, hearts: string, form: string) {
  return { specific: `goal:${situation}:hearts${hearts}:${form}`, general: `goal:${situation}` };
}

/** Loosely mirrors the client's original scriptedEnemyChoice priority order (gum_stomp
 * required against a gum-armored target, gum_stomp/lace_lash favored against a mini-boss)
 * so the seeded priors point toward genuinely sensible play, not noise. */
function enemySuccessProbability(kind: string, bossTier: "mini" | null, choice: (typeof ENEMY_CHOICES)[number]): number {
  if (kind === "gumTurret") {
    if (choice === "gum_stomp") return 0.93;
    if (choice === "avoid") return 0.72;
    return 0.18; // an ordinary attack bounces off an armored target
  }
  if (bossTier === "mini") {
    if (choice === "gum_stomp" || choice === "lace_lash") return 0.83;
    if (choice === "avoid") return 0.6;
    return 0.52;
  }
  return choice === "avoid" ? 0.88 : 0.78;
}

function goalSuccessProbability(choice: (typeof GOAL_CHOICES)[number]): number {
  const table: Record<(typeof GOAL_CHOICES)[number], number> = {
    advance: 0.86,
    collect_pickup: 0.9,
    engage_enemy: 0.74,
    use_dash: 0.82,
    use_ultra: 0.85,
  };
  return table[choice];
}

function seedRow(
  decisionType: "enemyResponse" | "priorityAction",
  choice: string,
  contextKey: string,
  contextKeyGeneral: string,
  successProbability: number,
): void {
  const id = recordDecision({
    runId: SEED_RUN_ID,
    decisionType,
    backend: SEED_BACKEND,
    model: SEED_MODEL,
    choice,
    fallback: false,
    outcome: "unknown",
    latencyMs: 300 + Math.random() * 500,
    contextKey,
    contextKeyGeneral,
  });
  if (id == null) return;
  const succeeded = Math.random() < successProbability;
  const outcome =
    decisionType === "enemyResponse"
      ? choice === "avoid"
        ? succeeded
          ? "avoided"
          : "player_damaged"
        : succeeded
          ? "enemy_defeated"
          : "player_damaged"
      : succeeded
        ? "avoided"
        : "player_damaged";
  recordOutcome(id, outcome);
}

/** A short, readable line printed as each bucket finishes -- lets someone watching this
 * run for the first time see real progress and real numbers scroll by, not a silent
 * pause followed by a summary they have to trust blindly. */
function logBucket(label: string, contextKey: string, rowsWritten: number): void {
  console.log(`  [${String(rowsWritten).padStart(4)} rows] ${label}  ${contextKey}`);
}

function seedEnemyResponse(): number {
  console.log("\nSeeding enemyResponse contexts (every enemy kind x boss tier x hearts bucket x shoe form)...");
  let written = 0;
  for (const kind of ENEMY_KINDS) {
    const bossTiers: (null | "mini")[] = kind === "skate" ? [null, "mini"] : [null];
    for (const bossTier of bossTiers) {
      for (const hearts of HEARTS_BUCKETS) {
        for (const form of SHOE_FORMS) {
          const { specific, general } = enemyContextKeys(kind, bossTier, hearts, form);
          for (const choice of ENEMY_CHOICES) {
            for (let i = 0; i < ROWS_PER_CHOICE; i += 1) {
              seedRow("enemyResponse", choice, specific, general, enemySuccessProbability(kind, bossTier, choice));
              written += 1;
            }
          }
          logBucket(`${kind}${bossTier ? `/${bossTier}` : ""}, hearts:${hearts}, ${form}`, specific, ENEMY_CHOICES.length * ROWS_PER_CHOICE);
        }
      }
    }
  }
  console.log(`enemyResponse: ${written} rows written.`);
  return written;
}

function seedPriorityAction(): number {
  console.log("\nSeeding priorityAction contexts (every nearby-enemy x nearby-pickup x hearts bucket x shoe form)...");
  let written = 0;
  for (const enemyNear of ["y", "n"]) {
    for (const pickupNear of ["y", "n"]) {
      for (const hearts of HEARTS_BUCKETS) {
        for (const form of SHOE_FORMS) {
          const situation = `enemy${enemyNear}:pickup${pickupNear}`;
          const { specific, general } = goalContextKeys(situation, hearts, form);
          for (const choice of GOAL_CHOICES) {
            for (let i = 0; i < ROWS_PER_CHOICE; i += 1) {
              seedRow("priorityAction", choice, specific, general, goalSuccessProbability(choice));
              written += 1;
            }
          }
          logBucket(`${situation}, hearts:${hearts}, ${form}`, specific, GOAL_CHOICES.length * ROWS_PER_CHOICE);
        }
      }
    }
  }
  console.log(`priorityAction: ${written} rows written.`);
  return written;
}

/** Reads back a few representative contexts through the exact same getMemory() the live
 * bandit uses, so this prints what the game will actually see -- not just "rows were
 * inserted." A real posterior mean per choice, ranked, confirms the seeded priors landed
 * where enemySuccessProbability/goalSuccessProbability intended (e.g. gum_stomp should
 * clearly lead against gumTurret) rather than getting silently diluted or misfiled. */
function printSpotCheck(): void {
  console.log("\n" + "=".repeat(60));
  console.log("Spot check -- read back through the real getMemory(), same as the live bandit uses:");
  const samples: { label: string; specific: string; general: string }[] = [
    { label: "gumTurret, mid hearts, starter form (expect gum_stomp clearly on top)", ...enemyContextKeys("gumTurret", null, "mid", "starter") },
    { label: "skate mini-boss, mid hearts, starter form (expect gum_stomp/lace_lash on top)", ...enemyContextKeys("skate", "mini", "mid", "starter") },
    { label: "lace, low hearts, starter form (expect avoid on top)", ...enemyContextKeys("lace", null, "low", "starter") },
    { label: "goal: enemy+pickup nearby, mid hearts, starter form (expect collect_pickup on top)", ...goalContextKeys("enemyy:pickupy", "mid", "starter") },
  ];
  for (const sample of samples) {
    console.log(`\n  ${sample.label}`);
    const entries = getMemory(sample.specific, sample.general);
    if (entries.length === 0) {
      console.log("    [!] no entries found -- context key mismatch, needs investigating");
      continue;
    }
    for (const entry of entries) {
      console.log(`    ${entry.choice.padEnd(14)} ~${Math.round(entry.successRate * 100)}%  (${entry.samples} direct samples, alpha=${entry.alpha.toFixed(1)} beta=${entry.beta.toFixed(1)})`);
    }
  }
  console.log("\n" + "=".repeat(60));
}

function main() {
  const startedAt = Date.now();
  console.log("Seeding server/agent's decision_history.db with synthetic-but-representative agent memory...");
  // One transaction for the whole batch -- see withTransaction's own docstring for why
  // this matters (a per-row implicit transaction/fsync turns this into a multi-minute
  // operation instead of a sub-second one). Progress still prints incrementally as each
  // bucket finishes; the transaction only controls when the disk commit happens, not
  // when this script's own console output happens.
  const [enemyRows, goalRows] = withTransaction(() => [seedEnemyResponse(), seedPriorityAction()] as const);
  console.log(`\nWrote ${enemyRows + goalRows} total rows (${enemyRows} enemyResponse + ${goalRows} priorityAction) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
  printSpotCheck();
  console.log("\nDone. To remove this seed data later: DELETE FROM decisions WHERE run_id = 'seed-data';");
  // Live-tested: without this, the process hung around after finishing -- tsx's own
  // loader/preflight child process doesn't reliably exit on its own once the script's
  // synchronous work is done, and better-sqlite3 holds a native handle that isn't
  // event-loop-visible but still leaves the process technically alive. Explicit exit
  // avoids leaving an orphaned process holding the database file open.
  process.exit(0);
}

main();
