// Decision protocol for Shoe Adventure's "Strategic Director" agent runs.
//
// The shape deliberately mirrors the Dominion project's Agent Protocol
// (agents/base.py): a discrete, structured question with a small fixed
// option set, answered by a pluggable backend, with a resilient fallback
// on any failure so a live run never stalls. Unlike Dominion, this game is
// real-time physics, not turn-based -- so only a handful of high-value
// branch points are exposed this way (see GameWorld.ts's updateAgentRun),
// while movement/collision/jump timing stay deterministic engine code.

/** Every decision type an agent run can be asked about. "enemyResponse" is the original
 * Phase 1 decision (how to handle one enemy directly ahead); "priorityAction" is the
 * broader periodic goal decision (see GameWorld.ts's requestAgentGoal) that replaced the
 * old hardcoded x-threshold route script -- what to do next in general, not just how to
 * fight. */
export type DecisionType = "enemyResponse" | "priorityAction";

/** The legal replies for "enemyResponse" -- an enemy is in range and the
 * agent must choose how Right Shoe handles it. Mirrors the ability set
 * already implemented in GameWorld.ts's tryGumStomp/tryLaceLash/
 * performSuperKick. */
export const ENEMY_RESPONSE_OPTIONS = ["gum_stomp", "lace_lash", "super_kick", "avoid"] as const;
export type EnemyResponseChoice = (typeof ENEMY_RESPONSE_OPTIONS)[number];

/** The legal replies for "priorityAction" -- periodically, not every frame, the agent
 * picks what Right Shoe should focus on next. The engine still owns *how* (steering,
 * jump timing, which specific pickup is nearest) -- the model only picks the category,
 * per GameWorld.ts's requestAgentGoal/steerTowardGoal. */
export const PRIORITY_ACTION_OPTIONS = ["advance", "collect_pickup", "engage_enemy", "use_dash", "use_ultra"] as const;
export type PriorityActionChoice = (typeof PRIORITY_ACTION_OPTIONS)[number];

/** A serialized, decision-relevant slice of GameWorld's live state -- never
 * the whole engine, just what a specific decision type needs to reason
 * about. Extend with a new field per decision type as more are added. */
export interface EnemyResponseState {
  player: {
    x: number;
    hearts: number;
    maxHearts: number;
    shoeForm: string;
    gumStomp: boolean;
    laceLash: boolean;
    ultraMove: boolean;
    gumStompReady: boolean;
    laceLashReady: boolean;
    ultraMoveReady: boolean;
  };
  enemy: {
    kind: string;
    bossTier: "mini" | "boss" | null;
    bossName: string | null;
    x: number;
  };
}

/** Compact -- nearest 2-3 pickups/enemies only, never the whole engine's arrays -- so a
 * local model's prompt stays short enough to answer quickly. Distances are relative
 * (enemy/pickup x minus player x) so the model reasons about "how far / which side"
 * rather than absolute level coordinates it has no other context for. */
export interface PriorityActionState {
  player: {
    hearts: number;
    maxHearts: number;
    shoeForm: string;
    dashCharges: number;
    dashReady: boolean;
    ultraMove: boolean;
    ultraReady: boolean;
    /** Whether Right Shoe is standing on solid ground right now -- jump *timing* stays
     * deterministic engine code (see GameWorld.ts's platformAhead reactive jump; asking a
     * model to time a 60fps jump over the network isn't realistic), but knowing whether a
     * jump is imminent helps the model judge whether "engage_enemy" is even safe right now. */
    grounded: boolean;
  };
  /** height: how far above (positive) or below (negative) the player this sits -- distance
   * alone couldn't distinguish "directly ahead on the same ground" from "six units
   * straight up," which is exactly what a model needs to judge whether collect_pickup is
   * actually a reasonable call here versus something the engine's own jump/drop reflexes
   * would have to fight to reach (see GameWorld.ts's updateAgentRun -- it now suppresses
   * the reactive jump and shortens the drop-through grace window when the current sticky
   * target sits below the player, but it can't do anything about a target genuinely out
   * of jump range above; the model choosing something else instead is the real fix there). */
  nearbyPickups: { kind: string; distance: number; height: number }[];
  nearbyEnemies: { kind: string; bossTier: "mini" | "boss" | null; distance: number; height: number }[];
  /** What's coming up along the route -- a "gap" (a jump the engine will handle
   * automatically but that makes the terrain harder), a bounce pad, or a crumble
   * platform. Lets the model reason about "is the ground ahead safe" rather than judging
   * purely off enemy/pickup positions. */
  nearbyTerrain: { kind: "gap" | "bouncePad" | "crumble"; distance: number }[];
  /** Distance to the actual next objective -- the next untouched level marker, or Left
   * Shoe once every marker is behind. Was missing entirely before: the model was told
   * "advance: keep moving forward toward the level exit" in the static briefing but never
   * given the exit's real distance, so it had no way to judge progress toward it. */
  nextObjective: { distance: number };
}

export type DecisionState = EnemyResponseState | PriorityActionState;

export interface DecisionRequest {
  /** Groups every decision from one playthrough for history/stats -- the
   * client generates one id per agent run and reuses it for every call. */
  runId: string;
  decisionType: DecisionType;
  backend: "ollama" | "llamacpp" | "hosted";
  model: string;
  state: DecisionState;
  /** Time Trial: a real run clock plus a tighter per-decision timeout, as opposed to the
   * ordinary Agent Run's "there's no clock running" framing -- see decide.ts's
   * resolveTimeoutMs and buildGameBriefing for what this actually changes. Optional/absent
   * means ordinary Agent Run; existing callers that never set this keep behaving exactly
   * as before. */
  timeTrial?: boolean;
}

export interface DecisionResponse {
  /** null whenever the call failed for any reason (timeout, network,
   * unparseable reply) -- the caller (GameWorld.ts) always has a scripted
   * default to fall back to, the same "never stalls the show" contract
   * Dominion's InferenceClient.generate() documents. */
  choice: EnemyResponseChoice | PriorityActionChoice | null;
  fallback: boolean;
  /** True when a live, parseable answer came back but disagreed with a well-established
   * memory signal by a wide margin (see decide.ts's CONFIDENCE_OVERRIDE_MIN_SAMPLES/GAP) --
   * an observation, not a correction: choice is always the model's own actual answer, never
   * silently replaced. See DecisionRecord.disagreesWithMemory in history.ts. Never true at
   * the same time as fallback: fallback means no usable live answer existed at all. */
  disagreesWithMemory: boolean;
  backend: string;
  model: string;
  latencyMs: number;
  /** Present whenever the decision was actually recorded (id from history.ts's
   * recordDecision) -- the client holds onto this and reports back what really happened
   * via POST /api/agent/decide/:id/outcome once the encounter resolves, see decide.ts's
   * getMemory()-informed fallback and prompt injection. */
  decisionId?: number;
  /** The exact prompt sent and the model's raw (pre-parsed) reply -- present on every
   * response, not just successes, so the browser console can show a real, inspectable
   * exchange for anyone who wants to confirm a live model is actually answering rather
   * than the game just picking outcomes on its own. See GameWorld.ts's console.log at
   * each call site. */
  prompt?: string;
  raw?: string | null;
}
