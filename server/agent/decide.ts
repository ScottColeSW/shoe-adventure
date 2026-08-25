// Builds the prompt for a decision, calls the selected backend, and
// parses the reply defensively -- the same "grammar/schema constrains
// syntax, the parser stays in place regardless" discipline Dominion's
// grammars.py documents. Any failure at any step (unknown backend, call
// failure, unparseable reply) returns fallback: true rather than throwing,
// so the Express route (server/index.ts) never needs its own try/catch
// around a live call.
//
// Dispatch is decision-type-driven rather than one hardcoded prompt: each
// DecisionType has its own options/buildPrompt/parse, registered in
// DECISION_HANDLERS below. This is also where long-term memory plugs in --
// see buildContextKey/getMemory/thompsonSample -- a real Bayesian contextual
// bandit now covers both enemyResponse and priorityAction (see history.ts's
// hierarchical-backoff docstring on getMemory for the full design).

import {
  ENEMY_RESPONSE_OPTIONS,
  PRIORITY_ACTION_OPTIONS,
  type DecisionRequest,
  type DecisionResponse,
  type EnemyResponseChoice,
  type EnemyResponseState,
  type PriorityActionChoice,
  type PriorityActionState,
} from "./types";
import type { AgentBackend } from "./backends/base";
import { OllamaBackend } from "./backends/ollama";
import { LlamaCppBackend } from "./backends/llamacpp";
import { HostedApiBackend } from "./backends/hostedApi";
import { agentConfig } from "./config";
import { recordDecision, getMemory, getLatencyProfile, type MemoryEntry } from "./history";
import { getLeaderboard } from "../runs";

const backends: Record<DecisionRequest["backend"], AgentBackend> = {
  ollama: new OllamaBackend(),
  llamacpp: new LlamaCppBackend(),
  hosted: new HostedApiBackend(),
};

/** The competitive-context line the briefing below folds in -- "they would have to see it
 * before the game so they can amp up." Live off the same runs table the /stats page and
 * public leaderboard already read (server/runs.ts's getLeaderboard, agent-run completions
 * only), so a model gets told what it's actually up against, not a static claim that goes
 * stale the moment a faster run lands. Best-effort like every other history read in this
 * codebase: an empty or unreachable board degrades to no line at all, never a thrown error
 * that would break a live decision call. */
function buildLeaderboardLine(request: DecisionRequest): string {
  const board = getLeaderboard(5).filter((entry) => entry.mode === "agent");
  if (board.length === 0) return "";
  const ranked = board.map((entry, index) => `${index + 1}. ${entry.model ?? entry.backend} — ${entry.seconds.toFixed(1)}s`).join("; ");
  const ownBest = board.find((entry) => entry.model === request.model && entry.backend === request.backend);
  const standing = ownBest
    ? ` Your own best finish so far is ${ownBest.seconds.toFixed(1)}s.`
    : " You have no completed run on the board yet -- this could be your first.";
  return `Leaderboard (fastest completions so far, agent runs only): ${ranked}.${standing} Faster is better, but a slower real finish always beats a fall or a loss -- don't trade safety for a shot at the top spot.`;
}

/** Shared framing prepended to every prompt regardless of decision type. Before this, a
 * model was dropped straight into a bare tactical question ("an enemy is ahead, pick
 * one word") with no sense of the game's actual objective, what generally matters, or
 * that it's part of an ongoing run being asked many small questions in a row -- so its
 * answers had nothing to generalize from beyond the single instant. This is the general
 * "why" that lets the per-decision memory summary (see summarizeMemory) actually mean
 * something to the model, instead of being an unexplained statistic. */
function buildGameBriefing(request: DecisionRequest): string {
  return [
    "You are playing Shoe Adventure, a side-scrolling platformer. You control Right Shoe on a rescue mission across 6 discrete screens, each a full toy-scale level in its own right (shoeboxes, a laundry lane, a rogue-skate tower, and more). Reach the exit archway at the far end of a screen to advance to the next one -- there is no backtracking to an earlier screen.",
    "The 6th and final screen ends differently: instead of an exit archway, it holds the true boss guarding a rescue dome. Beat the boss, then reach Left Shoe inside the dome to reunite the pair and win the whole run. Screens 1-5 have no boss gate blocking the exit itself, though some have a tougher mini-boss enemy along the way.",
    request.timeTrial
      ? "This is a TIME TRIAL: the whole run is on a real clock, and running out of time ends it as a loss. Decide quickly -- when the ranked history below has a clear answer, lean on it rather than deliberating at length. Speed matters here in a way it doesn't in an ordinary run."
      : "There is no time limit. Nothing punishes you for slowing down to collect a useful pickup, fight an enemy carefully, or size up the situation before choosing -- rushing toward the exit is not automatically the safe or correct call, just one option among several. Weigh each decision on its own merits instead of defaulting to forward progress.",
    "General strategy: pickups along the way unlock abilities and shoe-form transformations that make later fights and obstacles much easier, so a detour for one is often worth it even if it costs some distance. Enemies deal real damage -- hearts are limited, so running low means favoring a safe, reliable response over a risky one. Boss and mini-boss enemies are tougher and often go down cleanest to a specific ability rather than a plain attack.",
    "You will be asked many small decisions like this over the course of one run, and this same situation will come up again in future runs too. When past outcomes for a similar situation are shown below, they reflect what has actually worked before across real attempts -- weigh them accordingly.",
    buildLeaderboardLine(request) || null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The self-tuning per-request timeout: generous (agentConfig.decisionTimeoutMs) until a
 * specific backend+model has built up enough real successful-call history to trust, then
 * tightened toward that model's own observed p90 latency (see history.ts's
 * getLatencyProfile). This is the same "captured data informs future behavior" idea the
 * memory system already applies to choices, applied to timing instead -- a model that's
 * consistently fast gets asked to answer faster over time, and a model that's
 * consistently slow keeps the headroom its own track record says it actually needs,
 * rather than every backend+model sharing one guessed constant forever. */
// Time Trial's real ceiling regardless of a model's own self-tuned history below -- "under
// time pressure which we do not have in our normal runs" (the user). Deliberately not run
// through the same self-tuning as the ordinary path: the whole point is a hard, felt
// constraint, not a comfortable one a fast model quietly grows into.
const TIME_TRIAL_TIMEOUT_MS = 2200;

function resolveTimeoutMs(backend: string, model: string, timeTrial: boolean): number {
  if (timeTrial) return TIME_TRIAL_TIMEOUT_MS;
  const profile = getLatencyProfile(backend, model);
  if (!profile || profile.samples < agentConfig.decisionLatencySamplesToTighten) return agentConfig.decisionTimeoutMs;
  const tightened = profile.p90LatencyMs * agentConfig.decisionLatencyBuffer;
  return Math.min(agentConfig.decisionTimeoutMs, Math.max(agentConfig.decisionMinTimeoutMs, tightened));
}

// Fraction-based, not a fixed hearts<=1/===2 split: max hearts now varies at runtime (the
// "heartPlus" pickup raises it above the starting 3), so bucketing against the actual
// cap keeps "low"/"mid"/"full" meaning the same relative danger regardless of how many
// hearts the player has grabbed this life.
function heartsBucket(hearts: number, maxHearts: number): string {
  const fraction = maxHearts > 0 ? hearts / maxHearts : 0;
  return fraction <= 1 / 3 ? "low" : fraction <= 2 / 3 ? "mid" : "full";
}

/** Every context key comes as a {specific, general} pair -- see getMemory's own docstring
 * for why (hierarchical backoff). "general" is deliberately coarser: it drops shoe form
 * and hearts, keeping only what most changes which choice is actually right. */
interface ContextKeys {
  specific: string;
  general: string;
}

function buildContextKey(request: DecisionRequest): ContextKeys {
  if (request.decisionType === "enemyResponse") {
    const { player, enemy } = request.state as EnemyResponseState;
    return {
      specific: `enemy:${enemy.kind}:${enemy.bossTier ?? "none"}:hearts${heartsBucket(player.hearts, player.maxHearts)}:${player.shoeForm}`,
      general: `enemy:${enemy.kind}:${enemy.bossTier ?? "none"}`,
    };
  }
  const { player, nearbyEnemies, nearbyPickups } = request.state as PriorityActionState;
  const situation = `enemy${nearbyEnemies.length > 0 ? "y" : "n"}:pickup${nearbyPickups.length > 0 ? "y" : "n"}`;
  return {
    specific: `goal:${situation}:hearts${heartsBucket(player.hearts, player.maxHearts)}:${player.shoeForm}`,
    general: `goal:${situation}`,
  };
}

/** Marsaglia & Tsang (2000)'s method for sampling Gamma(shape, 1) -- the standard
 * approach, valid directly for shape >= 1 and boosted via the usual u^(1/shape) trick
 * below 1. Two independent Gamma draws give one Beta(alpha, beta) draw
 * (X ~ Gamma(alpha), Y ~ Gamma(beta) => X/(X+Y) ~ Beta(alpha, beta)), which is what
 * thompsonSample() actually needs. */
function sampleGamma(shape: number): number {
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); // Box-Muller
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

/** Thompson Sampling: draw one sample from each legal choice's Beta(alpha, beta)
 * posterior (see getMemory) and pick whichever sample is highest. This is the actual
 * decision-making upgrade over the old "wait for >=5 samples, then always take the top
 * mean" policy -- a choice with zero data still has a real (if usually smaller) chance of
 * winning a given draw, because its wide Beta(1,1) posterior can occasionally sample
 * high, so the fallback naturally explores instead of ignoring anything short of an
 * arbitrary sample-count threshold. As more outcomes come in, each choice's posterior
 * narrows around its true rate and the best one wins the draw more and more often --
 * exploration and exploitation from the same mechanism, no hand-tuned epsilon needed. */
// Validated against a real 10-run batch after the summarizeMemory/buildPriorityActionPrompt
// wiring fix (see DECISION_HANDLERS's comment): "advance" was STILL chosen 94% of the time
// for priorityAction even with the ranked memory line and an imperative "prefer the
// top-ranked option" instruction sitting right in the prompt, and of those advance picks,
// player_damaged (136/273) roughly tied avoided (130/273) -- a coin flip, not a safe
// default. This was originally the threshold for silently overriding a live answer outright
// (see decide()'s own comment on why that got walked back to just recording the
// disagreement instead) -- kept as the gate for *flagging* a real disagreement worth a
// second look, not for acting on it unilaterally. The interesting open question, per the
// user, is whether the agent's own reasoning can close this gap over time without the data
// ever touching what it actually does.
const CONFIDENCE_OVERRIDE_MIN_SAMPLES = 8;
const CONFIDENCE_OVERRIDE_GAP = 0.25;

function thompsonSample(entries: MemoryEntry[], legalOptions: readonly string[]): string | null {
  const byChoice = new Map(entries.map((entry) => [entry.choice, entry]));
  let best: string | null = null;
  let bestSample = -Infinity;
  for (const option of legalOptions) {
    const entry = byChoice.get(option);
    const sample = sampleBeta(entry?.alpha ?? 1, entry?.beta ?? 1); // Beta(1,1): no data, uniform prior
    if (sample > bestSample) {
      bestSample = sample;
      best = option;
    }
  }
  return best;
}

// Real accumulated data (11k+ decisions) showed the model routinely picked "advance" even
// when the numbers right above it in the same prompt clearly favored something else --
// e.g. collect_pickup succeeded ~70% of the time against advance's ~53%, but advance was
// still chosen 15x more often. The list itself was never in question (getMemory already
// sorts descending -- see its own docstring); what was missing was telling the model that
// explicitly and imperatively, not just handing it numbers to weigh on its own judgment.
function summarizeMemory(keys: ContextKeys): { line: string; entries: MemoryEntry[] } {
  const entries = getMemory(keys.specific, keys.general);
  if (entries.length === 0) return { line: "", entries };
  const summary = entries
    .map((entry) => `${entry.choice}: ~${Math.round(entry.successRate * 100)}% estimated success (Bayesian, from ${entry.samples} direct ${entry.samples === 1 ? "try" : "tries"} plus related experience)`)
    .join("; ");
  return {
    line: `From past encounters like this, ranked highest success first: ${summary}. Prefer the top-ranked option unless something specific about this exact moment (hearts low, a better ability ready, terrain) argues for a different one.`,
    entries,
  };
}

function buildEnemyResponsePrompt(request: DecisionRequest, memoryLine: string): string {
  const { player, enemy } = request.state as EnemyResponseState;
  const bossNote = enemy.bossTier ? ` It is a ${enemy.bossTier} boss named ${enemy.bossName}.` : "";
  return [
    buildGameBriefing(request),
    "",
    "Right Shoe is about to encounter an enemy.",
    `Right Shoe has ${player.hearts}/${player.maxHearts} hearts left and is currently in ${player.shoeForm} form.${bossNote}`,
    `The enemy is a ${enemy.kind}.`,
    "Available responses:",
    player.gumStompReady ? "- gum_stomp: a sticky ground-pound attack" : null,
    player.laceLashReady ? "- lace_lash: a short-range whip attack" : null,
    "- super_kick: a basic jumping kick, always available",
    "- avoid: dodge past without attacking",
    memoryLine || null,
    "Reply with exactly one word: gum_stomp, lace_lash, super_kick, or avoid.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseEnemyResponseChoice(raw: string | null): EnemyResponseChoice | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return (ENEMY_RESPONSE_OPTIONS as readonly string[]).find((option) => normalized.includes(option)) as EnemyResponseChoice | null | undefined ?? null;
}

function buildPriorityActionPrompt(request: DecisionRequest, memoryLine: string): string {
  const { player, nearbyPickups, nearbyEnemies, nearbyTerrain, nextObjective } = request.state as PriorityActionState;
  const pickups = nearbyPickups.length
    ? nearbyPickups.map((p) => `${p.kind} (${p.distance.toFixed(1)} units ${p.distance >= 0 ? "ahead" : "behind"})`).join(", ")
    : "none nearby";
  const enemies = nearbyEnemies.length
    ? nearbyEnemies.map((e) => `${e.bossTier ? `${e.bossTier}-boss ` : ""}${e.kind} (${e.distance.toFixed(1)} units ${e.distance >= 0 ? "ahead" : "behind"})`).join(", ")
    : "none nearby";
  const terrainLabel: Record<PriorityActionState["nearbyTerrain"][number]["kind"], string> = {
    gap: "a gap that needs a jump",
    bouncePad: "a bounce pad",
    crumble: "a crumbling platform",
  };
  const terrain = nearbyTerrain.length
    ? nearbyTerrain.map((t) => `${terrainLabel[t.kind]} (${t.distance.toFixed(1)} units ahead)`).join(", ")
    : "clear ground ahead";
  return [
    buildGameBriefing(request),
    "",
    "Right Shoe needs a general goal. Take whatever time you need to reason about it -- there is no clock running.",
    `Right Shoe has ${player.hearts}/${player.maxHearts} hearts and is in ${player.shoeForm} form, currently ${player.grounded ? "standing on solid ground" : "airborne"}.`,
    `Nearby pickups: ${pickups}.`,
    `Nearby enemies: ${enemies}.`,
    `Terrain ahead: ${terrain}. Jump timing is automatic -- you don't need to time jumps yourself, just judge whether the terrain ahead makes advancing, fighting, or dashing the safer call.`,
    `The level exit marker (or Left Shoe, on the final level) is ${nextObjective.distance.toFixed(1)} units ahead.`,
    memoryLine || null,
    "Available goals:",
    "- advance: keep moving toward the level exit marker distance given above",
    "- collect_pickup: go get the nearest pickup",
    "- engage_enemy: move toward and fight the nearest enemy",
    player.dashReady ? "- use_dash: burst forward immediately, useful to clear a gap or crumbling platform quickly" : null,
    player.ultraReady ? "- use_ultra: unleash the Ultra Move immediately" : null,
    "Reply with exactly one word: advance, collect_pickup, engage_enemy, use_dash, or use_ultra.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parsePriorityActionChoice(raw: string | null): PriorityActionChoice | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return (PRIORITY_ACTION_OPTIONS as readonly string[]).find((option) => normalized.includes(option)) as PriorityActionChoice | null | undefined ?? null;
}

const DECISION_HANDLERS = {
  enemyResponse: { options: ENEMY_RESPONSE_OPTIONS, buildPrompt: buildEnemyResponsePrompt, parse: parseEnemyResponseChoice },
  // Was silently dropping memoryLine (buildPriorityActionPrompt took only `request`) --
  // every priorityAction decision built a memory summary via summarizeMemory() just to
  // throw it away, so the model never saw its own learned stats for advance/collect_pickup/
  // engage_enemy/use_dash/use_ultra, only for enemy fights. Real data backs this up: across
  // 654 real priorityAction decisions, "advance" was chosen 585 times (89%) and
  // "engage_enemy"/"use_ultra" were never chosen once -- consistent with a model reasoning
  // from the game briefing alone, with no situational feedback loop at all.
  priorityAction: { options: PRIORITY_ACTION_OPTIONS, buildPrompt: buildPriorityActionPrompt, parse: parsePriorityActionChoice },
} as const;

/** The *currently usable* subset of a decision type's full option list -- e.g.
 * gum_stomp only counts as legal this decision if the player actually has it unlocked
 * and off cooldown right now. Thompson Sampling must draw from this, not the full static
 * option list, or the bandit could "pick" something the player can't actually do. Mirrors
 * exactly what buildEnemyResponsePrompt/buildPriorityActionPrompt already tell the live
 * model is available, just as a plain array instead of prompt text. */
function legalOptionsNow(request: DecisionRequest): readonly string[] {
  if (request.decisionType === "enemyResponse") {
    const { player } = request.state as EnemyResponseState;
    return ["super_kick", "avoid", ...(player.gumStompReady ? ["gum_stomp"] : []), ...(player.laceLashReady ? ["lace_lash"] : [])];
  }
  const { player } = request.state as PriorityActionState;
  return ["advance", "collect_pickup", "engage_enemy", ...(player.dashReady ? ["use_dash"] : []), ...(player.ultraReady ? ["use_ultra"] : [])];
}

export async function decide(request: DecisionRequest): Promise<DecisionResponse> {
  const backend = backends[request.backend];
  const base = { backend: request.backend, model: request.model };
  const contextKeys = buildContextKey(request);
  const { line: memoryLine, entries: memoryEntries } = summarizeMemory(contextKeys);

  if (!backend) {
    const id = recordDecision({ runId: request.runId, decisionType: request.decisionType, ...base, choice: null, fallback: true, disagreesWithMemory: false, outcome: "unknown", latencyMs: 0, contextKey: contextKeys.specific, contextKeyGeneral: contextKeys.general });
    return { choice: null, fallback: true, disagreesWithMemory: false, ...base, latencyMs: 0, decisionId: id ?? undefined };
  }

  const handler = DECISION_HANDLERS[request.decisionType];
  const prompt = handler.buildPrompt(request, memoryLine);
  const timeoutMs = resolveTimeoutMs(request.backend, request.model, request.timeTrial ?? false);
  const { raw, latencyMs } = await backend.decide(prompt, request.model, handler.options, timeoutMs);
  let choice = handler.parse(raw) as DecisionResponse["choice"];
  let fallback = choice === null;

  // No longer a "confidence override" -- an earlier version of this replaced the model's
  // own answer with the data-preferred one outright, which is exactly the "spoon-feeding"
  // the user explicitly doesn't want: the point is watching the agent get better at
  // *reasoning*, not at being quietly corrected every time it disagrees with the numbers.
  // What's worth keeping is the disagreement itself as a real signal -- akin to a
  // "Second Opinion" note to a future self: record when the model's choice and the data's
  // top-ranked choice diverge, and by how much, without touching what actually executes.
  // Same gating as before (well-sampled on both sides, not penalizing genuine cold-start
  // exploration) -- only now it's an observation, not an action.
  let disagreesWithMemory = false;
  if (choice !== null && memoryEntries.length > 0) {
    const legal = new Set(legalOptionsNow(request));
    const best = memoryEntries.find((entry) => entry.choice !== choice && legal.has(entry.choice));
    const current = memoryEntries.find((entry) => entry.choice === choice);
    if (
      best &&
      current &&
      best.samples >= CONFIDENCE_OVERRIDE_MIN_SAMPLES &&
      current.samples >= CONFIDENCE_OVERRIDE_MIN_SAMPLES &&
      best.successRate - current.successRate >= CONFIDENCE_OVERRIDE_GAP
    ) {
      disagreesWithMemory = true;
    }
  }

  // Bayesian bandit fallback (see thompsonSample/getMemory): whenever the live call
  // fails, times out, or comes back unparseable, sample from each currently-legal
  // choice's learned posterior instead of a fixed priority order. Covers both decision
  // types now -- priorityAction gets the same outcome-driven learning enemyResponse always
  // had (see GameWorld.ts's goal-outcome reporting).
  if (choice === null) {
    const sampled = thompsonSample(memoryEntries, legalOptionsNow(request));
    if (sampled) {
      choice = sampled as DecisionResponse["choice"];
      fallback = true;
    }
  }

  console.log(
    JSON.stringify({
      event: "agent_decision",
      runId: request.runId,
      decisionType: request.decisionType,
      backend: request.backend,
      model: request.model,
      choice,
      fallback,
      disagreesWithMemory,
      latencyMs,
      timeoutMs,
    }),
  );

  // Outcome starts "unknown" here regardless of decisionType -- the client reports back
  // what really happened shortly after via POST /api/agent/decide/:id/outcome (see
  // history.ts's recordOutcome), for both enemyResponse and priorityAction now.
  const id = recordDecision({ runId: request.runId, decisionType: request.decisionType, ...base, choice, fallback, disagreesWithMemory, outcome: "unknown", latencyMs, contextKey: contextKeys.specific, contextKeyGeneral: contextKeys.general });

  return { choice, fallback, disagreesWithMemory, ...base, latencyMs, decisionId: id ?? undefined, prompt, raw };
}

/** Fired once, right when a player picks a model and starts an Agent Run (see the
 * title screen's Agent Run picker and the client's POST /api/agent/warm), before any
 * real gameplay decision is needed. Its only purpose is to force Ollama to load the
 * model into memory up front -- a live-tested cold load took ~12.5s on this machine,
 * which is longer than even the generous learning-phase decision timeout, so paying
 * that cost during an explicit "starting..." moment beats paying it silently on
 * whatever gameplay decision happens to be first. Generous 25s timeout since a cold
 * load is genuinely allowed to take that long here; a real decision call never gets
 * this much room (see resolveTimeoutMs). */
export async function warmModel(backendName: DecisionRequest["backend"], model: string): Promise<{ warm: boolean; latencyMs: number }> {
  const backend = backends[backendName];
  if (!backend) return { warm: false, latencyMs: 0 };
  const { raw, latencyMs } = await backend.decide("Reply with exactly one word: ready.", model, ["ready"], 25000);
  return { warm: raw !== null, latencyMs };
}

/** warmModel's counterpart, fired when a run actually ends (quit, or picking a different
 * model) instead of never -- every decide()/warmModel call sets keep_alive: "30m" (see
 * ollama.ts's own comment on why), and until this existed nothing ever released that early.
 * A real hygiene gap for anyone who plays this: walk away or switch models mid-session and
 * whatever was loaded -- some of these are 18GB -- just sits in RAM/VRAM for the full 30
 * minutes regardless. Ollama-only (the only backend with a local resident-model concept to
 * release); other backends no-op true, matching warmModel's own graceful-no-op shape.
 * Never throws -- this fires from UI actions (quit, model switch) that must never be blocked
 * or visibly fail on a network hiccup here. */
export async function unloadModel(backendName: DecisionRequest["backend"], model: string): Promise<{ unloaded: boolean }> {
  if (backendName !== "ollama") return { unloaded: true };
  try {
    const res = await fetch(`${agentConfig.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    return { unloaded: res.ok };
  } catch {
    return { unloaded: false };
  }
}
