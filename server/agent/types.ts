// Decision protocol for Shoe Adventure's "Strategic Director" agent runs.
//
// The shape deliberately mirrors the Dominion project's Agent Protocol
// (agents/base.py): a discrete, structured question with a small fixed
// option set, answered by a pluggable backend, with a resilient fallback
// on any failure so a live run never stalls. Unlike Dominion, this game is
// real-time physics, not turn-based -- so only a handful of high-value
// branch points are exposed this way (see GameWorld.ts's updateAgentRun),
// while movement/collision/jump timing stay deterministic engine code.

/** Every decision type an agent run can be asked about. Phase 1 ships one;
 * more (upgrade priority, fight-or-retreat) are added the same way later
 * without changing this module's shape. */
export type DecisionType = "enemyResponse";

/** The legal replies for "enemyResponse" -- an enemy is in range and the
 * agent must choose how Right Shoe handles it. Mirrors the ability set
 * already implemented in GameWorld.ts's tryGumStomp/tryLaceLash/
 * performSuperKick. */
export const ENEMY_RESPONSE_OPTIONS = ["gum_stomp", "lace_lash", "super_kick", "avoid"] as const;
export type EnemyResponseChoice = (typeof ENEMY_RESPONSE_OPTIONS)[number];

/** A serialized, decision-relevant slice of GameWorld's live state -- never
 * the whole engine, just what a specific decision type needs to reason
 * about. Extend with a new field per decision type as more are added. */
export interface EnemyResponseState {
  player: {
    x: number;
    hearts: number;
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

export type DecisionState = EnemyResponseState;

export interface DecisionRequest {
  /** Groups every decision from one playthrough for history/stats -- the
   * client generates one id per agent run and reuses it for every call. */
  runId: string;
  decisionType: DecisionType;
  backend: "ollama" | "llamacpp" | "hosted";
  model: string;
  state: DecisionState;
}

export interface DecisionResponse {
  /** null whenever the call failed for any reason (timeout, network,
   * unparseable reply) -- the caller (GameWorld.ts) always has a scripted
   * default to fall back to, the same "never stalls the show" contract
   * Dominion's InferenceClient.generate() documents. */
  choice: EnemyResponseChoice | null;
  fallback: boolean;
  backend: string;
  model: string;
  latencyMs: number;
}
