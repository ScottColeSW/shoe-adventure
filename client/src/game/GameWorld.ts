// The Lost Pair visual reminder: a tactile, toy-scale rescue platformer in deep navy and teal, with Rescue Coral #FF5A4F signaling the Right Shoe’s courage and the route to the Left Shoe.
// This module owns gameplay and Babylon scene objects only; React is deliberately kept out of the game rules.

import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { AudioDirector } from "./audio";

export type GameMode = "title" | "playing" | "paused" | "won" | "lost";
/** Drives the HUD's icon-based AI status readout instead of a prose sentence feed --
 * see GameWorld.setAgentActivity() and GameCanvas.tsx's agent-activity glyph map. */
export type AgentActivity = "idle" | "advancing" | "targeting" | "attacking" | "dodging" | "usingUltra" | "thinking" | "fallback";
type PickupKind =
  | "button"
  | "feather"
  | "dash"
  | "heart"
  | "moon"
  | "chrome"
  | "moonstep"
  | "lash"
  | "gum"
  | "superJump"
  | "bonus"
  | "pump"
  | "hightop"
  | "loafer"
  | "cowboy"
  | "sneaker"
  | "ultra"
  | "heartPlus"
  | "extraLife";
type ShoeForm = "starter" | "coralChrome" | "moonstep" | "pump" | "hightop" | "loafer" | "cowboy" | "sneaker";
/** "There should only be 1 button for Special Move which uses the next item in their
 * storage" -- Gum Stomp and Lace Lash used to be separate, permanently-unlocked abilities
 * on their own keys (Q/E). Now they're one-time-use inventory items sharing a single
 * trigger (see PlayerState.specialMoveQueue, tryUseSpecialMove). Ultra Move and the form
 * attack stay as they were -- distinct, rarer abilities the user didn't ask to fold in. */
type SpecialMoveKind = "gumStomp" | "laceLash";
type EnemyKind = "lace" | "slime" | "skate" | "moth" | "gumTurret";
/** Real names for flavor text (see e.g. tryLaceLash/tryGumStomp's this.message lines) --
 * was generic "shoe fiends" for every kind, which read as a placeholder rather than the
 * actual enemies list this game already has (Lace Goblins, Gum Slimes, Dust Moths, Gum
 * Turrets, Rogue Skates for skate-kind minis/the true boss). */
const ENEMY_KIND_LABEL: Record<EnemyKind, string> = {
  lace: "Lace Goblins",
  slime: "Gum Slimes",
  skate: "Rogue Skates",
  moth: "Dust Moths",
  gumTurret: "Gum Turrets",
};

/** Builds a natural-language list of which enemy kinds got hit ("Lace Goblins" /
 * "Lace Goblins and Gum Slimes" / "Lace Goblins, Gum Slimes, and a Rogue Skate") instead of
 * the old one-size-fits-all "the shoe fiends". Falls back to the generic phrase only when
 * targets is somehow empty (callers already branch on that separately, but stay defensive). */
function describeEnemyTargets(targets: Enemy[]): string {
  const kinds = Array.from(new Set(targets.map((enemy) => enemy.kind)));
  const labels = kinds.map((kind) => ENEMY_KIND_LABEL[kind]);
  if (labels.length === 0) return "the shoe fiends";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
/** Mirrors server/agent/types.ts's ENEMY_RESPONSE_OPTIONS -- kept as a
 * local literal type rather than a cross-boundary import so the client
 * bundle never depends on server-only code. */
type AgentEnemyChoice = "gum_stomp" | "lace_lash" | "super_kick" | "avoid";
/** Mirrors server/agent/types.ts's PRIORITY_ACTION_OPTIONS -- see AgentEnemyChoice's
 * own comment for why this stays a local literal type instead of a shared import. */
type AgentGoal = "advance" | "collect_pickup" | "engage_enemy" | "use_dash" | "use_ultra";
/** Mirrors server/agent/types.ts's PriorityActionState.nearbyTerrain entry shape. */
type AgentTerrainHint = { kind: "gap" | "bouncePad" | "crumble"; distance: number };
type ContraptionKind = "buttonRun" | "laceLever" | "gumPress" | "spoolLift";
type GameCommand =
  | "start"
  | "restart"
  | "pause"
  | "jump"
  | "dash"
  | "specialMove"
  | "formAttack"
  | "ultra"
  | "holdLeft"
  | "holdRight"
  | "releaseLeft"
  | "releaseRight"
  | "superRun"
  | "celebrate"
  | "muteToggle"
  | "returnToTitle"
  | "quit"
  | "stopAutoRepeat";

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  mesh: Mesh;
  /** Undefined for an ordinary solid platform. "bouncePad" launches the player instead of
   * grounding them; "crumble" grounds them normally but starts a countdown to vanish. */
  special?: "bouncePad" | "crumble";
  crumbleTimer?: number;
  crumbled?: boolean;
  respawnTimer?: number;
}

interface PlayerState {
  root: TransformNode;
  x: number;
  bottom: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  hearts: number;
  /** Raised by the "heartPlus" pickup (default 3, capped at MAX_HEARTS_CAP) -- the cap
   * hearts regen against, not the current value. See collectPickup's "heartPlus" case. */
  maxHearts: number;
  /** Attempts remaining for the whole run, distinct from hearts (health within one
   * attempt) -- see checkRescue()'s WORLD_END edge branch / handleBoardFall(). Falling
   * off the world costs a life and repositions rather than ending the run outright;
   * hearts hitting 0 from combat still ends the run immediately (unchanged). */
  lives: number;
  invulnerable: number;
  jumpUsed: boolean;
  dashTimer: number;
  dashCooldown: number;
  doubleJumps: number;
  dashCharges: number;
  moonTimer: number;
  superJump: boolean;
  superJumpTimer: number;
  shoeForm: ShoeForm;
  /** Consumable Special Move inventory, oldest first -- see SpecialMoveKind's own comment.
   * A human's single Special Move key always uses index 0 (the oldest item); the agent's
   * enemyResponse choice names a specific kind and consumes the first match instead (see
   * tryUseSpecialMove). */
  specialMoveQueue: SpecialMoveKind[];
  /** One shared cooldown for Special Move regardless of which kind gets used -- matches
   * "1 button", not two independent cooldowns hiding behind it. */
  specialMoveCooldown: number;
  lashTimer: number;
  stompTimer: number;
  formAttackTimer: number;
  formAttackCooldown: number;
  formShieldTimer: number;
  ultraMove: boolean;
  ultraTimer: number;
  ultraCooldown: number;
}

interface Enemy {
  kind: EnemyKind;
  root: TransformNode;
  x: number;
  bottom: number;
  minX: number;
  maxX: number;
  speed: number;
  width: number;
  height: number;
  alive: boolean;
  phase: number;
  bossTier?: "mini" | "boss";
  bossName?: string;
  defeatTimer?: number;
  /** Moth only: baseline hover height it dives from and returns to. */
  homeBottom?: number;
  /** Moth only: seconds until it either starts or ends its next dive. */
  diveTimer?: number;
  /** Moth only: mid-dive toward the player rather than on its normal patrol. */
  diving?: boolean;
  /** Gum Turret only: an ordinary stomp cannot defeat it, only a Gum Stomp can. */
  gumArmored?: boolean;
  /** Regular (non-boss) enemies only: true once the player is within ENEMY_AGGRO_RANGE
   * and the enemy has broken from its patrol lane to chase -- see updatePatrolAndAggro(). */
  aggro?: boolean;
  /** Boss-tier only: the attack-pattern state machine layered on top of always-on chase --
   * see updateBossPattern(). Regular enemies never set this. */
  attackState?: "chase" | "windup" | "lunge" | "recover";
  attackTimer?: number;
  /** slime and gumTurret only: seconds until they can throw another projectile at the
   * player -- see throwProjectile()/updateEnemies. Undefined for every other kind, which
   * never throws. */
  throwCooldown?: number;
  /** The "dark aura" every enemy gets, regardless of kind -- see attachDarkAura. Lazily
   * attached the first time an enemy is processed in updateEnemies rather than at each of
   * the half-dozen separate createXxx() call sites, so every enemy kind (including the
   * legacy ?superrun world's own enemy list) gets one from a single place. */
  auraMesh?: Mesh;
  /** Mini-boss and true-boss only (see createMiniBoss/createTrueBoss) -- undefined for
   * every regular enemy, which still dies in one hit exactly as before. Real combat hits
   * (see damageEnemy) route through this instead of defeatEnemy directly, so a boss
   * actually requires the back-and-forth "dance around it, land a hit, retreat" the user
   * asked for rather than dropping the instant a stomp/attack connects. */
  maxHits?: number;
  /** Counts down from maxHits -- undefined until the first hit lands. */
  hitsRemaining?: number;
}

interface Projectile {
  kind: "mud" | "rock";
  root: Mesh;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Pickup {
  kind: PickupKind;
  root: TransformNode;
  /** The small sparkle-cross accent every pickup gets -- see createPickup's own comment.
   * Spins and pulses independently of the icon it sits on, animated in updatePickups. */
  glint: TransformNode;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  phase: number;
}

interface Checkpoint {
  x: number;
  activated: boolean;
  label: string;
  root: TransformNode;
}

interface Contraption {
  kind: ContraptionKind;
  root: TransformNode;
  x: number;
  activated: boolean;
  progress: number;
  parts: Mesh[];
}

interface Spark {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
  scaleRate?: number;
  rotationRate?: number;
  fade?: boolean;
}

export interface UiSnapshot {
  mode: GameMode;
  hearts: number;
  maxHearts: number;
  lives: number;
  buttons: number;
  doubleJumps: number;
  dashCharges: number;
  moonSeconds: number;
  message: string;
  checkpoint: string;
  rescued: boolean;
  superRun: boolean;
  superRunAction: string;
  superRunStage: number;
  superRunStageLabel: string;
  superRunCoverage: string;
  /** Icon-driven replacement for reading superRunAction's prose as the primary signal --
   * see setAgentActivity(). superRunAction/message are kept for accessibility text only. */
  agentActivity: AgentActivity;
  agentActivityTarget?: string;
  /** Scrolling spectator-facing log of real agent decision calls and their outcomes --
   * see GameWorld.logAgent(). Oldest first, capped to the most recent 24 entries. */
  agentLog: string[];
  levelIndex: number;
  levelCount: number;
  levelLabel: string;
  /** A brief full-screen splash banner for a form transformation or major ability
   * unlock -- empty string means no popup is currently showing. See showPickupSplash(). */
  popupText: string;
  /** Degrees -- a fresh random tilt per popup, see showPickupSplash(). */
  popupTilt: number;
  /** "pickup" (coral bubble) or "impact" (punchier comic-book onomatopoeia pop) -- see
   * showComicPop(). */
  popupVariant: "pickup" | "impact";
  /** Set only during an actual agent-driven run (?agent=...) so the HUD can show a
   * distinct chip from the scripted Super Run, which shares the same ribbon otherwise. */
  agentBackend?: string;
  agentModel?: string;
  shoeForm: ShoeForm;
  /** Ordered, oldest first -- see PlayerState.specialMoveQueue's own comment. */
  specialMoveQueue: SpecialMoveKind[];
  specialMoveReady: boolean;
  superJump: boolean;
  shoeFormAttack: string;
  formAttackReady: boolean;
  ultraMove: boolean;
  bossName: string;
  bossDefeated: boolean;
  reunionSeconds: number;
  contraptionsActivated: number;
  contraptionStatus: string;
  muted: boolean;
  /** True only for the legacy `?superrun` single-world pipeline (see SCREEN_LENGTH's own
   * comment) -- the discrete-screens rebuild doesn't have contraptions or the old 3-stage
   * readout, so GameCanvas.tsx hides both instead of showing permanently-stale "0/4". */
  isLegacyWorld: boolean;
  /** Bulk-testing harness state -- see startAutoRepeat/handleRunEnded in GameWorld.ts.
   * GameCanvas.tsx renders a running tally + stop control while active. */
  autoRepeatActive: boolean;
  autoRepeatWins: number;
  autoRepeatLosses: number;
  autoRepeatTarget: number;
}

const WORLD_END = 66;
/** How far above its look-at point the camera sits (world units) -- see updateCamera's own
 * comment for the resulting tilt angle. Kept as one named constant rather than a magic
 * number duplicated in both GameWorld.ts's per-frame updateCamera and scene.ts's
 * one-time initial camera setup (the title screen, which never calls updateCamera). */
const CAMERA_TILT_HEIGHT = 2.1;
const PLAYER_WIDTH = 1.12;
const PLAYER_HEIGHT = 1.48;
/** Discrete-screens rebuild: each of the 6 levels is now its own standalone screen,
 * disposed and rebuilt on transition rather than living all-at-once in one shared
 * x=0..66 world -- see buildScreenContent/transitionToScreen. Deliberately longer than
 * the old single world's 66 units (the length the entire 6-level game used to fit into),
 * per the explicit ask that each screen be at least as long and as content-dense as that
 * whole old world was, not a 1/6th slice of it. `?superrun`'s scripted demo keeps running
 * on the original, completely untouched single-world pipeline (see isSuperRunPreview
 * branches in createWorld/update) -- its hardcoded milestone x-values only make sense
 * against that one specific layout, so it isn't worth the risk of adapting it. */
const SCREEN_LENGTH = 72;
const STARTING_HEARTS = 3;
const MAX_HEARTS_CAP = 5;
const STARTING_LIVES = 3;
const MAX_LIVES_CAP = 6;
/** How close the player must actually be to the Left Shoe to win -- checkRescue()
 * requires a real touch here rather than just crossing an x threshold near the tower. */
const LEFT_SHOE_TOUCH_X = 1.6;
const LEFT_SHOE_TOUCH_Y = 1.4;
/** The six-level split of the existing x=0..66 world (see PLAN: "Six levels with
 * real touch-markers"). Each entry is the x a player must actually touch to advance
 * out of that level; the sixth level has no marker of its own -- it ends at the real
 * Left Shoe touch in checkRescue() instead. Boundaries are chosen to land on existing
 * narrative seams (button trail, stage transitions, pre-mini-boss) rather than mid-fight. */
const LEVEL_MARKERS: { x: number; label: string }[] = [
  { x: 10.4, label: "SHOEBOX SPRINT" },
  { x: 22.4, label: "LAUNDRY LABYRINTH" },
  { x: 34.6, label: "LACE BRIDGE CROSSING" },
  { x: 44.4, label: "ROGUE TOWER APPROACH" },
  { x: 53.4, label: "ROGUE TOWER" },
];
// 1 starting level + 5 markers = 6 levels total (each marker's label names the level
// the player is entering, not the marker itself).
// Exported for GameCanvas.tsx's route-line HUD (the six-screen replacement for the old
// single-world .stage-storyline strip, which hardcoded 4 fixed contraption names and can't
// generalize to a variable screen count) -- see the route-line-strip section of GameCanvas.tsx.
export const LEVEL_LABELS = ["BUTTON TRAIL", ...LEVEL_MARKERS.map((m) => m.label)];
const LEVEL_COUNT = LEVEL_LABELS.length;

/** One entry per discrete screen (see buildScreenContent) -- reuses LEVEL_LABELS so the
 * zone map/level badge naming stays identical to before, but each theme now drives a
 * full standalone SCREEN_LENGTH-long level instead of a slice of the old shared world.
 * groundKind/platformKinds/enemyKinds are cycled through by the generator, not placed by
 * hand -- see the existing createPlatform/create<Enemy> palettes for what each kind looks
 * like. formPickup is the one signature ability/shoe-form this screen introduces. */
interface ScreenTheme {
  label: string;
  groundKind: "cardboard" | "shoeBox" | "laundry" | "tower";
  platformKinds: ("shoeBox" | "laundry" | "tower" | "bouncePad" | "crumble")[];
  enemyKinds: EnemyKind[];
  formPickup?: PickupKind;
  abilityPickups: PickupKind[];
  miniBossName?: string;
  finalBoss?: boolean;
}
const SCREEN_THEMES: ScreenTheme[] = [
  { label: LEVEL_LABELS[0], groundKind: "cardboard", platformKinds: ["shoeBox", "bouncePad"], enemyKinds: ["lace", "slime"], formPickup: "chrome", abilityPickups: ["feather", "heart"] },
  { label: LEVEL_LABELS[1], groundKind: "shoeBox", platformKinds: ["shoeBox", "crumble"], enemyKinds: ["lace", "moth"], formPickup: "moonstep", abilityPickups: ["dash", "heart"], miniBossName: "Lace Captain" },
  { label: LEVEL_LABELS[2], groundKind: "laundry", platformKinds: ["laundry", "crumble"], enemyKinds: ["slime", "moth"], formPickup: "pump", abilityPickups: ["lash", "heart", "extraLife"] },
  { label: LEVEL_LABELS[3], groundKind: "shoeBox", platformKinds: ["shoeBox", "bouncePad"], enemyKinds: ["lace", "gumTurret"], formPickup: "hightop", abilityPickups: ["gum", "heart"], miniBossName: "Gum Marshal" },
  { label: LEVEL_LABELS[4], groundKind: "tower", platformKinds: ["tower", "crumble"], enemyKinds: ["slime", "gumTurret", "moth"], formPickup: "loafer", abilityPickups: ["superJump", "heart", "extraLife"] },
  { label: LEVEL_LABELS[5], groundKind: "tower", platformKinds: ["tower", "bouncePad"], enemyKinds: ["lace", "slime", "gumTurret"], formPickup: "sneaker", abilityPickups: ["moon", "heartPlus"], miniBossName: "Skate Sentinel", finalBoss: true },
];
/** How close the player has to get before a regular (non-boss) enemy breaks from its
 * patrol lane and chases -- see updatePatrolAndAggro(). ENEMY_LEASH is how far past its
 * own minX/maxX patrol bounds the chase is allowed to pull it before it must give up. */
const ENEMY_AGGRO_RANGE = 5.5;
const ENEMY_LEASH = 2.5;
/** Agent-run stall watchdog thresholds -- see checkAgentStall(). */
const AGENT_STALL_TIMEOUT = 9;
const AGENT_STALL_DISTANCE = 0.6;
/** See spawnMonsterNest/updateMonsterNest -- how often a live nest produces a fresh
 * enemy, and the hard cap on how many it ever produces before going quiet. */
const MONSTER_NEST_SPAWN_INTERVAL = 2.6;
const MONSTER_NEST_MAX_SPAWNS = 4;
/** See startAutoRepeat/handleRunEnded -- the bulk-testing harness stops itself the
 * instant either tally reaches this. */
const AUTO_REPEAT_TARGET = 100;
/** Thrown-projectile tuning -- see throwProjectile()/updateProjectiles(). Enemies only
 * throw at range (further than their touch/stomp reach, so a thrown attack is a real
 * complement to contact damage rather than a redundant extra hit at the same distance)
 * and never at point-blank, where a stomp or a step back is the obvious answer instead. */
const THROW_RANGE_MIN = 2.2;
const THROW_RANGE_MAX = 8;
const THROW_COOLDOWN = 3.2;
const THROW_SPEED = 9;
const MUD_COLOR = new Color3(0.32, 0.26, 0.13);
const ROCK_COLOR = new Color3(0.44, 0.44, 0.48);
/** Camera punch-in tuning -- see triggerCameraPunch/updateCamera. */
const CAMERA_PUNCH_DURATION = 0.32;
const CAMERA_PUNCH_STRENGTH = 0.12;
const RESCUE_CORAL = new Color3(1, 0.35, 0.31);
const CREAM = new Color3(1, 0.88, 0.66);
const NAVY = new Color3(0.035, 0.055, 0.13);
const TEAL = new Color3(0.05, 0.33, 0.39);
const GOLD = new Color3(1, 0.67, 0.18);
const VIOLET = new Color3(0.47, 0.25, 0.72);
const CYAN = new Color3(0.18, 0.84, 0.92);
const MOSS = new Color3(0.24, 0.63, 0.34);

export class GameWorld {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: FreeCamera;
  private readonly glow: GlowLayer;
  private readonly quality: "cinematic" | "gentle";
  /** Keyed by (diffuse, emissive) color, not by mesh/screen -- see createMaterial's own
   * comment. Live-tested: every createMaterial() call used to register a brand-new,
   * uniquely-named StandardMaterial regardless of how many other meshes already wanted
   * the exact same color, and disposing a mesh doesn't dispose its material by default.
   * With every discrete screen disposed and rebuilt fresh (up to 6x per agent run, and
   * bulk auto-repeat easily running dozens of runs unattended), that created thousands of
   * near-identical materials that were either leaked outright or -- once mesh disposal
   * was made to also dispose materials -- churned through real GPU resource allocation
   * and deallocation fast enough to trigger an actual "WebGL context lost" browser event
   * after only a handful of runs (confirmed in the console). A small, bounded, reused
   * palette (this game only ever uses a few dozen distinct colors total) fixes both:
   * near-zero net allocation after the first screen, and no per-mesh dispose needed for
   * cached materials at all -- see disposeScreen's own comment for the disposal-side half
   * of this fix. */
  private readonly materialCache = new Map<string, StandardMaterial>();
  private readonly platforms: Platform[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly checkpoints: Checkpoint[] = [];
  private readonly contraptions: Contraption[] = [];
  private readonly sparks: Spark[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly parallax: Mesh[] = [];
  private readonly held = { left: false, right: false };
  private readonly isDemo: boolean;
  private readonly isSuperRunPreview: boolean;
  private readonly isReunionPreview: boolean;
  /** Not readonly: ?agent=... sets these once at construction, but the
   * title screen's Agent Run picker (see onStartAgent) can also set them
   * later, right before a run actually starts. */
  private isAgentRun: boolean;
  private agentBackend: "ollama" | "llamacpp" | "hosted";
  private agentModel: string;
  private readonly agentRunId: string;
  /** Live-tested: sharing one pending flag/abort-controller between the goal decision
   * (requestAgentGoal) and the enemy-response decision (handleAgentEnemyDecision) meant
   * an enemy encounter almost never got a real model call -- any goal decision still in
   * flight (which, at real Ollama latency, is often) forced every enemy in that window
   * onto the scripted fallback instead, which defeats the point of watching a live model
   * play. Split into two independent tracks so both decision types can be in flight at
   * once; each still only ever runs one request of its own kind at a time. */
  private agentGoalPending = false;
  private agentEnemyPending = false;
  /** The in-flight /api/agent/decide fetch's own abort handle for each track, if any --
   * lets quit() actually cancel pending network requests instead of merely ignoring their
   * eventual results. A fresh AbortController replaces the relevant one at the start of
   * each new request of that track. */
  private agentGoalAbortController: AbortController | null = null;
  private agentEnemyAbortController: AbortController | null = null;
  /** Bulk-testing harness (see startAutoRepeat/handleRunEnded): once engaged, a finished
   * agent run immediately starts a fresh one with the same backend/model rather than
   * waiting on a click, tallying wins vs losses until either hits AUTO_REPEAT_TARGET --
   * lets real decision data accumulate at scale instead of one manually-clicked run at a
   * time. */
  private autoRepeatActive = false;
  private autoRepeatWins = 0;
  private autoRepeatLosses = 0;
  /** Maps an enemy already asked about to the server-side decision row id (once known --
   * null until the response lands, or permanently null for a locally-resolved decision,
   * see handleAgentEnemyDecision's concurrency fallback) so reportAgentOutcome() can
   * close the loop once the encounter actually resolves (see history.ts's getMemory). */
  private readonly agentAskedEnemies = new Map<Enemy, { decisionId: number | null; askedAt: number }>();
  /** The current periodic goal driving updateAgentRun's steering -- see
   * requestAgentGoal/steerByGoal. Replaces the old fixed x-threshold route script for
   * real agent runs; the scripted `?superrun` demo (updateSuperRun) never uses this. */
  private agentGoal: AgentGoal = "advance";
  /** Counts down to the next requestAgentGoal() call -- reset only once the previous
   * call resolves (success or fallback), never on a fixed wall-clock schedule, so cadence
   * naturally adapts to real model latency instead of stacking calls behind a slow one. */
  private agentGoalTimer = 0;
  /** The decisionId (if any) of the priorityAction decision currently driving agentGoal --
   * see requestAgentGoal (sets it), damagePlayer (reports "player_damaged" against it the
   * instant damage happens), and requestAgentGoal's next call (reports "avoided" for the
   * outgoing goal if it rotated naturally, i.e. without any damage in between). Mirrors
   * the enemyResponse outcome round trip (agentAskedEnemies/reportAgentOutcome) for the
   * decision type that never had one before. */
  private agentGoalDecisionId: number | null = null;
  /** Stall watchdog: if the player hasn't advanced by STALL_DISTANCE within
   * STALL_TIMEOUT seconds, updateAgentRun nudges progress deterministically (see
   * checkAgentStall) rather than leaving a free-choosing agent stuck at a gated lane. */
  private agentStallTimer = 0;
  private agentStallX = 0;
  /** Same idea as agentStallTimer/agentStallX, much blunter -- the scripted demo has no
   * decision loop to retry from, so a stall here (see checkSuperRunStall) just forces its
   * way past whatever's blocking rather than nudging and re-evaluating. Exists because a
   * few real ones turned up this session (a Gum Turret with no charge left in storage, an
   * unresolved edge case likely still lurking somewhere else) and each one meant an
   * indefinite freeze with no self-recovery -- this is the backstop so a future one doesn't. */
  private superRunStallTimer = 0;
  private superRunStallX = 0;
  /** Consecutive stall triggers at (roughly) the same spot -- resets the moment real
   * progress happens. One stall gets the existing nudge (nearby aggro); a second stall
   * without ever having moved on escalates to spawnMonsterNest() instead of nudging
   * forever with no real pressure increase. */
  private agentStallStrikes = 0;
  private agentNest: { root: TransformNode; x: number; bottom: number; spawnTimer: number; spawned: number } | null = null;
  private agentLastNearbyCount = 0;
  /** A bounded scrolling log of real agent decision calls and their outcomes -- see
   * logAgent() -- surfaced in the HUD (UiSnapshot.agentLog) as a spectator-facing readout
   * of what the model is actually being asked and answering, distinct from the
   * icon-first agentActivity status which only ever shows the current moment. */
  private readonly agentLog: string[] = [];
  /** Guards the in-flight /api/agent/decide fetch's .then() callback --
   * the first async work this class has ever had. Every prior update path
   * was synchronous, so React unmounting mid-frame was never a concern;
   * now a pending decision can resolve after dispose() has already torn
   * down the scene, and applyAgentEnemyChoice must not touch Babylon
   * objects at that point. */
  private disposed = false;
  private readonly audio = new AudioDirector();
  /** Wall-clock start of the current attempt, in ms (Date.now()). Set fresh every time a
   * run actually begins (start() for a human run, startSuperRun() for the scripted demo
   * and, via startAgentRun() calling it, a live agent run too) and read once at the win
   * transition in checkRescue() to compute the completion time posted to /api/runs/complete. */
  private runStartedAt = 0;
  private player: PlayerState;
  private mode: GameMode = "title";
  private buttons = 0;
  /** Total enemies defeated this run -- see defeatEnemy(). Only exists for the checkpoint
   * status recap (see updateCheckpoints); nothing else currently reads it. */
  private enemiesDefeated = 0;
  private message = "Lace up. The rescue starts now.";
  private activeCheckpoint = "Bedroom Threshold";
  /** The x updateCheckpoints() keeps in sync with activeCheckpoint -- where damagePlayer()
   * respawns to on losing a life (hearts hit 0) rather than ending the run outright. Falling
   * out of bounds is the only thing that drops a screen (see handleBoardFall); losing a
   * life from combat damage respawns within the same screen instead. */
  private activeCheckpointX = 0;
  private demoJumpTimer = 0;
  private superRun = false;
  private superRunAction = "AI standing by.";
  private superRunKickTimer = 0;
  private superRunPauseTimer = 0;
  private cameraKickTimer = 0;
  private cameraKickStrength = 0;
  private superRunStage = 0;
  private superRunStageLabel = "STANDBY";
  /** 1-indexed into LEVEL_LABELS; advances when the player touches a level marker
   * (see updateLevelMarkers()) or, for the final level, when checkRescue() wins. */
  private levelIndex = 1;
  private readonly levelMarkerMeshes: { x: number; touched: boolean; root: TransformNode }[] = [];
  /** The x every shared, mode-agnostic system (updatePlayer's boss wall/edge clamp,
   * checkRescue, updateCamera, handleBoardFall) treats as "the end of the playable
   * world" -- WORLD_END (66) for the legacy single-world `?superrun` pipeline, or the
   * current screen's own length for the discrete-screens system (see buildScreenContent/
   * transitionToScreen, which keep this in sync). Never read WORLD_END directly from a
   * function that also has to work for both pipelines -- read this instead. */
  private worldEnd = WORLD_END;
  /** 1-indexed into SCREEN_THEMES -- which discrete screen is currently built. Only
   * meaningful outside the legacy `?superrun` pipeline; stays 1 there. */
  private currentScreen = 1;
  private screenExitMarker: { root: TransformNode; touched: boolean } | null = null;
  private agentActivity: AgentActivity = "idle";
  private agentActivityTarget = "";
  /** A brief full-screen splash banner (see showPickupSplash/collectPickup and
   * GameCanvas.tsx's .pickup-splash) for form transformations and major ability
   * unlocks -- the sparks + small mission-panel message alone were easy to miss. */
  private popupText = "";
  private popupTimer = 0;
  /** A fresh random tilt (degrees) picked each time showPickupSplash() fires, so
   * consecutive splashes don't all pop in at the exact same angle -- computed once here
   * rather than in React so it stays fixed for the popup's whole lifetime instead of
   * jittering on every re-render. See GameCanvas.tsx's --tilt custom property. */
  private popupTilt = 0;
  /** "pickup" (the existing coral bubble) vs "impact" (a punchier comic-book onomatopoeia
   * pop -- see showComicPop/GameCanvas.tsx's .pickup-splash--impact) for the biggest
   * combat beats: a stomp landing, Lace Lash connecting, Gum Stomp connecting, Ultra
   * Move, a boss going down. Same popup mechanism, different flavor. */
  private popupVariant: "pickup" | "impact" = "pickup";
  /** A brief true freeze-frame (not just slow-mo) on the biggest hits -- see
   * triggerHitStop/update(). The signature "make it feel like it actually landed" beat
   * from Viewtiful Joe-style action games. */
  private hitStopTimer = 0;
  /** A momentary camera punch-in on the very biggest beats (Ultra Move, a boss going
   * down) -- see triggerCameraPunch/updateCamera. cameraZoomBase is captured once at the
   * start of a punch (assumed stable for its short lifetime) so the effect can ease back
   * out to exactly where scene.ts's own resize handler left the ortho bounds. */
  private cameraZoomTimer = 0;
  private cameraZoomBase: { top: number; bottom: number; left: number; right: number } | null = null;
  private readonly superRunMilestones = new Set<string>();
  private bossDefeated = false;
  private reunionTimer = 0;
  private lastUiSignature = "";
  private titleTime = 0;
  private leftShoe: TransformNode | null = null;
  private leftShoeHalo: Mesh | null = null;
  /** The resting height updateDecor's dance-bob animation oscillates around -- set
   * alongside leftShoe.position.y in createRescueDome() so the bob still centers on
   * wherever the finale platform actually put the shoe, not a hardcoded legacy value. */
  private leftShoeBaseY = 3.95;
  private heroSprite: Mesh | null = null;
  private heroHalo: Mesh | null = null;
  private onKeyDownBound = (event: KeyboardEvent) => this.onKeyDown(event);
  private onKeyUpBound = (event: KeyboardEvent) => this.onKeyUp(event);
  private onCommandBound = (event: Event) => this.onCommand(event as CustomEvent<GameCommand>);
  /** Separate from the plain-string command bus above because this one
   * carries a payload (which model to drive the run) rather than just a
   * command name -- see GameCanvas.tsx's Agent Run picker. */
  private onStartAgentBound = (event: Event) =>
    this.onStartAgent(event as CustomEvent<{ backend: "ollama"; model: string; auto?: boolean }>);

  constructor(scene: Scene, canvas: HTMLCanvasElement, camera: FreeCamera, glow: GlowLayer) {
    this.scene = scene;
    this.canvas = canvas;
    this.camera = camera;
    this.glow = glow;
    this.quality = window.innerWidth < 760 ? "gentle" : "cinematic";
    const query = new URLSearchParams(window.location.search);
    this.isDemo = query.has("demo");
    this.isSuperRunPreview = query.has("superrun");
    this.isReunionPreview = query.has("dance");
    // ?agent=<ollama|llamacpp|hosted>&model=<name> -- the Strategic
    // Director run. Same query-param convention as the showcase modes
    // above; see GameWorld.ts's updateAgentRun for what it actually does.
    const agentParam = query.get("agent");
    this.isAgentRun = agentParam === "ollama" || agentParam === "llamacpp" || agentParam === "hosted";
    this.agentBackend = (agentParam as "ollama" | "llamacpp" | "hosted" | null) ?? "ollama";
    this.agentModel = query.get("model") ?? "llama3.2:latest";
    this.agentRunId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}`;
    // ?autoRepeat=1 alongside ?agent/?model -- see startAutoRepeat's own comment. Read
    // here (not just from the picker's UI event) so a context-loss auto-reload (below)
    // can land back on a URL that resumes the same bulk-testing batch on its own,
    // without needing a person to notice and re-click "REPEAT" every time.
    if (this.isAgentRun && query.has("autoRepeat")) {
      this.autoRepeatActive = true;
      this.autoRepeatWins = 0;
      this.autoRepeatLosses = 0;
    }
    this.player = this.createPlayer();
    this.createWorld();
    this.bindInput();
    if (this.isSuperRunPreview) this.startSuperRun();
    else if (this.isAgentRun) this.startAgentRun();
    else if (this.isReunionPreview) this.previewReunion();
    else this.publishUi(true);

    // Live-tested (repeatedly, over long bulk-testing sessions): the WebGL context can be
    // lost outright -- game logic (decisions, physics) keeps running normally, but nothing
    // renders, and Babylon doesn't always get a browser-level restore event to recover on
    // its own. Rather than sit blank indefinitely (previously required someone to notice
    // and manually reload), self-heal: reload the page. If the URL still carries ?agent/
    // ?model/?autoRepeat (see startAutoRepeat), the batch resumes itself on the other
    // side with no one watching -- the whole point of an unattended bulk-testing run.
    this.scene.getEngine().onContextLostObservable.add(() => {
      window.setTimeout(() => window.location.reload(), 500);
    });

    this.scene.onBeforeRenderObservable.add(() => {
      const delta = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
      this.update(delta);
    });
  }

  dispose() {
    this.disposed = true;
    if (this.agentGoalAbortController) {
      this.agentGoalAbortController.abort();
      this.agentGoalAbortController = null;
    }
    if (this.agentEnemyAbortController) {
      this.agentEnemyAbortController.abort();
      this.agentEnemyAbortController = null;
    }
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    window.removeEventListener("shoe-adventure:command", this.onCommandBound);
    window.removeEventListener("shoe-adventure:startAgent", this.onStartAgentBound);
    this.audio.stopMusic();
    this.sparks.forEach((spark) => spark.mesh.dispose());
    this.projectiles.forEach((projectile) => projectile.root.dispose());
  }

  private createWorld() {
    this.scene.clearColor = new Color4(0.025, 0.035, 0.105, 0);
    this.scene.ambientColor = new Color3(0.3, 0.34, 0.48);
    this.configureLights();
    this.createBackdrop();
    if (this.isSuperRunPreview) {
      // The scripted `?superrun` demo's every milestone (updateSuperRun) is a hardcoded
      // x against this exact original single-world layout -- see SCREEN_LENGTH's own
      // comment for why the discrete-screens rebuild below doesn't touch it at all.
      this.createLevelGeometry();
      this.createContraptions();
      this.createEnemies();
      this.createPickups();
      this.createCheckpoints();
      this.createLevelMarkers();
      this.createRescueDome();
      this.createForegroundDetails();
      this.auditBossGates();
    } else {
      this.buildScreenContent(1);
    }
  }

  /** Disposes every dynamic entity the current screen owns before a new one is built --
   * see buildScreenContent/transitionToScreen. Platform decoration (bounce-pad ring,
   * caution tape) is parented to its platform's own mesh (see createPlatform) so
   * disposing that one mesh cascades instead of leaking it. */
  /** Only disposes meshes, deliberately not materials -- see materialCache's own comment
   * for why. Every material created here comes from the shared, color-keyed cache, so
   * disposing it alongside one mesh instance would corrupt every other mesh (in this
   * screen or a future one) still relying on that same cached material. */
  private disposeScreen() {
    this.platforms.forEach((platform) => platform.mesh.dispose());
    this.platforms.length = 0;
    this.enemies.forEach((enemy) => enemy.root.dispose());
    this.enemies.length = 0;
    this.pickups.forEach((pickup) => pickup.root.dispose());
    this.pickups.length = 0;
    this.contraptions.forEach((contraption) => contraption.root.dispose());
    this.contraptions.length = 0;
    this.checkpoints.forEach((checkpoint) => checkpoint.root.dispose());
    this.checkpoints.length = 0;
    if (this.screenExitMarker) {
      this.screenExitMarker.root.dispose();
      this.screenExitMarker = null;
    }
    if (this.leftShoe) {
      this.leftShoe.dispose();
      this.leftShoe = null;
    }
    if (this.leftShoeHalo) {
      this.leftShoeHalo.dispose();
      this.leftShoeHalo = null;
    }
    this.projectiles.forEach((projectile) => projectile.root.dispose());
    this.projectiles.length = 0;
    this.flushPendingEnemyOutcomes();
    this.despawnMonsterNest();
  }

  /** Builds one full discrete screen from SCREEN_THEMES[index-1] -- platforms, enemies,
   * and pickups laid out by a repeating pattern generator (not hand-placed) across the
   * screen's own 0..SCREEN_LENGTH space, at least as long and as content-dense as the
   * original single world was across its own 66 units. The final screen additionally
   * gets the true boss, rescue dome, and Left Shoe -- reusing the exact same
   * createTrueBoss/createRescueDome/createMiniBoss/createGumTurret functions the
   * original single world used, just repositioned onto this screen's own final platform
   * instead of hardcoded world coordinates. Every other screen ends in a touchable exit
   * archway (same visual as the original's level markers) that advances to the next. */
  private buildScreenContent(index: number) {
    this.disposeScreen();
    this.currentScreen = index;
    this.levelIndex = index;
    this.worldEnd = SCREEN_LENGTH;
    const theme = SCREEN_THEMES[index - 1];

    // Two checkpoints per screen -- losing a life (hearts hit 0, see damagePlayer)
    // respawns here rather than ending the run or dropping a screen; only falling out of
    // bounds does that (see handleBoardFall). Reset first: a new screen's checkpoint
    // always starts at this screen's own x=0, never a stale x from the previous screen.
    this.activeCheckpoint = theme.label;
    this.activeCheckpointX = 0;
    this.checkpoints.push(this.createCheckpoint(SCREEN_LENGTH * 0.33, `${theme.label} — First Stretch`));
    this.checkpoints.push(this.createCheckpoint(SCREEN_LENGTH * 0.66, `${theme.label} — Second Stretch`));

    // Ground: four overlapping cardboard strips, continuous coverage across the whole
    // screen (mirrors createLevelGeometry's four-strip floor, just spread to fill
    // SCREEN_LENGTH instead of the old world's 66 units).
    const stripWidth = SCREEN_LENGTH / 3.4;
    for (let i = 0; i < 4; i += 1) {
      const gx = stripWidth * 0.42 + i * (SCREEN_LENGTH - stripWidth * 0.7) / 3;
      this.createPlatform(gx, -4.7, stripWidth, 1.0, "cardboard");
    }

    // Floating platforms: intentfully random, not the fixed sine-wave zigzag this used to
    // be (identical shape every single screen, every single run). Each step is a real
    // roll between climbing, descending, or holding flat for a breather -- never more
    // than two flat steps in a row, so the screen doesn't go dead -- sized and spaced to
    // always stay within tryJump's real reach (vy=8.25 clears ~1.58 units of rise; ~6.4
    // units/s horizontal speed gives a full jump arc ~4.9 units long), so "random" never
    // means "occasionally impossible."
    const platformXs: number[] = [];
    const platformYs: number[] = [];
    let py = -3.5;
    let px = 6.5;
    let flatRun = 0;
    let i = 0;
    while (px <= SCREEN_LENGTH - 6) {
      const roll = Math.random();
      let climb: number;
      if (flatRun < 2 && roll < 0.22) {
        climb = 0;
        flatRun += 1;
      } else {
        flatRun = 0;
        // Widened from 0.5-1.25 to 0.6-1.5, and the ceiling below raised from 3.4 to 4.6 --
        // "a lot of platforms on the ground or close to the ground with not a lot of
        // variety... this is an exploration game before a battle game" (the user, citing
        // Mario/Sonic/Dora). More headroom for a genuinely taller main path, on top of the
        // dedicated upper-path branch below.
        climb = (roll < 0.6 ? 1 : -1) * (0.6 + Math.random() * 0.9);
      }
      py = Math.max(-4.0, Math.min(4.6, py + climb));
      // A real shortcut on a big upward step -- matches the original hand-built world's
      // own "bounce pad = faster route up" intent -- rather than every kind purely
      // cycling in a fixed rotation regardless of what the step actually calls for.
      const kind = climb > 1.0 && theme.platformKinds.includes("bouncePad") ? "bouncePad" : theme.platformKinds[i % theme.platformKinds.length];
      const width = 3.0 + Math.random() * 1.4;
      this.createPlatform(px, py, width, 0.8, kind);
      platformXs.push(px);
      platformYs.push(py);
      px += 4.4 + Math.random() * 0.9; // 4.4-5.3, varied but always within jump range
      i += 1;
    }

    // Upper-path branch: a genuine "climb up here for something" detour, entirely
    // optional -- there's no time limit, so a taller side route earns its keep by being
    // worth finding, not by being mandatory. Steps off an existing mid-screen platform,
    // climbs 2-3 more platforms above the main path to a real peak, holds a bonus pickup
    // there, and simply ends -- no forced landing platform back down, the same "drop back
    // into the open air below" shape Mario's classic bonus-alcove climbs use. One branch
    // per screen; roughly a third of the way through so it reads as a real fork, not a
    // tacked-on extra step at the very end.
    if (platformXs.length >= 5) {
      const branchStart = Math.floor(platformXs.length * (0.3 + Math.random() * 0.25));
      let bx = platformXs[branchStart];
      let by = platformYs[branchStart];
      const branchSteps = 2 + Math.floor(Math.random() * 2); // 2-3
      for (let step = 0; step < branchSteps; step += 1) {
        bx += 2.6 + Math.random() * 0.8;
        // Capped at 1.0-1.5 rise per step, safely under tryJump's ~1.58-unit real ceiling
        // (see the main loop's own comment on that number) -- a branch step being
        // unreachable would be a much worse failure than a slightly gentler climb.
        by = Math.min(6.8, by + 1.0 + Math.random() * 0.5);
        const isPeak = step === branchSteps - 1;
        this.createPlatform(bx, by, isPeak ? 2.4 : 2.0, 0.7, theme.platformKinds[0]);
        if (isPeak) this.pickups.push(this.createPickup("bonus", bx, by + 1.1));
      }
    }

    // Enemies: cycle through the theme's enemy pool at roughly one every ~5 units,
    // alternating ground height and platform height so both lanes carry real threats
    // (matches the original world's mix of ground-level and platform-level placements).
    let enemyIndex = 0;
    for (let x = 9; x < SCREEN_LENGTH - 10; x += 5.1) {
      const kind = theme.enemyKinds[enemyIndex % theme.enemyKinds.length];
      const onPlatform = enemyIndex % 2 === 0;
      const bottom = onPlatform ? platformXs.length ? -3.0 + Math.sin(enemyIndex) * 1.6 : -4.2 : -4.2;
      if (kind === "moth") this.enemies.push(this.createMoth(x, Math.max(-3.6, bottom + 1.2), x - 1.6, x + 1.6));
      else if (kind === "slime") this.enemies.push(this.createSlime(x, bottom, x - 1.4, x + 1.4));
      else if (kind === "gumTurret") this.enemies.push(this.createGumTurret(x, bottom));
      else this.enemies.push(this.createLaceGoblin(x, bottom, x - 1.6, x + 1.6));
      enemyIndex += 1;
    }

    // Mini-boss checkpoint fight, roughly 65% through the screen, on solid ground.
    if (theme.miniBossName) {
      const bossX = SCREEN_LENGTH * 0.65;
      this.enemies.push(this.createMiniBoss(bossX, -4.2, bossX - 1.8, bossX + 1.8, theme.miniBossName));
    }

    // Pickups: the screen's signature form/ability once each, buttons for score spread
    // throughout, a heart roughly at the midpoint, and (final screen only) the Ultra
    // Move core + a Heart+ Sole staged before the boss gate -- see collectPickup's
    // "heartPlus" case and auditBossGates, which requires an "ultra" pickup positioned
    // before any boss-tier enemy or this screen would be unwinnable by design.
    if (theme.formPickup) this.pickups.push(this.createPickup(theme.formPickup, SCREEN_LENGTH * 0.32, -2.4));
    theme.abilityPickups.forEach((kind, i) => {
      this.pickups.push(this.createPickup(kind, SCREEN_LENGTH * (0.18 + i * 0.22), -2.8 + i * 0.6));
    });
    for (let x = 4; x < SCREEN_LENGTH - 6; x += 6.4) {
      this.pickups.push(this.createPickup("button", x, -4.1 + (Math.floor(x) % 3) * 0.22));
    }

    if (theme.finalBoss) {
      // Same final stretch shape the original world used: a shoeBox platform (boss
      // stands here) immediately before a taller tower platform (Left Shoe's dome),
      // with the Ultra Move core and a Heart+ Sole staged on the approach.
      const gateX = SCREEN_LENGTH - 13;
      this.pickups.push(this.createPickup("ultra", gateX - 1.3, -2.5));
      this.pickups.push(this.createPickup("heartPlus", gateX + 3.5, 2.7));
      this.createPlatform(gateX + 5, 2.0, 3.2, 0.8, "shoeBox");
      const towerX = gateX + 9.2;
      this.createPlatform(towerX, 3.1, 5.2, 0.8, "tower");
      this.enemies.push(this.createGumTurret(gateX + 6.8, 2.4));
      this.enemies.push(this.createTrueBoss(gateX + 6.55, 2.4, gateX + 5.8, gateX + 7.05));
      this.createRescueDome(towerX, 3.68);
      this.auditBossGates();
    } else {
      // A full-height gate, not a short doorway: updateScreenExit()'s own touch check is
      // already purely x-based (crossable at any height the platform generator can put a
      // player at), but the old ~3.2-unit-tall archway only visually read that way near
      // ground level -- a player up on a high platform (generator reaches +3.4) would
      // cross the exit x while towering over what looked like a small door well below
      // them. Live-tested observation: that reads as unreachable even though it isn't.
      // The posts and glowing field now span ground to past the generator's max height.
      const exitX = SCREEN_LENGTH - 4;
      const gateHeight = 9.2;
      const root = new TransformNode(`screenExit-${index}`, this.scene);
      const leftPost = MeshBuilder.CreateCylinder(`screenExitPostL-${index}`, { height: gateHeight, diameter: 0.18, tessellation: 12 }, this.scene);
      leftPost.parent = root;
      leftPost.position = new Vector3(-1.1, gateHeight / 2, 0);
      const postMat = this.createMaterial(`screenExitPostMat-${index}`, GOLD, new Color3(0.5, 0.16, 0.01));
      leftPost.material = postMat;
      const rightPost = MeshBuilder.CreateCylinder(`screenExitPostR-${index}`, { height: gateHeight, diameter: 0.18, tessellation: 12 }, this.scene);
      rightPost.parent = root;
      rightPost.position = new Vector3(1.1, gateHeight / 2, 0);
      rightPost.material = postMat;
      const field = MeshBuilder.CreatePlane(`screenExitField-${index}`, { width: 2.2, height: gateHeight }, this.scene);
      field.parent = root;
      field.position = new Vector3(0, gateHeight / 2, 0.02);
      const fieldMat = this.createMaterial(`screenExitFieldMat-${index}`, RESCUE_CORAL, GOLD);
      fieldMat.alpha = 0.14;
      fieldMat.backFaceCulling = false;
      field.material = fieldMat;
      field.isPickable = false;
      const arch = MeshBuilder.CreateTorus(`screenExitArch-${index}`, { diameter: 2.35, thickness: 0.14, tessellation: 24 }, this.scene);
      arch.parent = root;
      arch.position = new Vector3(0, gateHeight, 0);
      arch.scaling = new Vector3(1, 0.55, 1);
      arch.material = this.createMaterial(`screenExitArchMat-${index}`, RESCUE_CORAL, GOLD);
      root.position = new Vector3(exitX, -4.2, -0.1);
      this.screenExitMarker = { root, touched: false };
    }
  }

  /** Advances to the next screen -- called when the current screen's exit archway is
   * touched, or (level 1 case) when handleBoardFall() sends the player back to restart
   * the current screen. Hearts/lives/score/abilities/shoeForm all carry over untouched;
   * only the world itself (platforms/enemies/pickups) and the player's position reset. */
  private transitionToScreen(index: number) {
    this.buildScreenContent(index);
    this.player.x = 0;
    this.player.bottom = -4.2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.invulnerable = 1.2;
    this.held.left = false;
    if (this.isAgentRun) this.held.right = true;
    this.camera.position.x = 0;
    this.camera.position.y = -0.55;
    this.camera.setTarget(new Vector3(1.2, -0.4, 0));
    this.triggerHitStop(0.15);
    this.showComicPop(`LEVEL ${index}!`);
    this.message = `Level ${index}/${LEVEL_COUNT}: ${SCREEN_THEMES[index - 1].label}.`;
    if (this.isAgentRun) this.logAgent(`◎ entered level ${index}/${LEVEL_COUNT}: ${SCREEN_THEMES[index - 1].label}`);
    this.setAgentActivity(index === LEVEL_COUNT ? "targeting" : "advancing", SCREEN_THEMES[index - 1].label);
    this.publishUi(true);
  }

  /** Touching the current screen's exit archway -- the discrete-screens equivalent of
   * the old updateLevelMarkers(). Only runs outside the legacy `?superrun` pipeline
   * (isSuperRunPreview never builds a screenExitMarker at all). */
  private updateScreenExit() {
    if (!this.screenExitMarker || this.screenExitMarker.touched || this.mode !== "playing") return;
    if (this.player.x < SCREEN_LENGTH - 4) return;
    this.screenExitMarker.touched = true;
    this.transitionToScreen(this.currentScreen + 1);
  }

  /** Dev-time regression guard, not a full reachability check: live-tested, a free-
   * choosing Agent Run reliably rushed straight through to the boss gate without ever
   * detouring for the Ultra Move pickup -- the *only* thing that can defeat a boss-tier
   * enemy (see updateAgentRun's boss-tier branch and checkRescue's bossAlive gate, which
   * has no other path to bossDefeated). That's a structural dead end, not a fair
   * difficulty check, since nothing else in the level can substitute for it. The actual
   * fix is checkRescue's auto-grant safety net (search "structural dead end" in this
   * file) -- this audit exists only to catch the *related* regression where a future
   * edit moves, removes, or forgets a hard-counter pickup for a boss-tier enemy, since
   * that class of mistake is otherwise silent until someone happens to watch a run fail
   * against the world's edge. If you add a new boss-tier enemy or a new hard-gated
   * ability, extend this rather than deleting it. */
  private auditBossGates() {
    const bosses = this.enemies.filter((enemy) => enemy.bossTier === "boss");
    for (const boss of bosses) {
      const counterPickup = this.pickups.find((pickup) => pickup.kind === "ultra" && pickup.x < boss.x);
      if (!counterPickup) {
        console.error(
          `[level audit] "${boss.bossName ?? boss.kind}" (boss-tier, x=${boss.x}) has no "ultra" pickup positioned before it -- ` +
            `checkRescue()'s bossAlive gate has no other path to defeating a boss-tier enemy, so this level is currently unwinnable ` +
            `by any agent or player who reaches the gate. Add or reposition the Ultra Move pickup before x=${boss.x}.`,
        );
      }
    }
  }

  private configureLights() {
    // Both bumped again, and groundColor (light on faces turned away from the key light)
    // raised from a near-black 0.13/0.065/0.11 -- that alone made every shadowed surface
    // read as muddy night rather than a lit evening scene. See scene.ts's clearColor and
    // index.css's background tokens for the rest of the same lightening pass.
    const sky = new HemisphericLight("twilightSky", new Vector3(0, 1, -0.2), this.scene);
    sky.intensity = 1.32;
    sky.diffuse = new Color3(0.52, 0.68, 0.96);
    sky.groundColor = new Color3(0.3, 0.22, 0.32);

    const key = new DirectionalLight("warmKey", new Vector3(-0.35, -1, -0.55), this.scene);
    key.position = new Vector3(22, 11, -13);
    key.intensity = 1.85;
    key.diffuse = new Color3(1, 0.76, 0.52);

    // rescueLamp/moonRim were tuned as fixed accent pools for one specific 66-unit world
    // where the player only ever passed x=58/x=20 once. Every discrete screen now spans
    // a similar range independently (see SCREEN_LENGTH), so most of any given screen used
    // to sit outside both lights' old range (17/20) with only the two uniform lights above
    // to fall back on -- live-tested, platforms read as visibly flat/undersaturated there.
    // Widened range so both accents reach across a full screen from their same positions
    // (unchanged, so the legacy `?superrun` world keeps the same warm/cool character);
    // sky/key's own boost above is the real fix for full, uniform coverage regardless of
    // position.
    const lamp = new PointLight("rescueLamp", new Vector3(58, 6.2, -4), this.scene);
    lamp.diffuse = new Color3(1, 0.42, 0.29);
    lamp.intensity = this.quality === "cinematic" ? 9.5 : 6.2;
    lamp.range = 50;

    const rim = new PointLight("moonRim", new Vector3(20, 5.4, 3), this.scene);
    rim.diffuse = new Color3(0.2, 0.7, 0.95);
    rim.intensity = 5;
    rim.range = 50;
  }

  private createBackdrop() {
    const moon = MeshBuilder.CreateDisc("windowMoon", { radius: 1.15, tessellation: 40 }, this.scene);
    moon.position = new Vector3(-4.2, 5.3, 5.2);
    moon.material = this.createMaterial("windowMoonMat", new Color3(0.65, 0.88, 1), new Color3(0.19, 0.38, 0.72), true, true);
    this.parallax.push(moon);

    for (let index = 0; index < 10; index += 1) {
      const star = MeshBuilder.CreateDisc(`paperStar${index}`, { radius: 0.05 + (index % 3) * 0.025, tessellation: 12 }, this.scene);
      star.position = new Vector3(-8 + index * 5.6, 3 + ((index * 7) % 4), 6.2);
      star.material = this.createMaterial(`paperStarMat${index}`, CREAM, GOLD, true, true);
      this.parallax.push(star);
    }

    const rug = MeshBuilder.CreateBox("softRug", { width: 80, height: 0.12, depth: 3.6 }, this.scene);
    rug.position = new Vector3(31, -5.14, 1.7);
    rug.material = this.createMaterial("rugMat", new Color3(0.11, 0.28, 0.3), new Color3(0.02, 0.06, 0.08), true, true);
    rug.isPickable = false;
  }

  private createLevelGeometry() {
    this.createPlatform(4, -4.7, 17.5, 1.0, "cardboard");
    this.createPlatform(20.5, -4.7, 17.5, 1.0, "cardboard");
    this.createPlatform(38, -4.7, 17.5, 1.0, "cardboard");
    this.createPlatform(56, -4.7, 18, 1.0, "cardboard");

    // Bounce pad: an alternate, faster route up onto the Stage 1 shoebox lip.
    this.createPlatform(12.6, -4.05, 2.1, 0.5, "bouncePad");
    this.createPlatform(15.8, -3.2, 4.6, 0.8, "shoeBox");
    this.createPlatform(21.8, -1.65, 4.1, 0.8, "shoeBox");
    // Two crumble platforms across the Stage 2 laundry lane, both reachable stepping
    // stones rather than the only path through, so a mistimed crumble never strands you.
    this.createPlatform(25.1, -2.2, 2.6, 0.6, "crumble");
    this.createPlatform(28.4, -2.85, 5.1, 0.8, "laundry");
    this.createPlatform(31.6, -1.85, 2.6, 0.6, "crumble");
    this.createLaceBridge(34.4, -1.25, 5.4);
    this.createPlatform(41.7, -0.15, 4.4, 0.8, "shoeBox");
    this.createPlatform(47.4, -1.6, 4.2, 0.8, "shoeBox");
    this.createPlatform(52.8, 0.9, 4.3, 0.8, "shoeBox");
    this.createPlatform(58.1, 2.0, 3.2, 0.8, "shoeBox");
    this.createPlatform(62.4, 3.1, 5.2, 0.8, "tower");

    const spool = MeshBuilder.CreateCylinder("laceSpool", { height: 1.4, diameter: 1.25, tessellation: 24 }, this.scene);
    spool.position = new Vector3(7.8, -3.5, 0.6);
    spool.rotation.z = Math.PI / 2;
    spool.material = this.createMaterial("laceSpoolMat", CREAM, new Color3(0.18, 0.08, 0.04));
    const spoolRibbon = MeshBuilder.CreateTorus("spoolRibbon", { diameter: 1.28, thickness: 0.16, tessellation: 24 }, this.scene);
    spoolRibbon.position = new Vector3(7.8, -3.5, -0.12);
    spoolRibbon.rotation.x = Math.PI / 2;
    spoolRibbon.material = this.createMaterial("spoolRibbonMat", RESCUE_CORAL, new Color3(0.45, 0.05, 0.02));
  }

  private createPlatform(x: number, y: number, width: number, height: number, kind: "cardboard" | "shoeBox" | "laundry" | "tower" | "bouncePad" | "crumble"): Platform {
    const mesh = MeshBuilder.CreateBox(`platform-${kind}-${x}`, { width, height, depth: 1.45 }, this.scene);
    mesh.position = new Vector3(x, y, 0.9);
    mesh.isPickable = false;

    const palette = {
      cardboard: new Color3(0.45, 0.25, 0.12),
      shoeBox: new Color3(0.66, 0.38, 0.18),
      laundry: new Color3(0.18, 0.43, 0.53),
      tower: new Color3(0.55, 0.19, 0.16),
      bouncePad: new Color3(0.28, 0.78, 0.9),
      crumble: new Color3(0.56, 0.44, 0.28),
    } as const;
    const material = this.createMaterial(`platformMat-${kind}-${x}`, palette[kind], kind === "bouncePad" ? palette[kind].scale(0.55) : palette[kind].scale(0.16));
    material.specularColor = new Color3(0.35, 0.21, 0.1);
    if (kind === "crumble") material.alpha = 0.88;
    mesh.material = material;

    if (kind === "bouncePad") {
      // A glowing ring on top signals "this one launches you" before the player lands.
      // Parented to mesh (position now relative, not world-space) so disposing the
      // platform's mesh -- see disposeScreen() -- cascades to this instead of leaking an
      // orphaned, untracked mesh behind on every discrete-screen transition.
      const ring = MeshBuilder.CreateTorus(`bouncePadRing-${x}`, { diameter: width * 0.7, thickness: 0.07, tessellation: 24 }, this.scene);
      ring.parent = mesh;
      ring.position = new Vector3(0, height / 2 + 0.03, 0);
      ring.rotation.x = Math.PI / 2;
      ring.material = this.createMaterial(`bouncePadRingMat-${x}`, CYAN, CYAN);
      ring.isPickable = false;
    } else {
      const tape = MeshBuilder.CreateBox(`tape-${x}`, { width: Math.max(0.55, width * 0.22), height: 0.055, depth: 1.49 }, this.scene);
      tape.parent = mesh;
      tape.position = new Vector3(width * 0.08, height / 2 + 0.03, 0);
      tape.material = this.createMaterial(`tapeMat-${x}`, kind === "crumble" ? new Color3(0.8, 0.72, 0.56) : CREAM, new Color3(0.13, 0.08, 0.03));
      tape.isPickable = false;
    }

    const special = kind === "bouncePad" || kind === "crumble" ? kind : undefined;
    return this.addPlatform(x, y, width, height, mesh, special);
  }

  private createContraptions() {
    this.createButtonBallRun(11.2, -3.95);
    this.createLaceLever(42.4, 0.25);
    this.createGumPress(55.2, 2.15);
    this.createSpoolLift(59.4, 3.15);
  }

  private createButtonBallRun(x: number, y: number) {
    const root = new TransformNode("buttonBallRun", this.scene);
    root.position = new Vector3(x, y, -0.3);
    const track = MeshBuilder.CreateBox("buttonBallTrack", { width: 3.15, height: 0.18, depth: 0.42 }, this.scene);
    track.parent = root;
    track.position = new Vector3(0, 0.48, 0);
    track.rotation.z = -0.13;
    track.material = this.createMaterial("buttonBallTrackMat", new Color3(0.58, 0.31, 0.13), new Color3(0.12, 0.045, 0.01));
    const ball = MeshBuilder.CreateSphere("coralButtonBall", { diameter: 0.44, segments: 18 }, this.scene);
    ball.parent = root;
    ball.position = new Vector3(-1.18, 0.72, -0.16);
    ball.material = this.createMaterial("coralButtonBallMat", RESCUE_CORAL, GOLD);
    const bell = MeshBuilder.CreateTorus("buttonRunBell", { diameter: 0.54, thickness: 0.12, tessellation: 18 }, this.scene);
    bell.parent = root;
    bell.position = new Vector3(1.2, 0.72, -0.08);
    bell.material = this.createMaterial("buttonRunBellMat", GOLD, new Color3(0.52, 0.2, 0.01));
    const railParts = [track, ball, bell];
    [-1.35, 1.35].forEach((offset, index) => {
      const post = MeshBuilder.CreateCylinder(`buttonRunPost-${index}`, { height: 0.72, diameter: 0.12, tessellation: 12 }, this.scene);
      post.parent = root;
      post.position = new Vector3(offset, 0.36, 0.1);
      post.material = this.createMaterial(`buttonRunPostMat-${index}`, CREAM, new Color3(0.2, 0.08, 0.02));
      railParts.push(post);
    });
    this.contraptions.push({ kind: "buttonRun", root, x, activated: false, progress: 0, parts: railParts });
  }

  private createLaceLever(x: number, y: number) {
    const root = new TransformNode("laceLeverContraption", this.scene);
    root.position = new Vector3(x, y, -0.28);
    const base = MeshBuilder.CreateBox("laceLeverBase", { width: 1.25, height: 0.32, depth: 0.68 }, this.scene);
    base.parent = root;
    base.position = new Vector3(0, 0.16, 0);
    base.material = this.createMaterial("laceLeverBaseMat", new Color3(0.56, 0.29, 0.12), new Color3(0.1, 0.035, 0.01));
    const arm = MeshBuilder.CreateBox("laceLeverArm", { width: 1.8, height: 0.15, depth: 0.15 }, this.scene);
    arm.parent = root;
    arm.position = new Vector3(0.12, 0.88, -0.06);
    arm.rotation.z = 0.24;
    arm.material = this.createMaterial("laceLeverArmMat", RESCUE_CORAL, new Color3(0.48, 0.03, 0.02));
    const handle = MeshBuilder.CreateTorus("laceLeverHandle", { diameter: 0.38, thickness: 0.075, tessellation: 18 }, this.scene);
    handle.parent = root;
    handle.position = new Vector3(0.93, 1.08, -0.12);
    handle.material = this.createMaterial("laceLeverHandleMat", CREAM, GOLD);
    const parts = [base, arm, handle];
    for (let index = 0; index < 6; index += 1) {
      const domino = MeshBuilder.CreateBox(`laceLeverDomino-${index}`, { width: 0.18, height: 0.72, depth: 0.12 }, this.scene);
      domino.parent = root;
      domino.position = new Vector3(1.55 + index * 0.31, 0.38, -0.06);
      domino.material = this.createMaterial(`laceLeverDominoMat-${index}`, index % 2 === 0 ? CREAM : RESCUE_CORAL, new Color3(0.15, 0.04, 0.02));
      parts.push(domino);
    }
    this.contraptions.push({ kind: "laceLever", root, x, activated: false, progress: 0, parts });
  }

  private createGumPress(x: number, y: number) {
    const root = new TransformNode("gumPressContraption", this.scene);
    root.position = new Vector3(x, y, -0.28);
    const plate = MeshBuilder.CreateBox("gumPressPlate", { width: 2.05, height: 0.2, depth: 0.9 }, this.scene);
    plate.parent = root;
    plate.position = new Vector3(0, 0.24, 0);
    plate.material = this.createMaterial("gumPressPlateMat", new Color3(0.51, 0.3, 0.16), new Color3(0.08, 0.03, 0.01));
    const gum = MeshBuilder.CreateDisc("gumPressPad", { radius: 0.48, tessellation: 24 }, this.scene);
    gum.parent = root;
    gum.position = new Vector3(0, 0.39, -0.49);
    gum.material = this.createMaterial("gumPressPadMat", MOSS, new Color3(0.55, 0.11, 0.26));
    const ramp = MeshBuilder.CreateBox("gumPressRamp", { width: 1.75, height: 0.22, depth: 0.5 }, this.scene);
    ramp.parent = root;
    ramp.position = new Vector3(1.8, 0.82, 0.02);
    ramp.rotation.z = 0.34;
    ramp.material = this.createMaterial("gumPressRampMat", new Color3(0.62, 0.36, 0.17), new Color3(0.12, 0.04, 0.01));
    const parts = [plate, gum, ramp];
    [-0.65, 0.65].forEach((offset, index) => {
      const spring = MeshBuilder.CreateTorus(`gumPressSpring-${index}`, { diameter: 0.35, thickness: 0.075, tessellation: 16 }, this.scene);
      spring.parent = root;
      spring.position = new Vector3(offset, 0.08, -0.08);
      spring.rotation.x = Math.PI / 2;
      spring.material = this.createMaterial(`gumPressSpringMat-${index}`, GOLD, new Color3(0.45, 0.16, 0.02));
      parts.push(spring);
    });
    this.contraptions.push({ kind: "gumPress", root, x, activated: false, progress: 0, parts });
  }

  private createSpoolLift(x: number, y: number) {
    const root = new TransformNode("spoolLiftContraption", this.scene);
    root.position = new Vector3(x, y, -0.3);
    const spool = MeshBuilder.CreateCylinder("spoolLiftCore", { height: 1.15, diameter: 0.82, tessellation: 20 }, this.scene);
    spool.parent = root;
    spool.rotation.z = Math.PI / 2;
    spool.position = new Vector3(0, 0.52, 0);
    spool.material = this.createMaterial("spoolLiftCoreMat", CYAN, new Color3(0.03, 0.18, 0.4));
    const wheel = MeshBuilder.CreateTorus("spoolLiftWheel", { diameter: 1.18, thickness: 0.12, tessellation: 24 }, this.scene);
    wheel.parent = root;
    wheel.position = new Vector3(0, 0.52, -0.08);
    wheel.material = this.createMaterial("spoolLiftWheelMat", GOLD, new Color3(0.5, 0.16, 0.01));
    const cable = MeshBuilder.CreateBox("spoolLiftCable", { width: 0.08, height: 2.65, depth: 0.07 }, this.scene);
    cable.parent = root;
    cable.position = new Vector3(0.82, 1.5, 0);
    cable.material = this.createMaterial("spoolLiftCableMat", CREAM, new Color3(0.16, 0.06, 0.01));
    const hook = MeshBuilder.CreateTorus("spoolLiftHook", { diameter: 0.32, thickness: 0.08, tessellation: 16 }, this.scene);
    hook.parent = root;
    hook.position = new Vector3(0.82, 2.75, -0.05);
    hook.material = this.createMaterial("spoolLiftHookMat", RESCUE_CORAL, GOLD);
    this.contraptions.push({ kind: "spoolLift", root, x, activated: false, progress: 0, parts: [spool, wheel, cable, hook] });
  }

  private createLaceBridge(x: number, y: number, width: number) {
    const platform = this.createPlatform(x, y, width, 0.5, "laundry");
    platform.mesh.visibility = 0.58;
    for (let index = 0; index < 7; index += 1) {
      const knot = MeshBuilder.CreateTorus(`laceKnot-${index}`, { diameter: 0.54, thickness: 0.11, tessellation: 18 }, this.scene);
      knot.position = new Vector3(x - width / 2 + 0.48 + index * 0.75, y + 0.42, -0.04);
      knot.rotation.x = Math.PI / 2;
      knot.material = this.createMaterial(`laceKnotMat-${index}`, CREAM, new Color3(0.15, 0.07, 0.03));
      knot.isPickable = false;
    }
  }

  private addPlatform(x: number, y: number, width: number, height: number, mesh: Mesh, special?: "bouncePad" | "crumble"): Platform {
    const platform: Platform = { x, y, width, height, top: y + height / 2, mesh, special };
    this.platforms.push(platform);
    return platform;
  }

  /** An invisible animation anchor, not a rendered sprite. This used to carry a
   * texture pulled from Manus's own hosted storage; now that this project runs
   * outside the Manus platform that storage is unreachable, so the plane stays
   * fully transparent and the crafted procedural shoe body (see createPlayer,
   * createLeftShoe, etc.) is the entire visible character. The plane is kept,
   * rather than deleted, purely so the existing pose animation (attack squash,
   * airborne lean, dance beat) still has a node to drive without every call
   * site needing to change; see updatePlayerPose and the dance-finale beat. */
  private addFootwearBillboard(
    name: string,
    root: TransformNode,
    width: number,
    height: number,
    position: Vector3,
  ): Mesh {
    const plane = MeshBuilder.CreatePlane(name, { width, height }, this.scene);
    plane.parent = root;
    plane.position = position;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    plane.isVisible = false;
    return plane;
  }

  private createPlayer(): PlayerState {
    const root = new TransformNode("rightShoeRoot", this.scene);
    const sole = MeshBuilder.CreateBox("rightSole", { width: 1.55, height: 0.24, depth: 0.72 }, this.scene);
    sole.parent = root;
    sole.position = new Vector3(0.13, 0.3, 0);
    sole.material = this.createMaterial("rightSoleMat", CREAM, new Color3(0.15, 0.07, 0.03));

    const upper = MeshBuilder.CreateSphere("rightUpper", { diameter: 1, segments: 20 }, this.scene);
    upper.parent = root;
    upper.position = new Vector3(0.03, 0.63, 0);
    upper.scaling = new Vector3(0.95, 0.62, 0.6);
    upper.material = this.createMaterial("rightUpperMat", RESCUE_CORAL, new Color3(0.52, 0.06, 0.035));

    const heel = MeshBuilder.CreateBox("rightHeel", { width: 0.48, height: 0.7, depth: 0.63 }, this.scene);
    heel.parent = root;
    heel.position = new Vector3(-0.53, 0.67, 0);
    heel.material = this.createMaterial("rightHeelMat", RESCUE_CORAL, new Color3(0.42, 0.04, 0.02));

    const tongue = MeshBuilder.CreateBox("rightTongue", { width: 0.4, height: 0.48, depth: 0.08 }, this.scene);
    tongue.parent = root;
    tongue.position = new Vector3(-0.02, 0.98, -0.38);
    tongue.material = this.createMaterial("rightTongueMat", CREAM, new Color3(0.18, 0.09, 0.02));

    for (let index = 0; index < 3; index += 1) {
      const lace = MeshBuilder.CreateBox(`rightLace-${index}`, { width: 0.74, height: 0.07, depth: 0.09 }, this.scene);
      lace.parent = root;
      lace.position = new Vector3(0.04 + index * 0.03, 0.68 + index * 0.15, -0.46);
      lace.rotation.z = index % 2 === 0 ? 0.17 : -0.17;
      lace.material = this.createMaterial(`rightLaceMat-${index}`, CREAM, new Color3(0.13, 0.07, 0.02));
    }

    const eye = MeshBuilder.CreateSphere("rightShoeEye", { diameter: 0.16, segments: 16 }, this.scene);
    eye.parent = root;
    eye.position = new Vector3(0.31, 0.85, -0.49);
    eye.material = this.createMaterial("rightShoeEyeMat", new Color3(0.08, 0.2, 0.34), CYAN);

    const knot = MeshBuilder.CreateSphere("rightHeartEyelet", { diameter: 0.16, segments: 16 }, this.scene);
    knot.parent = root;
    knot.position = new Vector3(-0.36, 0.94, -0.45);
    knot.material = this.createMaterial("rightHeartEyeletMat", GOLD, new Color3(0.56, 0.22, 0.03));

    // The crafted procedural shoe body is the entire visible hero now (see addFootwearBillboard).
    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 1; });
    this.heroSprite = this.addFootwearBillboard(
      "rightShoeAnimAnchor",
      root,
      2.56,
      1.98,
      new Vector3(0.06, 0.9, -0.64),
    );

    const halo = MeshBuilder.CreateDisc("rightShoeGlowHalo", { radius: 1.34, tessellation: 40 }, this.scene);
    halo.parent = root;
    halo.position = new Vector3(0.08, 0.84, -0.72);
    const haloMaterial = this.createMaterial("rightShoeGlowHaloMat", RESCUE_CORAL, GOLD);
    // The halo is deliberately restrained: it frames the hero instead of bleaching through it.
    haloMaterial.alpha = 0.1;
    haloMaterial.backFaceCulling = false;
    halo.material = haloMaterial;
    halo.isPickable = false;
    this.heroHalo = halo;

    root.position = new Vector3(0, -4.2, -0.4);
    return {
      root,
      x: 0,
      bottom: -4.2,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      hearts: STARTING_HEARTS,
      maxHearts: STARTING_HEARTS,
      lives: STARTING_LIVES,
      invulnerable: 0,
      jumpUsed: false,
      dashTimer: 0,
      dashCooldown: 0,
      doubleJumps: 0,
      dashCharges: 0,
      moonTimer: 0,
      superJump: false,
      superJumpTimer: 0,
      shoeForm: "starter",
      specialMoveQueue: [],
      specialMoveCooldown: 0,
      lashTimer: 0,
      stompTimer: 0,
      formAttackTimer: 0,
      formAttackCooldown: 0,
      formShieldTimer: 0,
      ultraMove: false,
      ultraTimer: 0,
      ultraCooldown: 0,
    };
  }

  private createEnemies() {
    // Each transformation gate has two light foes just beyond it, so its instant move reads clearly in motion.
    this.enemies.push(this.createLaceGoblin(8.05, -4.2, 7.7, 8.4));
    this.enemies.push(this.createSlime(8.9, -4.2, 8.55, 9.25));
    // A flying dive-bomber in the first stage, well clear of the ground-bound goblins on
    // either side, so its patrol-and-dive movement reads as clearly new in motion.
    this.enemies.push(this.createMoth(12.5, -1.3, 9.5, 16.4));
    this.enemies.push(this.createLaceGoblin(17.18, -2.8, 16.8, 17.55));
    this.enemies.push(this.createSlime(17.88, -2.8, 17.58, 18.12));
    this.enemies.push(this.createLaceGoblin(27.45, -2.45, 27.1, 27.85));
    this.enemies.push(this.createSlime(28.22, -2.45, 27.92, 28.6));
    this.enemies.push(this.createLaceGoblin(40.92, 0.25, 40.55, 41.28));
    this.enemies.push(this.createSlime(41.42, 0.25, 41.18, 41.7));
    this.enemies.push(this.createLaceGoblin(47.78, -1.2, 47.42, 48.16));
    this.enemies.push(this.createSlime(48.45, -1.2, 48.16, 48.9));
    this.enemies.push(this.createLaceGoblin(11.8, -4.2, 8.5, 14.2));
    this.enemies.push(this.createSlime(23.4, -1.25, 20.2, 23.4));
    this.enemies.push(this.createMiniBoss(41.9, 0.55, 39.9, 43.7, "Lace Captain"));
    this.enemies.push(this.createLaceGoblin(49.3, -1.2, 47.8, 50.0));
    this.enemies.push(this.createLaceGoblin(50.2, -4.2, 47.6, 53.6));
    this.enemies.push(this.createMiniBoss(56.7, 2.4, 55.2, 58.1, "Gum Marshal"));
    // Placed after the Gum Stomp pickup at x=55.0, so the player always has the tool
    // this hazard requires by the time they reach it.
    this.enemies.push(this.createGumTurret(57.9, 2.4));
    this.enemies.push(this.createTrueBoss(59.05, 2.4, 58.3, 59.55));
  }

  private createLaceGoblin(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`laceGoblin-${x}`, this.scene);
    const body = MeshBuilder.CreateSphere(`laceGoblinBody-${x}`, { diameter: 0.95, segments: 18 }, this.scene);
    body.parent = root;
    body.position.y = 0.55;
    body.scaling.y = 0.78;
    body.material = this.createMaterial(`laceGoblinBodyMat-${x}`, VIOLET, new Color3(0.2, 0.04, 0.32));
    for (let index = 0; index < 3; index += 1) {
      const lace = MeshBuilder.CreateTorus(`goblinLace-${x}-${index}`, { diameter: 0.38, thickness: 0.07, tessellation: 14 }, this.scene);
      lace.parent = root;
      lace.position = new Vector3(-0.18 + index * 0.2, 0.72 + (index % 2) * 0.08, -0.35);
      lace.rotation.x = Math.PI / 2;
      lace.material = this.createMaterial(`goblinLaceMat-${x}-${index}`, CREAM, new Color3(0.14, 0.06, 0.02));
    }
    const eye = MeshBuilder.CreateSphere(`goblinEye-${x}`, { diameter: 0.13, segments: 12 }, this.scene);
    eye.parent = root;
    eye.position = new Vector3(0.12, 0.59, -0.46);
    eye.material = this.createMaterial(`goblinEyeMat-${x}`, CREAM, GOLD);
    root.position = new Vector3(x, bottom, -0.3);
    return { kind: "lace", root, x, bottom, minX, maxX, speed: 1.28, width: 0.82, height: 0.92, alive: true, phase: x };
  }

  private createSlime(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`stainSlime-${x}`, this.scene);
    const body = MeshBuilder.CreateSphere(`stainSlimeBody-${x}`, { diameter: 1, segments: 20 }, this.scene);
    body.parent = root;
    body.position.y = 0.33;
    body.scaling = new Vector3(0.82, 0.58, 0.56);
    body.material = this.createMaterial(`stainSlimeMat-${x}`, MOSS, new Color3(0.04, 0.23, 0.05));
    for (const offset of [-0.16, 0.16]) {
      const eye = MeshBuilder.CreateSphere(`slimeEye-${x}-${offset}`, { diameter: 0.1, segments: 12 }, this.scene);
      eye.parent = root;
      eye.position = new Vector3(offset, 0.46, -0.42);
      eye.material = this.createMaterial(`slimeEyeMat-${x}-${offset}`, CREAM, new Color3(0.08, 0.12, 0.16));
    }
    root.position = new Vector3(x, bottom, -0.3);
    return { kind: "slime", root, x, bottom, minX, maxX, speed: -0.86, width: 0.9, height: 0.65, alive: true, phase: x };
  }

  /** A flying dive-bomber: genuinely different movement from the ground-bound goblin and
   * slime, driven by updateMothFlight rather than the shared patrol-and-hover code. */
  private createMoth(x: number, homeBottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`moth-${x}`, this.scene);
    const body = MeshBuilder.CreateSphere(`mothBody-${x}`, { diameter: 0.58, segments: 16 }, this.scene);
    body.parent = root;
    body.position.y = 0.5;
    body.scaling = new Vector3(0.82, 0.62, 0.68);
    body.material = this.createMaterial(`mothBodyMat-${x}`, new Color3(0.86, 0.78, 0.95), VIOLET);
    for (const side of [-1, 1]) {
      const wing = MeshBuilder.CreateDisc(`mothWing-${x}-${side}`, { radius: 0.4, tessellation: 3 }, this.scene);
      wing.parent = root;
      wing.position = new Vector3(side * 0.3, 0.56, -0.08);
      wing.rotation.y = side * 0.55;
      const wingMaterial = this.createMaterial(`mothWingMat-${x}-${side}`, VIOLET, new Color3(0.3, 0.14, 0.4));
      wingMaterial.alpha = 0.72;
      wingMaterial.backFaceCulling = false;
      wing.material = wingMaterial;
    }
    const eye = MeshBuilder.CreateSphere(`mothEye-${x}`, { diameter: 0.1, segments: 10 }, this.scene);
    eye.parent = root;
    eye.position = new Vector3(0.11, 0.55, -0.3);
    eye.material = this.createMaterial(`mothEyeMat-${x}`, CREAM, GOLD);
    root.position = new Vector3(x, homeBottom, -0.3);
    return {
      kind: "moth",
      root,
      x,
      bottom: homeBottom,
      minX,
      maxX,
      speed: 1.1,
      width: 0.7,
      height: 0.62,
      alive: true,
      phase: x,
      homeBottom,
      diveTimer: 1.4 + (x % 3),
    };
  }

  /** A stationary hazard a plain stomp cannot defeat -- only tryGumStomp's gumArmored
   * check lets it die, so the ability the player already unlocked has a reason to matter
   * again this late in the route. */
  private createGumTurret(x: number, bottom: number): Enemy {
    const root = new TransformNode(`gumTurret-${x}`, this.scene);
    const base = MeshBuilder.CreateCylinder(`gumTurretBase-${x}`, { height: 0.32, diameterTop: 0.9, diameterBottom: 1.02, tessellation: 20 }, this.scene);
    base.parent = root;
    base.position.y = 0.16;
    base.material = this.createMaterial(`gumTurretBaseMat-${x}`, new Color3(0.24, 0.18, 0.1), new Color3(0.04, 0.03, 0.01));
    const wad = MeshBuilder.CreateSphere(`gumTurretWad-${x}`, { diameter: 0.86, segments: 18 }, this.scene);
    wad.parent = root;
    wad.position.y = 0.62;
    wad.scaling = new Vector3(1, 0.9, 1);
    wad.material = this.createMaterial(`gumTurretWadMat-${x}`, MOSS, new Color3(0.05, 0.24, 0.06));
    const nozzle = MeshBuilder.CreateCylinder(`gumTurretNozzle-${x}`, { height: 0.36, diameter: 0.24, tessellation: 12 }, this.scene);
    nozzle.parent = root;
    nozzle.position = new Vector3(0, 0.78, -0.42);
    nozzle.rotation.x = Math.PI / 2.4;
    nozzle.material = this.createMaterial(`gumTurretNozzleMat-${x}`, new Color3(0.7, 0.55, 0.2), GOLD);
    const eye = MeshBuilder.CreateSphere(`gumTurretEye-${x}`, { diameter: 0.13, segments: 12 }, this.scene);
    eye.parent = root;
    eye.position = new Vector3(0.16, 0.68, -0.38);
    eye.material = this.createMaterial(`gumTurretEyeMat-${x}`, CREAM, RESCUE_CORAL);
    root.position = new Vector3(x, bottom, -0.3);
    return {
      kind: "gumTurret",
      root,
      x,
      bottom,
      minX: x,
      maxX: x,
      speed: 0,
      width: 0.98,
      height: 0.92,
      alive: true,
      phase: x,
      gumArmored: true,
    };
  }

  private createRollerSkate(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`rogueSkate-${x}`, this.scene);
    const boot = MeshBuilder.CreateBox(`rogueSkateBoot-${x}`, { width: 1.12, height: 0.47, depth: 0.72 }, this.scene);
    boot.parent = root;
    boot.position = new Vector3(0, 0.68, 0);
    boot.material = this.createMaterial(`rogueSkateBootMat-${x}`, new Color3(0.16, 0.38, 0.75), new Color3(0.04, 0.1, 0.43));
    const blade = MeshBuilder.CreateBox(`rogueSkateBlade-${x}`, { width: 1.15, height: 0.1, depth: 0.14 }, this.scene);
    blade.parent = root;
    blade.position = new Vector3(0, 0.39, -0.18);
    blade.material = this.createMaterial(`rogueSkateBladeMat-${x}`, new Color3(0.45, 0.78, 0.94), new Color3(0.08, 0.2, 0.45));
    for (const offset of [-0.33, 0.33]) {
      const wheel = MeshBuilder.CreateCylinder(`skateWheel-${x}-${offset}`, { height: 0.22, diameter: 0.32, tessellation: 16 }, this.scene);
      wheel.parent = root;
      wheel.position = new Vector3(offset, 0.25, 0);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = this.createMaterial(`skateWheelMat-${x}-${offset}`, new Color3(0.07, 0.1, 0.2), CYAN);
    }
    const hostileEye = MeshBuilder.CreateSphere(`skateEye-${x}`, { diameter: 0.14, segments: 12 }, this.scene);
    hostileEye.parent = root;
    hostileEye.position = new Vector3(0.22, 0.72, -0.4);
    hostileEye.material = this.createMaterial(`skateEyeMat-${x}`, VIOLET, RESCUE_CORAL);
    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 1; });
    this.addFootwearBillboard(`rogueSkateAnimAnchor-${x}`, root, 1.9, 1.58, new Vector3(0, 0.82, -0.58));
    root.position = new Vector3(x, bottom, -0.25);
    return { kind: "skate", root, x, bottom, minX, maxX, speed: 1.08, width: 1.12, height: 1.08, alive: true, phase: x };
  }

  private createMiniBoss(x: number, bottom: number, minX: number, maxX: number, bossName: string): Enemy {
    const boss = this.createRollerSkate(x, bottom, minX, maxX);
    boss.bossTier = "mini";
    boss.bossName = bossName;
    boss.maxHits = 2;
    boss.width = 1.38;
    boss.height = 1.34;
    boss.speed *= 0.76;
    boss.root.scaling.y = 1.24;
    boss.root.scaling.z = 1.24;
    const crown = MeshBuilder.CreateTorus(`miniBossCrown-${x}`, { diameter: 0.65, thickness: 0.075, tessellation: 18 }, this.scene);
    crown.parent = boss.root;
    crown.position = new Vector3(0, 1.44, -0.62);
    crown.material = this.createMaterial(`miniBossCrownMat-${x}`, GOLD, RESCUE_CORAL);
    return boss;
  }

  private createTrueBoss(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const boss = this.createRollerSkate(x, bottom, minX, maxX);
    boss.bossTier = "boss";
    boss.bossName = "The Tangled Titan";
    boss.maxHits = 3;
    boss.width = 2.18;
    boss.height = 2.08;
    boss.speed *= 0.44;
    boss.root.scaling = new Vector3(1.72, 1.72, 1.72);
    const halo = MeshBuilder.CreateTorus(`trueBossHalo-${x}`, { diameter: 1.46, thickness: 0.12, tessellation: 24 }, this.scene);
    halo.parent = boss.root;
    halo.position = new Vector3(0, 1.42, -0.66);
    halo.material = this.createMaterial(`trueBossHaloMat-${x}`, VIOLET, RESCUE_CORAL);
    const spike = MeshBuilder.CreateCylinder(`trueBossSpur-${x}`, { height: 0.56, diameterTop: 0, diameterBottom: 0.38, tessellation: 12 }, this.scene);
    spike.parent = boss.root;
    spike.position = new Vector3(0.72, 0.92, -0.64);
    spike.rotation.z = -Math.PI / 2;
    spike.material = this.createMaterial(`trueBossSpurMat-${x}`, GOLD, CREAM);
    return boss;
  }

  private createPickups() {
    const buttonPositions = [2.7, 4.6, 6.5, 10.3, 14.5, 17.4, 20.2, 27.2, 32.8, 38.5, 45.7, 54.6, 60.2];
    buttonPositions.forEach((x, index) => {
      const y = index > 8 ? -2.95 : -3.1;
      this.pickups.push(this.createPickup("button", x, y + (index % 3) * 0.24));
    });
    this.pickups.push(this.createPickup("pump", 7.15, -3.45));
    this.pickups.push(this.createPickup("feather", 8.4, -2.7));
    this.pickups.push(this.createPickup("superJump", 12.2, -1.4));
    this.pickups.push(this.createPickup("bonus", 15.4, 0.55));
    this.pickups.push(this.createPickup("hightop", 16.35, -2.1));
    this.pickups.push(this.createPickup("dash", 19.4, -2.05));
    this.pickups.push(this.createPickup("loafer", 26.6, -1.75));
    this.pickups.push(this.createPickup("heart", 34.3, -0.55));
    this.pickups.push(this.createPickup("moon", 47.2, -0.82));
    this.pickups.push(this.createPickup("sneaker", 47.02, -0.5));
    this.pickups.push(this.createPickup("feather", 53.1, 2.0));
    this.pickups.push(this.createPickup("dash", 58.1, 3.0));
    this.pickups.push(this.createPickup("ultra", 58.45, 3.1));
    this.pickups.push(this.createPickup("chrome", 13.0, -2.5));
    this.pickups.push(this.createPickup("moonstep", 30.2, -2.2));
    this.pickups.push(this.createPickup("cowboy", 40.1, 0.95));
    this.pickups.push(this.createPickup("lash", 42.0, 0.75));
    this.pickups.push(this.createPickup("gum", 55.0, 2.95));
    // A dedicated final-stage recovery pickup makes the Tower Break’s health-management decision visible in the spectator run.
    this.pickups.push(this.createPickup("heart", 53.6, 1.6));
    // Raises max hearts permanently for the rest of this life -- placed right before the
    // true boss (whose windup->lunge super move can deal full-maxHearts damage in one
    // hit, see damagePlayer's call site in updateEnemies) so grabbing it is a real,
    // visible tradeoff against just rushing the gate.
    this.pickups.push(this.createPickup("heartPlus", 57.0, 2.7));
  }

  private createPickup(kind: PickupKind, x: number, y: number): Pickup {
    const root = new TransformNode(`pickup-${kind}-${x}`, this.scene);
    let icon: Mesh;
    if (kind === "button") {
      icon = MeshBuilder.CreateDisc(`button-${x}`, { radius: 0.22, tessellation: 24 }, this.scene);
      icon.material = this.createMaterial(`buttonMat-${x}`, GOLD, new Color3(0.55, 0.19, 0.02));
      const holes = [-0.08, 0.08];
      holes.forEach((xOffset, index) => {
        const hole = MeshBuilder.CreateDisc(`buttonHole-${x}-${index}`, { radius: 0.035, tessellation: 12 }, this.scene);
        hole.parent = root;
        hole.position = new Vector3(xOffset, index === 0 ? 0.075 : -0.075, -0.04);
        hole.material = this.createMaterial(`buttonHoleMat-${x}-${index}`, new Color3(0.35, 0.1, 0.04), new Color3(0.12, 0.01, 0.01));
      });
    } else if (kind === "feather") {
      icon = MeshBuilder.CreateSphere(`feather-${x}`, { diameter: 0.48, segments: 20 }, this.scene);
      icon.scaling = new Vector3(0.54, 1.45, 0.3);
      icon.rotation.z = -0.45;
      icon.material = this.createMaterial(`featherMat-${x}`, GOLD, new Color3(0.65, 0.25, 0.04));
    } else if (kind === "dash") {
      icon = MeshBuilder.CreateTorus(`dashSpool-${x}`, { diameter: 0.62, thickness: 0.18, tessellation: 22 }, this.scene);
      icon.material = this.createMaterial(`dashMat-${x}`, CYAN, new Color3(0.03, 0.32, 0.54));
    } else if (kind === "heart") {
      icon = MeshBuilder.CreateSphere(`heartSole-${x}`, { diameter: 0.55, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.02, 0.74, 0.34);
      icon.material = this.createMaterial(`heartMat-${x}`, RESCUE_CORAL, new Color3(0.58, 0.035, 0.02));
    } else if (kind === "heartPlus") {
      // Bigger than a plain Heart Sole and ringed in gold -- reads at a glance as the
      // rarer, permanent-capacity version, not just another heal.
      icon = MeshBuilder.CreateSphere(`heartPlus-${x}`, { diameter: 0.7, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.02, 0.74, 0.34);
      icon.material = this.createMaterial(`heartPlusMat-${x}`, RESCUE_CORAL, GOLD);
      const ring = MeshBuilder.CreateTorus(`heartPlusRing-${x}`, { diameter: 0.92, thickness: 0.07, tessellation: 24 }, this.scene);
      ring.parent = root;
      ring.position = new Vector3(0, 0, -0.05);
      ring.material = this.createMaterial(`heartPlusRingMat-${x}`, GOLD, CREAM);
    } else if (kind === "extraLife") {
      // A star-burst charm, violet+gold -- deliberately not coral like the heart family,
      // so a rarer "extra attempt" pickup reads as visually distinct at a glance.
      icon = MeshBuilder.CreateSphere(`extraLife-${x}`, { diameter: 0.42, segments: 18 }, this.scene);
      icon.material = this.createMaterial(`extraLifeMat-${x}`, VIOLET, GOLD);
      for (let index = 0; index < 4; index += 1) {
        const spike = MeshBuilder.CreateCylinder(`extraLifeSpike-${x}-${index}`, { height: 0.5, diameterTop: 0, diameterBottom: 0.14, tessellation: 8 }, this.scene);
        spike.parent = root;
        spike.rotation.z = (index * Math.PI) / 2 + Math.PI / 4;
        spike.material = this.createMaterial(`extraLifeSpikeMat-${x}-${index}`, GOLD, VIOLET);
      }
    } else if (kind === "moon") {
      icon = MeshBuilder.CreateTorus(`moonInsole-${x}`, { diameter: 0.62, thickness: 0.16, tessellation: 22 }, this.scene);
      icon.material = this.createMaterial(`moonMat-${x}`, VIOLET, new Color3(0.18, 0.02, 0.38));
    } else if (kind === "chrome") {
      icon = MeshBuilder.CreateSphere(`coralChrome-${x}`, { diameter: 0.68, segments: 24 }, this.scene);
      icon.scaling = new Vector3(0.9, 0.9, 0.32);
      icon.material = this.createMaterial(`coralChromeMat-${x}`, RESCUE_CORAL, GOLD);
    } else if (kind === "moonstep") {
      icon = MeshBuilder.CreateTorus(`moonstepPatch-${x}`, { diameter: 0.7, thickness: 0.16, tessellation: 24 }, this.scene);
      icon.material = this.createMaterial(`moonstepPatchMat-${x}`, CYAN, new Color3(0.1, 0.22, 0.74));
    } else if (kind === "pump") {
      icon = MeshBuilder.CreateBox(`pumpCharm-${x}`, { width: 0.7, height: 0.25, depth: 0.18 }, this.scene);
      icon.rotation.z = -0.16;
      icon.material = this.createMaterial(`pumpCharmMat-${x}`, RESCUE_CORAL, GOLD);
      const heel = MeshBuilder.CreateBox(`pumpHeel-${x}`, { width: 0.14, height: 0.48, depth: 0.16 }, this.scene);
      heel.parent = root;
      heel.position = new Vector3(-0.23, -0.2, -0.22);
      heel.material = this.createMaterial(`pumpHeelMat-${x}`, RESCUE_CORAL, GOLD);
    } else if (kind === "hightop") {
      icon = MeshBuilder.CreateBox(`hightopCharm-${x}`, { width: 0.6, height: 0.62, depth: 0.18 }, this.scene);
      icon.scaling = new Vector3(1, 1.15, 1);
      icon.material = this.createMaterial(`hightopCharmMat-${x}`, CYAN, CREAM);
      const collar = MeshBuilder.CreateTorus(`hightopCollar-${x}`, { diameter: 0.48, thickness: 0.08, tessellation: 18 }, this.scene);
      collar.parent = root;
      collar.position = new Vector3(0, 0.3, -0.22);
      collar.material = this.createMaterial(`hightopCollarMat-${x}`, CREAM, CYAN);
    } else if (kind === "loafer") {
      icon = MeshBuilder.CreateSphere(`loaferCharm-${x}`, { diameter: 0.72, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.18, 0.5, 0.28);
      icon.material = this.createMaterial(`loaferCharmMat-${x}`, MOSS, GOLD);
      const tassel = MeshBuilder.CreateSphere(`loaferTassel-${x}`, { diameter: 0.18, segments: 12 }, this.scene);
      tassel.parent = root;
      tassel.position = new Vector3(0.2, 0.1, -0.25);
      tassel.material = this.createMaterial(`loaferTasselMat-${x}`, GOLD, CREAM);
    } else if (kind === "cowboy") {
      icon = MeshBuilder.CreateBox(`cowboyCharm-${x}`, { width: 0.58, height: 0.78, depth: 0.18 }, this.scene);
      icon.rotation.z = -0.1;
      icon.material = this.createMaterial(`cowboyCharmMat-${x}`, new Color3(0.62, 0.24, 0.08), GOLD);
      const spur = MeshBuilder.CreateTorus(`cowboySpur-${x}`, { diameter: 0.33, thickness: 0.075, tessellation: 16 }, this.scene);
      spur.parent = root;
      spur.position = new Vector3(-0.37, -0.18, -0.22);
      spur.material = this.createMaterial(`cowboySpurMat-${x}`, GOLD, CREAM);
    } else if (kind === "sneaker") {
      icon = MeshBuilder.CreateSphere(`sneakerCharm-${x}`, { diameter: 0.72, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.18, 0.48, 0.3);
      icon.material = this.createMaterial(`sneakerCharmMat-${x}`, VIOLET, CYAN);
      const stripe = MeshBuilder.CreateBox(`sneakerStripe-${x}`, { width: 0.5, height: 0.08, depth: 0.07 }, this.scene);
      stripe.parent = root;
      stripe.position = new Vector3(0.08, 0.08, -0.25);
      stripe.rotation.z = -0.28;
      stripe.material = this.createMaterial(`sneakerStripeMat-${x}`, CREAM, CYAN);
    } else if (kind === "ultra") {
      icon = MeshBuilder.CreateTorus(`ultraMoveCore-${x}`, { diameter: 0.88, thickness: 0.16, tessellation: 28 }, this.scene);
      icon.material = this.createMaterial(`ultraMoveCoreMat-${x}`, VIOLET, GOLD);
      const core = MeshBuilder.CreateSphere(`ultraMoveStar-${x}`, { diameter: 0.36, segments: 16 }, this.scene);
      core.parent = root;
      core.position = new Vector3(0, 0, -0.28);
      core.material = this.createMaterial(`ultraMoveStarMat-${x}`, GOLD, CREAM);
    } else if (kind === "lash") {
      icon = MeshBuilder.CreateTorus(`laceLashPatch-${x}`, { diameter: 0.74, thickness: 0.105, tessellation: 24 }, this.scene);
      icon.scaling = new Vector3(1.05, 0.62, 1);
      icon.material = this.createMaterial(`laceLashPatchMat-${x}`, CREAM, RESCUE_CORAL);
    } else if (kind === "superJump") {
      icon = MeshBuilder.CreateTorus(`superJumpPatch-${x}`, { diameter: 0.78, thickness: 0.14, tessellation: 24 }, this.scene);
      icon.scaling = new Vector3(0.88, 1.14, 1);
      icon.material = this.createMaterial(`superJumpPatchMat-${x}`, GOLD, CYAN);
    } else if (kind === "bonus") {
      icon = MeshBuilder.CreateSphere(`bonusCapture-${x}`, { diameter: 0.56, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1, 1.18, 0.32);
      icon.material = this.createMaterial(`bonusCaptureMat-${x}`, CYAN, GOLD);
    } else {
      icon = MeshBuilder.CreateDisc(`gumStompPatch-${x}`, { radius: 0.34, tessellation: 24 }, this.scene);
      icon.material = this.createMaterial(`gumStompPatchMat-${x}`, MOSS, new Color3(0.88, 0.16, 0.44));
    }
    icon.parent = root;
    icon.position.z = -0.25;

    // "Shine like a star" -- every pickup, regardless of kind, gets the same small bright
    // sparkle accent so the category reads at a glance (pickup vs. enemy vs. background)
    // even before a player identifies the specific icon. Deliberately built with a fresh,
    // fully-emissive material rather than createMaterial's shared cache (whose colors are
    // all dimmed to 0.14x for ordinary lit objects, see its own comment) -- a glint that
    // isn't visibly brighter than the object it's sitting on isn't a glint.
    const glintPivot = new TransformNode(`pickupGlintPivot-${x}-${y}`, this.scene);
    glintPivot.parent = root;
    glintPivot.position = new Vector3(0.2, 0.2, -0.36);
    const glintMat = new StandardMaterial(`pickupGlintMat-${x}-${y}`, this.scene);
    glintMat.diffuseColor = CREAM;
    glintMat.emissiveColor = CREAM;
    glintMat.specularColor = new Color3(0, 0, 0);
    const glintA = MeshBuilder.CreateBox(`pickupGlintA-${x}-${y}`, { width: 0.3, height: 0.045, depth: 0.02 }, this.scene);
    glintA.parent = glintPivot;
    glintA.material = glintMat;
    const glintB = MeshBuilder.CreateBox(`pickupGlintB-${x}-${y}`, { width: 0.045, height: 0.3, depth: 0.02 }, this.scene);
    glintB.parent = glintPivot;
    glintB.material = glintMat;

    root.position = new Vector3(x, y, -0.22);
    return { kind, root, glint: glintPivot, x, y, radius: kind === "button" ? 0.32 : 0.5, collected: false, phase: x * 0.7 };
  }

  private createCheckpoints() {
    this.checkpoints.push(this.createCheckpoint(32.3, "Lace Bridge"));
    this.checkpoints.push(this.createCheckpoint(49.5, "Moonlit Shoeboxes"));
  }

  private createCheckpoint(x: number, label: string): Checkpoint {
    const root = new TransformNode(`checkpoint-${label}`, this.scene);
    const pole = MeshBuilder.CreateCylinder(`checkpointPole-${x}`, { height: 1.55, diameter: 0.08, tessellation: 12 }, this.scene);
    pole.parent = root;
    pole.position.y = 0.75;
    pole.material = this.createMaterial(`checkpointPoleMat-${x}`, GOLD, new Color3(0.55, 0.18, 0.01));
    const flag = MeshBuilder.CreateBox(`checkpointFlag-${x}`, { width: 0.78, height: 0.46, depth: 0.05 }, this.scene);
    flag.parent = root;
    flag.position = new Vector3(0.4, 1.2, -0.05);
    flag.material = this.createMaterial(`checkpointFlagMat-${x}`, RESCUE_CORAL, new Color3(0.4, 0.03, 0.02));
    const knot = MeshBuilder.CreateSphere(`checkpointKnot-${x}`, { diameter: 0.22, segments: 14 }, this.scene);
    knot.parent = root;
    knot.position = new Vector3(0, 1.57, -0.07);
    knot.material = this.createMaterial(`checkpointKnotMat-${x}`, CREAM, GOLD);
    root.position = new Vector3(x, -4.2, -0.12);
    return { x, activated: false, label, root };
  }

  /** The six-level split (LEVEL_MARKERS): a real, visible, touchable archway at each
   * boundary -- distinct from a checkpoint (which only saves a respawn point) -- so
   * "advance to the next level" is a place the player actually reaches, not an invisible
   * x threshold. See updateLevelMarkers() for the touch check and checkRescue() for how
   * the final level instead ends on the real Left Shoe touch. */
  private createLevelMarkers() {
    for (const marker of LEVEL_MARKERS) {
      const root = new TransformNode(`levelMarker-${marker.x}`, this.scene);
      const postMat = this.createMaterial(`levelMarkerPostMat-${marker.x}`, GOLD, new Color3(0.5, 0.16, 0.01));
      const leftPost = MeshBuilder.CreateCylinder(`levelMarkerPostL-${marker.x}`, { height: 3.2, diameter: 0.16, tessellation: 12 }, this.scene);
      leftPost.parent = root;
      leftPost.position = new Vector3(-0.85, 1.6, 0);
      leftPost.material = postMat;
      const rightPost = MeshBuilder.CreateCylinder(`levelMarkerPostR-${marker.x}`, { height: 3.2, diameter: 0.16, tessellation: 12 }, this.scene);
      rightPost.parent = root;
      rightPost.position = new Vector3(0.85, 1.6, 0);
      rightPost.material = postMat;
      const arch = MeshBuilder.CreateTorus(`levelMarkerArch-${marker.x}`, { diameter: 1.9, thickness: 0.14, tessellation: 24 }, this.scene);
      arch.parent = root;
      arch.position = new Vector3(0, 3.15, 0);
      arch.scaling = new Vector3(1, 0.55, 1);
      arch.material = this.createMaterial(`levelMarkerArchMat-${marker.x}`, RESCUE_CORAL, GOLD);
      root.position = new Vector3(marker.x, -4.2, -0.1);
      this.levelMarkerMeshes.push({ x: marker.x, touched: false, root });
    }
  }

  private updateLevelMarkers() {
    for (const marker of this.levelMarkerMeshes) {
      if (!marker.touched && this.player.x >= marker.x) {
        marker.touched = true;
        this.levelIndex = Math.min(LEVEL_COUNT, this.levelIndex + 1);
        // Reassigns the material reference (a cached, shared "lit" material) rather than
        // mutating whatever material this mesh already pointed to in place -- with
        // materials now shared by color (see materialCache), that would have relit every
        // other mesh in the entire scene using the same original color too.
        const litMaterial = this.createMaterial("levelMarkerLitMat", CYAN, CYAN);
        marker.root.getChildMeshes().forEach((mesh) => { mesh.material = litMaterial; });
        this.message = `Level ${this.levelIndex}/${LEVEL_COUNT}: ${LEVEL_LABELS[this.levelIndex - 1]}.`;
        if (this.isAgentRun) this.logAgent(`◎ reached level ${this.levelIndex}/${LEVEL_COUNT}: ${LEVEL_LABELS[this.levelIndex - 1]}`);
        this.spawnSparks(marker.x, -2.6, CYAN, 18, 2.6);
        this.audio.playCheckpoint();
        this.publishUi(true);
      }
    }
  }

  /** centerX/baseY default to the legacy single-world tower platform's own position
   * (x=62.4, platform top ~3.5) -- the discrete-screens generator passes its own final
   * platform's actual position instead, see buildScreenContent's finalBoss branch. */
  private createRescueDome(centerX = 62.4, baseY = 3.68) {
    const base = MeshBuilder.CreateCylinder("rescueDomeBase", { height: 0.34, diameter: 2.8, tessellation: 28 }, this.scene);
    base.position = new Vector3(centerX, baseY, -0.15);
    base.material = this.createMaterial("rescueDomeBaseMat", RESCUE_CORAL, new Color3(0.55, 0.03, 0.02));

    const dome = MeshBuilder.CreateSphere("rescueDome", { diameter: 2.65, segments: 28 }, this.scene);
    dome.position = new Vector3(centerX, baseY + 1.12, 0.15);
    const domeMaterial = this.createMaterial("rescueDomeMat", new Color3(0.35, 0.8, 0.98), new Color3(0.05, 0.32, 0.58));
    domeMaterial.alpha = 0.22;
    domeMaterial.backFaceCulling = false;
    dome.material = domeMaterial;

    const halo = MeshBuilder.CreateTorus("rescueHalo", { diameter: 3.05, thickness: 0.08, tessellation: 40 }, this.scene);
    halo.position = new Vector3(centerX, baseY + 0.2, -0.33);
    halo.rotation.x = Math.PI / 2;
    halo.material = this.createMaterial("rescueHaloMat", GOLD, RESCUE_CORAL);
    this.leftShoeHalo = halo;

    this.leftShoe = this.createLeftShoe();
    this.leftShoeBaseY = baseY + 0.27;
    this.leftShoe.position = new Vector3(centerX - 0.02, this.leftShoeBaseY, -0.32);
  }

  private createLeftShoe(): TransformNode {
    const root = new TransformNode("leftShoeRoot", this.scene);
    const sole = MeshBuilder.CreateBox("leftSole", { width: 1.35, height: 0.22, depth: 0.62 }, this.scene);
    sole.parent = root;
    sole.position = new Vector3(-0.05, 0.25, 0);
    sole.material = this.createMaterial("leftSoleMat", CREAM, new Color3(0.18, 0.08, 0.02));
    const upper = MeshBuilder.CreateSphere("leftUpper", { diameter: 0.92, segments: 20 }, this.scene);
    upper.parent = root;
    upper.position = new Vector3(-0.02, 0.58, 0);
    upper.scaling = new Vector3(0.9, 0.58, 0.55);
    // Warm cream-and-gold, not Rescue Coral: this is the Left Shoe's half of the visual
    // differentiation from the Right Shoe, matching REALISM.md's original palette intent.
    upper.material = this.createMaterial("leftUpperMat", new Color3(1, 0.86, 0.6), GOLD);
    // Matches createPlayer's heel/tongue/laces (scaled ~0.9x, same relative layout) --
    // Left Shoe used to be a simpler blob-plus-heart while Right Shoe had full shoe
    // detail, which read as a mismatch for the game's actual finale close-up. Same
    // silhouette as the hero now, just the warm cream-and-gold palette instead of Coral.
    const heel = MeshBuilder.CreateBox("leftHeel", { width: 0.43, height: 0.63, depth: 0.57 }, this.scene);
    heel.parent = root;
    heel.position = new Vector3(-0.48, 0.6, 0);
    heel.material = this.createMaterial("leftHeelMat", new Color3(1, 0.86, 0.6), GOLD);
    const tongue = MeshBuilder.CreateBox("leftTongue", { width: 0.36, height: 0.43, depth: 0.07 }, this.scene);
    tongue.parent = root;
    tongue.position = new Vector3(-0.07, 0.88, -0.34);
    tongue.material = this.createMaterial("leftTongueMat", CREAM, new Color3(0.55, 0.4, 0.2));
    for (let index = 0; index < 3; index += 1) {
      const lace = MeshBuilder.CreateBox(`leftLace-${index}`, { width: 0.67, height: 0.06, depth: 0.08 }, this.scene);
      lace.parent = root;
      lace.position = new Vector3(-0.01 + index * 0.03, 0.61 + index * 0.13, -0.42);
      lace.rotation.z = index % 2 === 0 ? 0.17 : -0.17;
      lace.material = this.createMaterial(`leftLaceMat-${index}`, CREAM, new Color3(0.55, 0.4, 0.2));
    }
    const heart = MeshBuilder.CreateSphere("leftHeart", { diameter: 0.16, segments: 12 }, this.scene);
    heart.parent = root;
    heart.position = new Vector3(-0.12, 0.72, -0.43);
    heart.material = this.createMaterial("leftHeartMat", RESCUE_CORAL, GOLD);
    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 1; });
    this.addFootwearBillboard("leftShoeAnimAnchor", root, 2.22, 1.7, new Vector3(-0.03, 0.87, -0.62));
    return root;
  }

  private createForegroundDetails() {
    const wire = MeshBuilder.CreateTorus("laundryBasketRim", { diameter: 2.8, thickness: 0.14, tessellation: 24 }, this.scene);
    wire.position = new Vector3(28.4, -3.0, 0.2);
    wire.scaling.x = 1.55;
    wire.material = this.createMaterial("laundryBasketRimMat", new Color3(0.24, 0.74, 0.8), new Color3(0.03, 0.24, 0.37));

    for (let index = 0; index < 5; index += 1) {
      const sock = MeshBuilder.CreateBox(`sockProp-${index}`, { width: 0.22, height: 0.78, depth: 0.08 }, this.scene);
      sock.position = new Vector3(44 + index * 2.9, -3.55 + (index % 2) * 0.15, 1.55);
      sock.rotation.z = -0.28 + index * 0.13;
      sock.material = this.createMaterial(`sockPropMat-${index}`, index % 2 === 0 ? CREAM : RESCUE_CORAL, new Color3(0.1, 0.04, 0.04));
    }
  }

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDownBound, { passive: false });
    window.addEventListener("keyup", this.onKeyUpBound, { passive: false });
    window.addEventListener("shoe-adventure:command", this.onCommandBound);
    window.addEventListener("shoe-adventure:startAgent", this.onStartAgentBound);
  }

  private onKeyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    // Standardized to the A/W/D/S/X cluster (all one hand, no reaching) -- Special Move
    // consolidates the old separate Q (Lace Lash) and E (Gum Stomp) keys into X, one
    // button that uses whatever's next in storage (see tryUseSpecialMove). Dash moves onto
    // S (Shift still works too, kept as a soft-compat alias rather than removed outright).
    if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "s", "x", "f", "u", "shift", "r", "escape"].includes(key)) {
      event.preventDefault();
    }
    if (this.superRun && key !== "escape") return;
    if (key === "arrowleft" || key === "a") this.held.left = true;
    if (key === "arrowright" || key === "d") this.held.right = true;
    if (key === "arrowup" || key === "w" || key === " ") this.tryJump();
    if (key === "shift" || key === "s") this.tryDash();
    if (key === "x") this.tryUseSpecialMove();
    if (key === "f") this.tryShoeFormAttack();
    if (key === "u") this.tryUltraMove();
    if (key === "r") this.restart();
    if (key === "escape") this.togglePause();
    if ((key === "enter" || key === " ") && this.mode === "title") this.start();
  }

  private onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") this.held.left = false;
    if (key === "arrowright" || key === "d") this.held.right = false;
  }

  private onCommand(event: CustomEvent<GameCommand>) {
    const command = event.detail;
    if (command === "start") this.start();
    if (command === "restart") this.restart();
    if (command === "pause") this.togglePause();
    if (command === "jump") this.tryJump();
    if (command === "dash") this.tryDash();
    if (command === "specialMove") this.tryUseSpecialMove();
    if (command === "formAttack") this.tryShoeFormAttack();
    if (command === "ultra") this.tryUltraMove();
    if (command === "holdLeft") this.held.left = true;
    if (command === "holdRight") this.held.right = true;
    if (command === "superRun") this.startSuperRun();
    if (command === "celebrate") this.previewReunion();
    if (command === "returnToTitle") this.returnToTitle();
    if (command === "quit") this.quit();
    if (command === "stopAutoRepeat") this.stopAutoRepeat();
    if (command === "muteToggle") {
      this.audio.toggleMute();
      this.publishUi(true);
    }
    if (this.superRun && !["pause", "restart", "quit", "stopAutoRepeat"].includes(command)) return;
    if (command === "releaseLeft") this.held.left = false;
    if (command === "releaseRight") this.held.right = false;
  }

  private start() {
    if (this.mode === "title" || this.mode === "paused") {
      this.audio.init();
      this.audio.startMusic();
      this.runStartedAt = Date.now();
      this.superRun = false;
      this.setAgentActivity("idle", "STANDING BY");
      this.mode = "playing";
      this.message = this.mode === "playing" ? "Every leap gets you closer to your left." : this.message;
      this.publishUi(true);
    }
  }

  private togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.message = "Paused at the stitched route.";
      this.publishUi(true);
    } else if (this.mode === "paused") {
      this.mode = "playing";
      this.message = "Back on the rescue route.";
      this.publishUi(true);
    }
  }

  private restart() {
    this.superRun = false;
    this.setAgentActivity("idle", "STANDING BY");
    this.mode = "playing";
    // damagePlayer's hearts<=0 branch (the normal way this fires, from mode "lost")
    // stops music on death -- without restarting it here, a restart after dying left the
    // rest of the run completely silent, which read as sound having broken rather than
    // the death having correctly stopped it.
    this.audio.startMusic();
    this.player.maxHearts = STARTING_HEARTS;
    this.player.hearts = STARTING_HEARTS;
    this.player.lives = STARTING_LIVES;
    this.player.invulnerable = 1.5;
    this.player.root.setEnabled(true);
    if (this.isSuperRunPreview) {
      const checkpointX = this.activeCheckpoint === "Bedroom Threshold" ? 0 : this.activeCheckpoint === "Lace Bridge" ? 32.4 : 49.7;
      this.player.x = checkpointX;
      this.player.bottom = -4.2;
      this.player.vx = 0;
      this.player.vy = 0;
      this.resetContraptions();
    } else {
      // A full death (hearts hit 0) is a "start over" moment, same as before -- rebuild
      // screen 1 fresh rather than trying to respawn mid-screen.
      this.buildScreenContent(1);
    }
    this.message = "Right Shoe is back on the trail.";
    this.publishUi(true);
  }

  private startSuperRun() {
    // start()'s own audio.init()/startMusic() only fires from a real click on the
    // title screen's LACE UP & LEAP button. The title screen's Super Run and Agent
    // Run buttons are just as real a user gesture, so they need the same call here --
    // without it those two entry points ran the whole showcase in total silence.
    this.audio.init();
    this.audio.startMusic();
    this.mode = "playing";
    this.superRun = true;
    this.runStartedAt = Date.now();
    this.superRunStage = 1;
    this.superRunStageLabel = "SHOEBOX SPRINT";
    this.superRunMilestones.clear();
    this.superRunPauseTimer = 0.8;
    this.superRunAction = "STAGE 1/3 — SHOEBOX SPRINT. AI route locked; scanning the button trail.";
    this.setAgentActivity("advancing", "SHOEBOX SPRINT");
    this.activeCheckpoint = "Bedroom Threshold";
    this.activeCheckpointX = 0;
    this.buttons = 0;
    this.enemiesDefeated = 0;
    this.player.x = 0;
    this.player.bottom = -4.2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.maxHearts = STARTING_HEARTS;
    this.player.hearts = STARTING_HEARTS;
    this.player.lives = STARTING_LIVES;
    this.player.doubleJumps = 0;
    this.player.dashCharges = 0;
    this.player.moonTimer = 0;
    this.player.superJump = false;
    this.player.superJumpTimer = 0;
    this.player.shoeForm = "starter";
    this.player.specialMoveQueue = [];
    this.player.specialMoveCooldown = 0;
    this.player.lashTimer = 0;
    this.player.stompTimer = 0;
    this.player.formAttackTimer = 0;
    this.player.formAttackCooldown = 0;
    this.player.formShieldTimer = 0;
    this.player.ultraMove = false;
    this.player.ultraTimer = 0;
    this.player.ultraCooldown = 0;
    this.bossDefeated = false;
    this.reunionTimer = 0;
    this.applyShoeForm("starter");
    this.player.invulnerable = 2;
    this.player.jumpUsed = false;
    this.player.root.setEnabled(true);
    this.held.left = false;
    this.held.right = true;
    if (this.isSuperRunPreview) {
      // Legacy single-world pipeline: the world already exists (built once in
      // createWorld()), so a restart just resets every entity's live state in place.
      this.pickups.forEach((pickup) => {
        pickup.collected = false;
        pickup.root.setEnabled(true);
      });
      this.enemies.forEach((enemy) => {
        const baseScale = enemy.bossTier === "boss" ? 1.72 : enemy.bossTier === "mini" ? 1.24 : 1;
        enemy.alive = true;
        enemy.defeatTimer = 0;
        enemy.aggro = false;
        enemy.attackState = undefined;
        enemy.attackTimer = undefined;
        enemy.throwCooldown = undefined;
        enemy.x = enemy.minX + 0.35;
        enemy.root.position = new Vector3(enemy.x, enemy.bottom, -0.3);
        enemy.root.rotation.z = 0;
        enemy.root.scaling = new Vector3(baseScale, baseScale, baseScale);
        enemy.root.setEnabled(true);
      });
      this.projectiles.forEach((projectile) => projectile.root.dispose());
      this.projectiles.length = 0;
      this.checkpoints.forEach((checkpoint) => { checkpoint.activated = false; });
      this.levelIndex = 1;
      const unlitMarkerMaterial = this.createMaterial("levelMarkerPostMat-reset", GOLD, new Color3(0.5, 0.16, 0.01));
      this.levelMarkerMeshes.forEach((marker) => {
        marker.touched = false;
        marker.root.getChildMeshes().forEach((mesh) => { mesh.material = unlitMarkerMaterial; });
      });
      this.resetContraptions();
      if (this.leftShoeHalo) this.leftShoeHalo.scaling = Vector3.One();
    } else {
      // Discrete-screens pipeline: every entity gets disposed and rebuilt fresh for
      // screen 1 rather than trying to reset a huge amount of live per-entity state --
      // simpler and always correct, since "fresh" is exactly what a restart means here.
      this.buildScreenContent(1);
    }
    this.publishUi(true);
  }

  /** Same setup as startSuperRun -- route, checkpoints, and camera framing
   * are untouched between the two modes, only the enemy-response decision
   * differs (see updateAgentRun). Kept as its own method rather than a
   * flag on startSuperRun so the two entry points stay easy to read
   * independently as the agent-run feature grows more decision points. */
  /** Fired by the title screen's Agent Run picker (GameCanvas.tsx), once a
   * player has chosen an installed model there -- see catalog.ts and its
   * GET /api/agent/catalog. Title-screen-only, same restriction Dominion's
   * own pre-show picker uses, since choosing a model mid-run makes no
   * sense: the backend/model a run reports (see publishUi's agentBackend/
   * agentModel fields) is meant to describe the run that's actually live. */
  private onStartAgent(event: CustomEvent<{ backend: "ollama"; model: string; auto?: boolean }>) {
    if (this.mode !== "title") return;
    const { backend, model, auto } = event.detail;
    if (!model) return;
    this.agentBackend = backend;
    this.agentModel = model;
    this.isAgentRun = true;
    if (auto) {
      this.autoRepeatActive = true;
      this.autoRepeatWins = 0;
      this.autoRepeatLosses = 0;
      // Keeps the URL resumable for the context-loss auto-reload (see the constructor's
      // onContextLostObservable handler) -- without this, a batch started from the picker
      // (as opposed to a page already carrying ?autoRepeat=1) would reload back to a bare
      // title screen and just silently stop the moment context loss happened once.
      const url = new URL(window.location.href);
      url.searchParams.set("agent", backend);
      url.searchParams.set("model", model);
      url.searchParams.set("autoRepeat", "1");
      window.history.replaceState(null, "", url.toString());
    }
    this.startAgentRun();
  }

  private stopAutoRepeat() {
    this.autoRepeatActive = false;
    // Undo onStartAgent's URL rewrite so a page reload after stopping doesn't
    // silently resurrect the batch the user just told it to stop.
    const url = new URL(window.location.href);
    url.searchParams.delete("agent");
    url.searchParams.delete("model");
    url.searchParams.delete("autoRepeat");
    window.history.replaceState(null, "", url.toString());
    this.publishUi(true);
  }

  /** Called once a run's mode has already been set to "won" or "lost" (see checkRescue's
   * win branch and damagePlayer/handleBoardFall's loss branches) -- if the bulk-testing
   * harness is engaged, tallies the result and either starts the next run automatically
   * or stops itself once either tally reaches AUTO_REPEAT_TARGET. A no-op the rest of the
   * time (autoRepeatActive stays false for an ordinary single run). */
  private handleRunEnded(result: "won" | "lost") {
    if (!this.autoRepeatActive) return;
    if (result === "won") this.autoRepeatWins += 1;
    else this.autoRepeatLosses += 1;
    if (this.autoRepeatWins >= AUTO_REPEAT_TARGET || this.autoRepeatLosses >= AUTO_REPEAT_TARGET) {
      this.autoRepeatActive = false;
      this.publishUi(true);
      return;
    }
    this.publishUi(true);
    // A short beat rather than an instant cut -- long enough for the win/loss splash and
    // this tick's UI update to actually register, short enough that 100 runs don't take
    // forever to accumulate.
    window.setTimeout(() => {
      if (this.disposed || !this.autoRepeatActive) return;
      this.startAgentRun();
    }, 450);
  }

  private startAgentRun() {
    this.startSuperRun();
    this.flushPendingEnemyOutcomes();
    this.agentGoalPending = false;
    this.agentEnemyPending = false;
    this.agentGoal = "advance";
    this.agentGoalTimer = 0;
    this.agentGoalDecisionId = null;
    this.agentStallTimer = 0;
    this.agentStallX = this.player.x;
    this.agentStallStrikes = 0;
    this.despawnMonsterNest();
    this.agentLog.length = 0;
    this.superRunAction = `AGENT RUN — ${this.agentBackend}/${this.agentModel} is driving Right Shoe.`;
    this.message = "AGENT RUN: " + this.superRunAction;
    this.setAgentActivity("advancing", "STARTING RUN");
    this.publishUi(true);
  }

  /** The win and lost screens' "TRY ANOTHER MODEL" action (see GameCanvas.tsx),
   * only shown after a real agent run -- lets a player line up a different
   * model on the picker without a full page reload. Only mode itself needs
   * resetting here: the next startAgentRun() call runs through
   * startSuperRun()'s own full reset (position, hearts, enemies, pickups,
   * checkpoints, contraptions), so there is nothing else this needs to undo. */
  private returnToTitle() {
    if (this.mode !== "won" && this.mode !== "lost") return;
    this.mode = "title";
    this.superRun = false;
    this.isAgentRun = false;
    this.setAgentActivity("idle", "STANDING BY");
    this.reunionTimer = 0;
    this.audio.stopMusic();
    this.publishUi(true);
  }

  /** Unlike returnToTitle() (which only fires from a finished won/lost screen), quit()
   * works from any live state -- mid-play, paused, or an in-progress agent run -- and
   * actually closes things down rather than just switching modes: cancels the one
   * in-flight /api/agent/decide request via AbortController (see agentAbortController),
   * drops every enemy still being tracked for an outcome report so nothing tries to
   * report back after the run is gone, and stops the music, before returning to title. */
  private quit() {
    if (this.agentGoalAbortController) {
      this.agentGoalAbortController.abort();
      this.agentGoalAbortController = null;
    }
    if (this.agentEnemyAbortController) {
      this.agentEnemyAbortController.abort();
      this.agentEnemyAbortController = null;
    }
    this.agentGoalPending = false;
    this.agentEnemyPending = false;
    this.autoRepeatActive = false; // quitting mid-batch stops the bulk-testing harness too
    // Same URL cleanup as stopAutoRepeat -- quitting must not leave a resumable
    // ?autoRepeat=1 URL behind for a later reload to silently pick back up.
    const quitUrl = new URL(window.location.href);
    if (quitUrl.searchParams.has("autoRepeat")) {
      quitUrl.searchParams.delete("agent");
      quitUrl.searchParams.delete("model");
      quitUrl.searchParams.delete("autoRepeat");
      window.history.replaceState(null, "", quitUrl.toString());
    }
    this.agentAskedEnemies.clear();
    this.agentGoal = "advance";
    this.agentGoalTimer = 0;
    this.agentGoalDecisionId = null; // quitting mid-goal is neither a win nor a loss for it -- just drop it, don't report
    this.despawnMonsterNest();
    this.held.left = false;
    this.held.right = false;
    this.superRun = false;
    this.isAgentRun = false;
    this.mode = "title";
    this.setAgentActivity("idle", "STANDING BY");
    this.message = "Lace up. The rescue starts now.";
    this.audio.stopMusic();
    this.publishUi(true);
  }

  private previewReunion() {
    this.superRun = false;
    this.reunionTimer = 6;
    this.mode = "won";
    this.message = "Pair restored! Right Shoe and Left Shoe dance their stitches home.";
    this.held.left = false;
    this.held.right = false;
    // The player never actually moved for this preview (unlike a real win, which only
    // ever fires once the player is already standing at the Left Shoe), so without this
    // the camera -- which always follows player.x -- stays framed on the bedroom
    // threshold at the start of the level while the dance itself plays out ~62 units
    // away, reading as "nothing happens, just an empty room."
    if (this.leftShoe) {
      this.player.x = this.leftShoe.position.x - 0.2;
      this.player.bottom = this.leftShoe.position.y - 0.65;
      this.player.vx = 0;
      this.player.vy = 0;
      // Repositioning the player alone isn't enough: update()'s own mode gate skips
      // updateCamera() entirely once mode is "won" (a real win already has the camera
      // correctly framed, carried over from its last "playing" frame -- but this preview
      // jumps straight to "won" from title, so nothing would ever move the camera here
      // otherwise). Set it directly and instantly, matching updateCamera()'s own
      // non-spectator formula (superRun is false above) rather than its per-frame lerp.
      const targetX = Math.max(0, Math.min(this.worldEnd - 3, this.player.x - 1.8));
      this.camera.position.x = targetX;
      this.camera.position.y = -0.55;
      this.camera.setTarget(new Vector3(targetX + 1.2, -0.4, 0));
    }
    if (this.leftShoeHalo) this.leftShoeHalo.scaling = new Vector3(1.52, 1.52, 1.52);
    if (this.leftShoe) this.spawnSparks(this.leftShoe.position.x, this.leftShoe.position.y + 0.25, RESCUE_CORAL, 46, 4.2);
    this.publishUi(true);
  }

  private tryJump() {
    if (this.mode === "title") {
      this.start();
      return;
    }
    if (this.mode !== "playing") return;
    if (this.player.grounded) {
      const jumpPower = this.player.superJump ? 12.6 : 8.9;
      this.player.vy = jumpPower;
      this.player.superJumpTimer = this.player.superJump ? 0.46 : 0;
      this.player.grounded = false;
      this.player.jumpUsed = false;
      this.message = this.player.superJump ? "SUPER JUMP! Right Shoe launches toward the bonus lane." : this.message;
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.18, this.player.superJump ? CYAN : CREAM, this.player.superJump ? 16 : 6, this.player.superJump ? 3.3 : 1.7);
      this.audio.playJump();
    } else if (!this.player.jumpUsed && this.player.doubleJumps > 0) {
      this.player.doubleJumps -= 1;
      this.player.jumpUsed = true;
      this.player.vy = 8.25;
      this.message = "Wingtip Feather lifts the rescue route.";
      this.spawnSparks(this.player.x, this.player.bottom + 0.5, GOLD, 11, 2.3);
      this.audio.playJump();
      this.publishUi(true);
    }
  }

  private tryDash() {
    if (this.mode !== "playing" || this.player.dashCharges <= 0 || this.player.dashCooldown > 0) return;
    this.player.dashCharges -= 1;
    this.player.dashTimer = this.superRun ? 0.42 : 0.26;
    this.player.dashCooldown = 0.18;
    this.player.invulnerable = 0.28;
    this.player.vx = this.player.facing * 20;
    this.triggerCinematicBeat(0.12, 0.06);
    this.message = "Lace Dash burns a coral trail.";
    this.spawnSparks(this.player.x - this.player.facing * 0.42, this.player.bottom + 0.62, RESCUE_CORAL, 14, 3.4);
    this.spawnImpactRing(this.player.x, this.player.bottom + 0.62, RESCUE_CORAL, 0.52);
    this.publishUi(true);
  }

  private applyShoeForm(form: ShoeForm) {
    this.player.shoeForm = form;
    const styles: Record<ShoeForm, { glow: Color3; y: number; z: number }> = {
      starter: { glow: RESCUE_CORAL, y: 1, z: 1 },
      coralChrome: { glow: GOLD, y: 1, z: 1.04 },
      moonstep: { glow: CYAN, y: 1.07, z: 1 },
      pump: { glow: RESCUE_CORAL, y: 1.1, z: 0.94 },
      hightop: { glow: CYAN, y: 1.16, z: 1.04 },
      loafer: { glow: MOSS, y: 0.94, z: 1.12 },
      cowboy: { glow: new Color3(0.9, 0.38, 0.08), y: 1.14, z: 1.08 },
      sneaker: { glow: VIOLET, y: 1.02, z: 1.16 },
    };
    const style = styles[form];
    if (this.heroHalo) {
      const material = this.heroHalo.material as StandardMaterial | null;
      if (material) {
        material.diffuseColor = style.glow;
        material.emissiveColor = style.glow.scale(0.52);
        material.alpha = form === "starter" ? 0.1 : 0.18;
      }
    }
    this.player.root.scaling.y = style.y;
    this.player.root.scaling.z = style.z;
  }

  private shoeFormAttackLabel(form = this.player.shoeForm) {
    const attacks: Partial<Record<ShoeForm, string>> = {
      pump: "HEEL STRIKE",
      hightop: "ANKLE GUARD",
      loafer: "SLIP SLIDE",
      cowboy: "SPUR KICK",
      sneaker: "SPRINT BURST",
    };
    return attacks[form] ?? "";
  }

  private tryShoeFormAttack() {
    const form = this.player.shoeForm;
    const attack = this.shoeFormAttackLabel(form);
    if (this.mode !== "playing" || !attack || this.player.formAttackCooldown > 0) return;

    this.player.formAttackCooldown = form === "hightop" ? 1.45 : 1.05;
    this.player.formAttackTimer = form === "hightop" ? 0.96 : this.superRun ? 0.76 : 0.52;
    this.player.invulnerable = Math.max(this.player.invulnerable, form === "hightop" ? 1.45 : 0.42);

    // gumArmored enemies (the Gum Turret) sit out every form attack -- only tryGumStomp
    // is allowed to defeat one, so the ability keeps a reason to matter on its own.
    const near = (range: number, forward = false) => this.enemies.filter((enemy) =>
      enemy.alive && !enemy.gumArmored && Math.abs(enemy.bottom - this.player.bottom) < 2.55 && Math.abs(enemy.x - this.player.x) < range && (!forward || (enemy.x - this.player.x) * this.player.facing > -0.28),
    );
    let targets: Enemy[] = [];
    let color = RESCUE_CORAL;

    if (form === "pump") {
      targets = near(2.75).filter((enemy) => !enemy.bossTier);
      color = RESCUE_CORAL;
      if (this.player.grounded)       this.player.vy = 4.9;
      this.triggerCinematicBeat(0.2, 0.1);
      this.spawnSparks(this.player.x, this.player.bottom + 0.28, color, 28, 4.4);
      this.spawnImpactRing(this.player.x, this.player.bottom + 0.3, color, 0.92);

    }
    if (form === "hightop") {
      this.player.formShieldTimer = 1.45;
      targets = near(1.65).filter((enemy) => !enemy.bossTier);
      color = CYAN;
      this.triggerCinematicBeat(0.18, 0.08);
      this.spawnSparks(this.player.x, this.player.bottom + 0.78, color, 22, 3.1);
      this.spawnImpactRing(this.player.x, this.player.bottom + 0.78, color, 1.08);
    }
    if (form === "loafer") {
      targets = near(3.45, true).filter((enemy) => !enemy.bossTier);
      color = MOSS;
      this.player.vx = this.player.facing * 16.5;
      this.triggerCinematicBeat(0.14, 0.07);
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.48, color, 20, 3.8);
      this.spawnImpactRing(this.player.x + this.player.facing * 0.5, this.player.bottom + 0.48, color, 0.78);
    }
    if (form === "cowboy") {
      targets = near(5.15, true).filter((enemy) => !enemy.bossTier);
      color = GOLD;
      this.player.vx = this.player.facing * 8.4;
      this.triggerCinematicBeat(0.22, 0.1);
      this.spawnSparks(this.player.x + this.player.facing * 1.55, this.player.bottom + 0.78, color, 24, 4.6);
      this.spawnImpactRing(this.player.x + this.player.facing * 1.35, this.player.bottom + 0.78, color, 1.04);
    }
    if (form === "sneaker") {
      targets = near(4.9, true).filter((enemy) => enemy.bossTier !== "mini" && enemy.bossTier !== "boss");
      color = VIOLET;
      this.player.vx = this.player.facing * 21;
      this.triggerCinematicBeat(0.18, 0.08);
      this.spawnSparks(this.player.x - this.player.facing * 0.44, this.player.bottom + 0.62, color, 26, 4.8);
      this.spawnImpactRing(this.player.x + this.player.facing * 0.65, this.player.bottom + 0.62, color, 0.86);
    }

    if (this.superRun) this.superRunPauseTimer = Math.max(this.superRunPauseTimer, form === "hightop" ? 0.86 : 0.68);
    targets.forEach((enemy) => this.defeatEnemy(enemy));
    const suffix = targets.length > 0 ? `clears ${targets.length} shoe fiend${targets.length === 1 ? "" : "s"}.` : "charges the route ahead.";
    this.message = `${attack} — ${suffix}`;
    if (this.superRun) this.superRunAction = `${attack} — transformation attack demonstrated.`;
    this.publishUi(true);
  }

  private tryUltraMove() {
    if (this.mode !== "playing" || !this.player.ultraMove || this.player.ultraCooldown > 0) return;
    // The automated finale uses a wider, vertical-tolerant strike lane so a cinematic jump or recovery cannot leave the Boss unreachable.
    const strikeRange = this.superRun ? 8.8 : 5.6;
    const verticalRange = this.superRun ? 12 : 7.4;
    const boss = this.enemies.find((enemy) =>
      enemy.alive && enemy.bossTier === "boss" && Math.abs(enemy.x - this.player.x) < strikeRange && Math.abs(enemy.bottom - this.player.bottom) < verticalRange,
    );
    if (!boss) {
      this.message = "ULTRA MOVE is charged — bring The Tangled Titan into the stitched strike lane.";
      this.publishUi(true);
      return;
    }
    this.player.ultraCooldown = 1.5;
    this.player.ultraTimer = this.superRun ? 1.42 : 1.08;
    this.player.invulnerable = Math.max(this.player.invulnerable, 1.15);
    this.player.vx = this.player.facing * 13.5;
    if (this.superRun) this.superRunPauseTimer = Math.max(this.superRunPauseTimer, 1.05);
    this.triggerCinematicBeat(0.36, 0.2);
    this.spawnLightningSuperSmash(boss.x, boss.bottom + 0.72);
    this.spawnSparks(this.player.x + this.player.facing * 1.35, this.player.bottom + 0.82, VIOLET, 46, 5.5);
    this.defeatEnemy(boss);
    this.bossDefeated = true;
    this.message = "LIGHTNING SUPER SMASH — Prismatic Sole Breaker unravels The Tangled Titan!";
    if (this.superRun) this.setAgentActivity("usingUltra", "SUPER SMASH");
    this.publishUi(true);
  }

  private spawnLightningSuperSmash(x: number, y: number) {
    // Three brief, jagged bolts create a readable lightning finisher without leaving persistent scene objects behind.
    [-0.46, 0, 0.46].forEach((offset, index) => {
      const bolt = MeshBuilder.CreateLines(`superSmashBolt-${this.titleTime}-${index}`, {
        points: [
          new Vector3(x + offset, y + 5.4, -0.78),
          new Vector3(x - 0.22 + offset, y + 3.45, -0.78),
          new Vector3(x + 0.24 + offset, y + 2.15, -0.78),
          new Vector3(x - 0.34 + offset, y + 0.2, -0.78),
        ],
      }, this.scene);
      bolt.color = index === 1 ? CREAM : CYAN;
      bolt.alpha = 0.96;
      bolt.isPickable = false;
      this.sparks.push({ mesh: bolt, velocity: new Vector3(0, -0.25, 0), life: 0.36, maxLife: 0.36 });
    });
    this.spawnSparks(x, y + 0.55, CYAN, 30, 5.7);
    this.spawnSparks(x, y + 0.42, GOLD, 20, 4.4);
  }

  private hasSpecialMove(kind: SpecialMoveKind): boolean {
    return this.player.specialMoveQueue.includes(kind) && this.player.specialMoveCooldown <= 0;
  }

  /** The single Special Move key/action -- pops the given kind (agent, an active named
   * choice) or the oldest queued item (human, "just use my next special move") out of
   * inventory and executes it. Both tryLaceLash/tryGumStomp below are pure execution now --
   * no unlock check, no cooldown of their own -- this is the only gate. */
  private tryUseSpecialMove(kind?: SpecialMoveKind) {
    if (this.mode !== "playing" || this.player.specialMoveCooldown > 0) return;
    const index = kind ? this.player.specialMoveQueue.indexOf(kind) : 0;
    if (index === -1 || this.player.specialMoveQueue.length === 0) return;
    const used = this.player.specialMoveQueue[index];
    this.player.specialMoveQueue.splice(index, 1);
    this.player.specialMoveCooldown = 0.9;
    if (used === "gumStomp") this.tryGumStomp();
    else this.tryLaceLash();
    this.publishUi(true);
  }

  private tryLaceLash() {
    this.player.lashTimer = this.superRun ? 0.58 : 0.34;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.32);
    const targets = this.enemies.filter((enemy) =>
      enemy.alive && !enemy.gumArmored && (enemy.x - this.player.x) * this.player.facing > -0.35 && (enemy.x - this.player.x) * this.player.facing < 3.45 && Math.abs(enemy.bottom - this.player.bottom) < 2.1,
    );
    this.triggerCinematicBeat(0.18, 0.08);
    this.spawnSparks(this.player.x + this.player.facing * 1.15, this.player.bottom + 0.72, CREAM, 16, 3.8);
    this.spawnImpactRing(this.player.x + this.player.facing * 1.05, this.player.bottom + 0.72, CREAM, 0.72);
    targets.forEach((enemy) => this.damageEnemy(enemy));
    this.message = targets.length > 0 ? `Lace Lash snaps ${describeEnemyTargets(targets)} off the route.` : "Lace Lash cracks across the stitched air.";
    this.publishUi(true);
  }

  private tryGumStomp() {
    this.player.stompTimer = this.superRun ? 0.66 : 0.42;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.48);
    if (this.player.grounded) this.player.vy = 4.2;
    const targets = this.enemies.filter((enemy) => enemy.alive && Math.abs(enemy.x - this.player.x) < 2.45 && Math.abs(enemy.bottom - this.player.bottom) < 2.35);
    this.triggerCinematicBeat(0.2, 0.09);
    this.spawnSparks(this.player.x, this.player.bottom + 0.34, MOSS, 22, 4.1);
    this.spawnImpactRing(this.player.x, this.player.bottom + 0.28, MOSS, 0.96);
    targets.forEach((enemy) => this.damageEnemy(enemy));
    this.message = targets.length > 0 ? `Gum Stomp sticks ${describeEnemyTargets(targets)} in place — then bounces clear!` : "Gum Stomp lands with a bright sticky bounce.";
    this.publishUi(true);
  }

  private update(delta: number) {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - delta);
      return; // true freeze-frame -- see triggerHitStop's own docstring
    }
    this.titleTime += delta;
    this.popupTimer = Math.max(0, this.popupTimer - delta);
    this.updateDecor(delta);
    if (this.mode === "title") {
      if (this.isDemo) this.start();
      this.player.root.position.y = -4.2 + Math.sin(this.titleTime * 2.6) * 0.12;
      this.player.root.rotation.z = Math.sin(this.titleTime * 2.2) * 0.04;
      return;
    }
    if (this.mode !== "playing") return;

    this.updateContraptions(delta);
    if (this.isDemo) this.updateDemo(delta);
    if (this.superRun && this.isAgentRun) this.updateAgentRun(delta);
    else if (this.superRun) this.updateSuperRun(delta);
    this.updatePlayer(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.updatePickups(delta);
    this.updateCheckpoints();
    this.updateLevelMarkers();
    this.updateScreenExit();
    this.updateCrumblePlatforms(delta);
    this.updateSparks(delta);
    this.updateCamera(delta);
    this.updateMusicIntensity(delta);
    this.checkRescue();
    this.publishUi(false);
  }

  /** Ticks every crumble platform's vanish-then-respawn cycle. Landing on one sets
   * crumbleTimer (in updatePlayer's collision loop); once that reaches zero the mesh
   * hides and stops colliding, then respawnTimer brings it back so the lane is never
   * permanently blocked by one mistimed crossing. */
  private updateCrumblePlatforms(delta: number) {
    for (const platform of this.platforms) {
      if (platform.special !== "crumble") continue;
      if (!platform.crumbled && platform.crumbleTimer !== undefined) {
        platform.crumbleTimer -= delta;
        const shake = Math.max(0, 0.06 - platform.crumbleTimer * 0.05);
        platform.mesh.position.x = platform.x + Math.sin(this.titleTime * 42) * shake;
        if (platform.crumbleTimer <= 0) {
          platform.crumbled = true;
          platform.crumbleTimer = undefined;
          platform.respawnTimer = 2.6;
          platform.mesh.setEnabled(false);
          this.spawnSparks(platform.x, platform.top, new Color3(0.56, 0.44, 0.28), 12, 2.4);
        }
      } else if (platform.crumbled && platform.respawnTimer !== undefined) {
        platform.respawnTimer -= delta;
        if (platform.respawnTimer <= 0) {
          platform.crumbled = false;
          platform.respawnTimer = undefined;
          platform.mesh.position.x = platform.x;
          platform.mesh.setEnabled(true);
          this.spawnSparks(platform.x, platform.top, CREAM, 10, 2.0);
        }
      }
    }
  }

  /** A live enemy or boss within earshot of the player nudges the music's intense layer
   * up; nothing nearby lets it fade back to the calm bed. Recomputed every frame rather
   * than event-driven, since "nearby" is a continuous, moving condition. */
  private updateMusicIntensity(delta: number) {
    const threatRange = 9;
    const nearThreat = this.enemies.some((enemy) => enemy.alive && Math.abs(enemy.x - this.player.x) < threatRange);
    this.audio.setIntensity(nearThreat ? 1 : 0);
    this.audio.update(delta);
  }

  private updateContraptions(delta: number) {
    const buttonRun = this.contraptions.find((contraption) => contraption.kind === "buttonRun");
    const laceLever = this.contraptions.find((contraption) => contraption.kind === "laceLever");
    const gumPress = this.contraptions.find((contraption) => contraption.kind === "gumPress");
    const spoolLift = this.contraptions.find((contraption) => contraption.kind === "spoolLift");

    if (buttonRun && !buttonRun.activated && this.player.x > 9.3 && this.player.x < 14.5 && this.buttons >= 3) {
      this.activateContraption(buttonRun, "BUTTON BALL RUN — coral button released down the shoebox rail.");
      this.player.dashCharges += 1;
    }
    if (laceLever && !laceLever.activated && this.player.lashTimer > 0 && Math.abs(this.player.x - laceLever.x) < 3.1) {
      this.activateContraption(laceLever, "LACE LEVER — dominoes topple and stitch the bridge tight.");
    }
    if (gumPress && !gumPress.activated && this.player.stompTimer > 0 && Math.abs(this.player.x - gumPress.x) < 3.1) {
      this.activateContraption(gumPress, "GUM STOMP PRESS — the spring ramp pops toward the rescue tower.");
      this.player.vy = Math.max(this.player.vy, 7.4);
    }
    if (spoolLift && !spoolLift.activated && gumPress?.activated && this.player.x > 57.0) {
      this.activateContraption(spoolLift, "SPOOL LIFT — thread winch raises the final rescue latch.");
      if (this.leftShoeHalo) this.leftShoeHalo.scaling = new Vector3(1.22, 1.22, 1.22);
    }

    this.contraptions.forEach((contraption) => {
      if (!contraption.activated) return;
      contraption.progress = Math.min(1, contraption.progress + delta * 1.6);
      const eased = 1 - Math.pow(1 - contraption.progress, 3);
      if (contraption.kind === "buttonRun") {
        const ball = contraption.parts[1];
        ball.position.x = -1.18 + eased * 2.35;
        ball.rotation.z += delta * 11;
        contraption.parts[2].scaling.setAll(1 + Math.sin(this.titleTime * 12) * 0.12 * eased);
      }
      if (contraption.kind === "laceLever") {
        contraption.parts[1].rotation.z = 0.24 - eased * 0.82;
        contraption.parts.slice(3).forEach((domino, index) => {
          const local = Math.max(0, Math.min(1, (contraption.progress - index * 0.1) * 4.4));
          domino.rotation.z = -local * 1.28;
        });
      }
      if (contraption.kind === "gumPress") {
        contraption.parts[0].position.y = 0.24 - eased * 0.16;
        contraption.parts[1].scaling.y = 1 - eased * 0.36;
        contraption.parts[2].rotation.z = 0.34 - eased * 0.58;
      }
      if (contraption.kind === "spoolLift") {
        contraption.parts[0].rotation.x += delta * 7.5;
        contraption.parts[1].rotation.z += delta * 7.5;
        contraption.parts[3].position.y = 2.75 + eased * 0.42;
      }
    });
  }

  private activateContraption(contraption: Contraption, callout: string) {
    contraption.activated = true;
    contraption.progress = 0;
    this.message = callout;
    this.spawnSparks(contraption.x, contraption.root.position.y + 0.95, contraption.kind === "gumPress" ? MOSS : contraption.kind === "spoolLift" ? CYAN : GOLD, 19, 3.2);
    if (this.superRun) this.superRunAction = callout;
    this.publishUi(true);
  }

  private resetContraptions() {
    this.contraptions.forEach((contraption) => {
      contraption.activated = false;
      contraption.progress = 0;
      if (contraption.kind === "buttonRun") {
        contraption.parts[1].position.x = -1.18;
        contraption.parts[1].rotation.z = 0;
        contraption.parts[2].scaling = Vector3.One();
      }
      if (contraption.kind === "laceLever") {
        contraption.parts[1].rotation.z = 0.24;
        contraption.parts.slice(3).forEach((domino) => { domino.rotation.z = 0; });
      }
      if (contraption.kind === "gumPress") {
        contraption.parts[0].position.y = 0.24;
        contraption.parts[1].scaling.y = 1;
        contraption.parts[2].rotation.z = 0.34;
      }
      if (contraption.kind === "spoolLift") {
        contraption.parts[0].rotation.x = 0;
        contraption.parts[1].rotation.z = 0;
        contraption.parts[3].position.y = 2.75;
      }
    });
  }

  private updateDemo(delta: number) {
    this.held.right = this.player.x < 63.2;
    this.demoJumpTimer -= delta;
    const upcomingHeight = this.platforms.some(
      (platform) =>
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < 2.2 &&
        platform.top > this.player.bottom + 0.2,
    );
    if (this.player.grounded && this.demoJumpTimer <= 0 && (upcomingHeight || Math.floor(this.player.x) % 9 === 0)) {
      this.tryJump();
      this.demoJumpTimer = 1.25;
    }
    if (this.player.dashCharges > 0 && this.player.x > 21 && this.player.dashCooldown <= 0) this.tryDash();
  }

  /** The scripted demo's own stall watchdog -- see superRunStallTimer's own comment on why
   * this exists. Unlike checkAgentStall (nudge, then escalate, giving a free-choosing agent
   * room to actually solve it itself) this is a blunt instrument on purpose: the scripted
   * path has no decision loop to give room to, so a stall just means something is
   * unconditionally broken and needs to be forced past, not negotiated with. Clears the
   * pause gate directly, removes anything within reach outright, and shoves the player
   * forward -- a real fix for the specific cause found this session is better than this,
   * but this backstop means a *future* one degrades to "a brief visible stutter" instead of
   * "the demo is stuck forever with no self-recovery." */
  private checkSuperRunStall(delta: number) {
    if (Math.abs(this.player.x - this.superRunStallX) > 0.6) {
      this.superRunStallX = this.player.x;
      this.superRunStallTimer = 0;
      return;
    }
    this.superRunStallTimer += delta;
    if (this.superRunStallTimer < 6) return;
    this.superRunStallTimer = 0;
    this.superRunStallX = this.player.x;
    this.superRunPauseTimer = 0;
    this.enemies.filter((enemy) => enemy.alive && Math.abs(enemy.x - this.player.x) < 3).forEach((enemy) => this.defeatEnemy(enemy));
    this.player.vx = 9;
    this.player.x += 1.5;
    this.logAgent(`⚠ AI SUPER RUN stalled 6s at x=${this.player.x.toFixed(1)} — forced past it`);
  }

  private updateSuperRun(delta: number) {
    this.superRunKickTimer = Math.max(0, this.superRunKickTimer - delta);
    this.superRunPauseTimer = Math.max(0, this.superRunPauseTimer - delta);
    this.checkSuperRunStall(delta);
    this.held.left = false;
    this.held.right = this.player.x < 63.2 && this.superRunPauseTimer <= 0;
    if (this.superRunPauseTimer > 0 && this.player.dashTimer <= 0 && this.player.formAttackTimer <= 0 && this.player.ultraTimer <= 0) {
      this.player.vx *= Math.max(0.22, 1 - delta * 8.5);
    }

    // Spectator mode favors a graceful recovery over a failed run: restore the hero to the safe base lane if a transformation dash drops below the route.
    if (this.player.bottom < -6.6) {
      this.player.bottom = -4.2;
      this.player.vy = 0;
      this.player.vx = 6.4;
      this.player.grounded = true;
      this.player.invulnerable = Math.max(this.player.invulnerable, 1.25);
      this.setAgentActivity("fallback", "AI RECOVERY");
    }

    // Let every pickup, attack, and device read on screen before the autonomous script evaluates its next beat.
    if (this.superRunPauseTimer > 0) return;

    const x = this.player.x;
    if (x >= 24.1) this.enterSuperRunStage(2, "LAUNDRY LABYRINTH", "Lace Bridge");
    if (x >= 44.4) this.enterSuperRunStage(3, "ROGUE TOWER BREAK", "Moonlit Shoeboxes");

    // STAGE 1 — collect every early patch, trigger the Button Ball Run, then use vertical mobility to reach the shoebox exit.
    if (x >= 5.4 && this.markSuperRunMilestone("stage-1-button-trail", "STAGE 1/3 — button trail vacuumed; the Button Ball Run is primed.")) {
      this.sweepSuperRunPickups(0, 6.9, "BUTTON TRAIL");
    }
    if (x >= 6.72 && this.markSuperRunMilestone("pump", "PUMP FORM — Heel Strike demolishes the starter pair.")) this.claimSuperRunPowerup("pump", "PUMP FORM — Heel Strike demolishes the starter pair.");
    if (x >= 8.2 && this.markSuperRunMilestone("feather-one", "WINGTIP FLIGHT — the AI lines up a double-jump.")) this.claimSuperRunPowerup("feather", "WINGTIP FLIGHT — double-jump unlocked.");
    if (!this.player.grounded && !this.player.jumpUsed && this.player.doubleJumps > 0 && x >= 8.7 && x <= 10.8 && this.markSuperRunMilestone("double-jump", "DOUBLE JUMP — Wingtip Feather clears the shoebox lip.")) this.tryJump();
    if (x >= 10.15 && this.markSuperRunMilestone("button-run", "BUTTON BALL RUN — the AI releases the coral button down its rail.")) this.activateSuperRunContraption("buttonRun", "BUTTON BALL RUN — coral button released down the shoebox rail.");
    if (x >= 11.72 && this.markSuperRunMilestone("super-jump", "SUPER JUMP PATCH — spring-loaded soles target the Sky Stitch cache.")) this.claimSuperRunPowerup("superJump", "SUPER JUMP PATCH — spring-loaded soles armed.");
    if (x >= 12.72 && this.markSuperRunMilestone("coral-chrome", "CORAL CHROME — the hero shine upgrades for the long run.")) this.claimSuperRunPowerup("chrome", "CORAL CHROME — hero shine upgraded.");
    if (x >= 14.8 && this.markSuperRunMilestone("bonus-cache", "SKY STITCH BONUS — an aerial cache awards an extra dash charge.")) this.claimSuperRunPowerup("bonus", "SKY STITCH BONUS — Super Jump snatches the aerial cache.");
    if (x >= 16.02 && this.markSuperRunMilestone("hightop", "HIGHTOP FORM — Ankle Guard counters the elevated pair.")) this.claimSuperRunPowerup("hightop", "HIGHTOP FORM — Ankle Guard counters the elevated pair.");
    if (x >= 18.82 && this.markSuperRunMilestone("dash-one", "LACE DASH — the AI bursts through the first long lane.")) this.claimSuperRunPowerup("dash", "LACE DASH — coral boost charged.");
    if (x >= 19.35 && this.player.dashCharges > 0 && this.player.dashCooldown <= 0 && this.markSuperRunMilestone("dash-demonstration", "LACE DASH — a high-speed route correction skips the laundry gap.")) this.tryDash();
    if (x >= 23.5 && this.markSuperRunMilestone("stage-1-complete", "STAGE 1 CLEAR — all shoebox foes and patches are reconciled before the bridge.")) {
      this.sweepSuperRunPickups(0, 24.3, "STAGE 1 PATCH SWEEP");
      this.clearSuperRunEnemies(0, 24.3, "STAGE 1 ROUTE SWEEP");
    }

    // STAGE 2 — switch forms twice, restore health, and deliberately operate the Lace Lever.
    if (x >= 26.1 && this.markSuperRunMilestone("loafer", "LOAFER FORM — Slip Slide sweeps the laundry ledge.")) this.claimSuperRunPowerup("loafer", "LOAFER FORM — Slip Slide sweeps the laundry ledge.");
    if (x >= 29.95 && this.markSuperRunMilestone("moonstep", "MOONSTEP RUNNER — the cobalt traversal form handles the lace bridge.")) this.claimSuperRunPowerup("moonstep", "MOONSTEP RUNNER — cobalt speed form unlocked.");
    if (x >= 31.0 && this.player.grounded && this.markSuperRunMilestone("moonstep-jump", "MOONSTEP LEAP — the AI keeps altitude above the lace bridge.")) this.tryJump();
    if (x >= 33.0 && this.markSuperRunMilestone("heart-one", "HEART SOLE — route integrity is restored before the bridge guard.")) this.claimSuperRunPowerup("heart", "HEART SOLE — route integrity restored.");
    if (x >= 35.2 && this.markSuperRunMilestone("stage-2-patch-sweep", "LAUNDRY LABYRINTH — the AI has recovered every bridge-side patch.")) this.sweepSuperRunPickups(24.3, 39.5, "STAGE 2 PATCH SWEEP");
    if (x >= 36.4 && this.player.dashCharges > 0 && this.player.dashCooldown <= 0 && this.markSuperRunMilestone("bridge-dash", "MOONSTEP + LACE DASH — the AI corrects across the bridge.")) this.tryDash();
    if (x >= 39.72 && this.markSuperRunMilestone("cowboy", "COWBOY BOOT FORM — Spur Kick reaches across the bridge sentries.")) this.claimSuperRunPowerup("cowboy", "COWBOY BOOT FORM — Spur Kick clears the bridge sentries.");
    if (x >= 41.72 && this.markSuperRunMilestone("lace-lash", "LACE LASH — the AI snaps the Lace Lever and topples its stitch dominoes.")) {
      this.claimSuperRunPowerup("lash", "LACE LASH — thread-whip armed.");
      this.player.specialMoveCooldown = 0;
      this.tryUseSpecialMove("laceLash");
      this.activateSuperRunContraption("laceLever", "LACE LEVER — AI lash topples the dominoes and stitches the bridge tight.");
    }
    if (x >= 43.7 && this.markSuperRunMilestone("stage-2-complete", "STAGE 2 CLEAR — the bridge guard and every laundry-lane foe are resolved.")) {
      this.sweepSuperRunPickups(24.3, 44.6, "STAGE 2 PATCH SWEEP");
      this.clearSuperRunEnemies(24.3, 44.6, "STAGE 2 ROUTE SWEEP");
    }

    // STAGE 3 — a final recovery, Gum Press setup, mini-boss, lightning Super Smash, Boss kill, and tower reunion.
    if (x >= 46.65 && this.markSuperRunMilestone("sneaker", "SNEAKER FORM — Sprint Burst chains through the Tower Break vanguard.")) this.claimSuperRunPowerup("sneaker", "SNEAKER FORM — Sprint Burst chains through the Tower Break vanguard.");
    if (x >= 47.1 && this.markSuperRunMilestone("moon", "MOON INSOLE — the AI slows the tower vanguard for a clean final setup.")) this.claimSuperRunPowerup("moon", "MOON INSOLE — enemies slowed for the finale.");
    if (x >= 50.2 && this.markSuperRunMilestone("stage-3-patch-sweep", "TOWER BREAK — every remaining route patch is indexed before the final gate.")) this.sweepSuperRunPickups(44.6, 53.3, "STAGE 3 PATCH SWEEP");
    if (x >= 52.75 && this.markSuperRunMilestone("feather-two", "FINAL WINGTIP — a second double-jump token secures the high recovery line.")) this.claimSuperRunPowerup("feather", "FINAL WINGTIP — high lane secured.");
    if (x >= 53.08 && this.markSuperRunMilestone("tower-risk-check", "RISK CHECK — the AI absorbs a controlled tower graze, preserving one heart for the recovery test.")) {
      this.player.hearts = Math.max(1, this.player.hearts - 1);
      this.player.invulnerable = Math.max(this.player.invulnerable, 0.6);
      this.spawnSparks(this.player.x, this.player.bottom + 0.65, RESCUE_CORAL, 12, 2.6);
    }
    if (x >= 53.35 && this.markSuperRunMilestone("tower-heart", "HEALTH POWER-UP — the AI takes the Heart Sole before committing to the mini-boss.")) this.claimSuperRunPowerup("heart", "HEALTH POWER-UP — Heart Sole restores the Tower Break safety margin.");
    if (x >= 54.72 && this.markSuperRunMilestone("gum-stomp", "GUM STOMP — the AI arms the sticky impact that powers the tower ramp.")) {
      this.claimSuperRunPowerup("gum", "GUM STOMP — sticky sole impact armed.");
      this.player.specialMoveCooldown = 0;
      this.tryUseSpecialMove("gumStomp");
      this.activateSuperRunContraption("gumPress", "GUM PRESS — AI Gum Stomp compresses the ramp for the tower approach.");
    }
    if (x >= 55.95 && this.markSuperRunMilestone("tower-mini-boss", "MINI-BOSS — Gum Marshal enters; the AI performs a measured Gum Stomp break.")) {
      // Guarantee a real inventory item to consume here regardless of whether the
      // gum-stomp milestone above already spent the one from claimSuperRunPowerup.
      this.player.specialMoveQueue.push("gumStomp");
      this.player.specialMoveCooldown = 0;
      this.tryUseSpecialMove("gumStomp");
      // tryGumStomp above now only staggers a multi-hit mini-boss (see damageEnemy) instead
      // of always finishing it in one hit -- this scripted beat is a guaranteed one-shot
      // trigger with no retry, and the narrow 54.8-57.9 position window below wasn't wide
      // enough to reliably still catch a patrolling Gum Marshal on the sweep either, so
      // live-tested this stalled the whole demo with the boss alive and staggered forever.
      // Look the mini-boss up directly by identity and finish it, not by position.
      const gumMarshal = this.enemies.find((enemy) => enemy.alive && enemy.bossTier === "mini");
      if (gumMarshal) this.defeatEnemy(gumMarshal);
      this.clearSuperRunEnemies(54.8, 57.9, "GUM MARSHAL MINI-BOSS BREAK");
    }
    if (x >= 57.2 && this.markSuperRunMilestone("spool-lift", "SPOOL LIFT — the AI winds the final rescue latch while the tower lane clears.")) this.activateSuperRunContraption("spoolLift", "SPOOL LIFT — thread winch raises the final rescue latch.");
    if (x >= 58.05 && this.markSuperRunMilestone("dash-two", "FINAL LACE DASH — the AI enters the Boss finishing lane.")) this.claimSuperRunPowerup("dash", "FINAL LACE DASH — boost charged for the finish.");
    if (x >= 58.22 && this.markSuperRunMilestone("ultra", "SUPER SMASH CORE — lightning finisher locks onto The Tangled Titan.")) this.claimSuperRunPowerup("ultra", "SUPER SMASH CORE — lightning finisher locks onto The Tangled Titan.");
    if (x >= 58.32 && this.markSuperRunMilestone("final-coverage", "FINAL ROUTE AUDIT — every remaining patch and non-Boss enemy is resolved before the lightning finisher.")) {
      this.sweepSuperRunPickups(53.3, WORLD_END + 1, "FINAL PATCH SWEEP");
      this.clearSuperRunEnemies(44.6, 58.3, "TOWER VANGUARD SWEEP");
    }

    const platformAhead = this.platforms.some(
      (platform) =>
        !platform.crumbled &&
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < 2.35 &&
        platform.top > this.player.bottom + 0.18,
    );
    const showcaseBeat = [7.15, 13.3, 16.35, 21.1, 26.6, 35.1, 40.1, 42.0, 47.0, 51.1, 58.0].some((beat) => Math.abs(this.player.x - beat) < 0.16);
    if (this.player.grounded && (platformAhead || showcaseBeat) && this.superRunPauseTimer <= 0) this.tryJump();

    const bossInUltraRange = this.enemies.find(
      (enemy) => enemy.alive && enemy.bossTier === "boss" && Math.abs(enemy.x - this.player.x) < 8.8,
    );
    if (bossInUltraRange && this.player.ultraMove && this.player.ultraCooldown <= 0) this.tryUltraMove();

    const target = this.enemies.find(
      (enemy) => enemy.alive && enemy.x - this.player.x < 1.38 && enemy.x >= this.player.x - 0.8,
    );
    if (target) {
      if (target.bossTier === "boss" && this.player.ultraMove && this.player.ultraCooldown <= 0) {
        this.tryUltraMove();
      } else if (target.bossTier === "boss") {
        this.setAgentActivity("targeting", "BOSS GATE");
      } else if (target.bossTier === "mini" && target.bossName === "Gum Marshal") {
        // Guaranteed, same reasoning as the tower-mini-boss milestone fix: this scripted
        // beat has no retry loop, so it can't be left waiting on whatever's left in
        // storage by the time it gets here.
        if (!this.hasSpecialMove("gumStomp")) this.player.specialMoveQueue.push("gumStomp");
        this.tryUseSpecialMove("gumStomp");
        this.setAgentActivity("attacking", "GUM MARSHAL");
      } else if (target.bossTier === "mini" && this.hasSpecialMove("laceLash")) {
        this.tryUseSpecialMove("laceLash");
        this.setAgentActivity("attacking", "LACE CAPTAIN");
      } else if (target.gumArmored) {
        // Only Gum Stomp can touch a Gum Turret (see tryGumStomp/updateEnemies) -- the
        // single "gum" pickup in this legacy world (x=55.0) already gets spent by the
        // gum-stomp milestone's own flourish at x=54.72, leaving nothing for this turret at
        // x=57.9 under the new consumable-inventory model (used to be a permanent unlock,
        // so this never ran dry before). Same guaranteed-charge fix as Gum Marshal above --
        // live-tested, without it the scripted demo stalled here indefinitely.
        if (!this.hasSpecialMove("gumStomp")) this.player.specialMoveQueue.push("gumStomp");
        this.tryUseSpecialMove("gumStomp");
        this.setAgentActivity("attacking", "GUM STOMP");
      } else if (this.hasSpecialMove("gumStomp") && this.player.x > 54) {
        this.tryUseSpecialMove("gumStomp");
        this.setAgentActivity("attacking", "GUM STOMP");
      } else if (this.hasSpecialMove("laceLash")) {
        this.tryUseSpecialMove("laceLash");
        this.setAgentActivity("attacking", "LACE LASH");
      } else {
        this.setAgentActivity("attacking", "SUPER KICK");
        this.performSuperKick(target);
      }
    }

    if (this.player.x > 60.1 && this.mode === "playing") this.setAgentActivity("advancing", "RESCUE PROTOCOL");
    if (this.bossDefeated && this.player.x >= 58.6 && this.mode === "playing") {
      // Drive all the way onto the real Left Shoe touch point (see LEFT_SHOE_TOUCH_X/Y
      // and checkRescue()), not just past the old x>=60.7 win threshold -- otherwise this
      // scripted path stalls just short of the actual win condition.
      // Snapping bottom to only the ground floor (-4.2) here was the actual bug behind
      // "the run never wins": the tower platform Left Shoe sits on is up at ~3.5, so a
      // player/scripted run whose bottom was still at ground level would hold x at the
      // shoe's doorstep forever without ever satisfying checkRescue()'s LEFT_SHOE_TOUCH_Y
      // check. Snap onto the platform's actual height, not just "not below ground".
      const shoeX = this.leftShoe ? this.leftShoe.position.x - 0.2 : 62.2;
      const shoeBottom = this.leftShoe ? this.leftShoe.position.y - 0.65 : 3.3;
      // Math.max(player.x, shoeX) alone was a one-way ratchet: once held.right had
      // already carried the player past shoeX (easy to do -- WORLD_END is a further 4
      // units on), it could never pull them back, so they sailed straight through the
      // touch zone into checkRescue()'s new "ran out of room" death instead of ever
      // registering the touch. Ease toward the shoe and then actually stop there.
      if (this.player.x < shoeX) {
        this.player.x = Math.min(shoeX, this.player.x + 6.4 * delta);
      } else {
        this.player.x = shoeX;
        this.held.right = false;
        this.held.left = false;
      }
      this.player.bottom = Math.max(this.player.bottom, shoeBottom);
      this.setAgentActivity("advancing", "REACHING LEFT SHOE");
    }
  }

  /** The real agent-driven run loop. Unlike updateSuperRun (left completely untouched as
   * the scripted, no-model-required spectator fallback for ?superrun), this has no fixed
   * x-threshold route: physics/collision/jump timing stay deterministic engine code, but
   * the *goal* driving movement -- advance, go collect something, go fight something, use
   * an ability now -- comes from a periodic real decision (requestAgentGoal/steerByGoal),
   * and pickups/enemies/contraptions are only ever resolved by the player actually
   * reaching them (see updatePickups/updateEnemies/updateContraptions, all mode-agnostic
   * per-frame systems), never force-swept. Two different models -- or the same model
   * twice -- can genuinely take different routes, at different paces, and can genuinely
   * fail, which the old byte-identical-to-the-script version never could. */
  private updateAgentRun(delta: number) {
    this.superRunKickTimer = Math.max(0, this.superRunKickTimer - delta);
    this.superRunPauseTimer = Math.max(0, this.superRunPauseTimer - delta);
    if (this.superRunPauseTimer > 0 && this.player.dashTimer <= 0 && this.player.formAttackTimer <= 0 && this.player.ultraTimer <= 0) {
      this.player.vx *= Math.max(0.22, 1 - delta * 8.5);
    }

    // Used to silently teleport the player back to solid ground here with no cost at
    // all -- since this ran before updatePlayer() every frame (see update()'s call
    // order), it caught every fall before the shared bottom < -8 check in updatePlayer
    // ever got a chance to fire handleBoardFall(), so agent runs never actually paid the
    // out-of-bounds penalty a human run did. Removed: a fall into a pit now costs a life
    // and repositions the same way for every mode, not just human play.

    if (this.superRunPauseTimer > 0) return;

    // The old 3-stage superRunStage readout was tied to the legacy single-world's fixed
    // x thresholds (24.1/44.4) -- meaningless once x resets to 0 every discrete screen
    // (see buildScreenContent). The level badge + zone map (UiSnapshot.levelIndex/
    // levelCount) already show real progress; nothing replaces this here.

    this.checkAgentStall(delta);
    this.updateMonsterNest(delta);
    this.checkAgentTimeouts();
    this.tickAgentGoal(delta);

    // Reactive, not scripted: jump whenever a real platform is actually ahead. The old
    // showcaseBeat magic-x list that also forced jumps at fixed coordinates regardless of
    // geometry is gone -- this is the only jump trigger now, same as human play.
    const platformAhead = this.platforms.some(
      (platform) =>
        !platform.crumbled &&
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < 2.35 &&
        platform.top > this.player.bottom + 0.18,
    );
    if (this.player.grounded && platformAhead) this.tryJump();

    // A near-certain-correct reflex, not worth a network round trip: fire Ultra Move
    // the instant the boss is in range and ready.
    const bossInUltraRange = this.enemies.find(
      (enemy) => enemy.alive && enemy.bossTier === "boss" && Math.abs(enemy.x - this.player.x) < 8.8,
    );
    if (bossInUltraRange && this.player.ultraMove && this.player.ultraCooldown <= 0) this.tryUltraMove();

    // The one adjacency-triggered decision: a regular or mini-boss enemy directly ahead
    // gets a real enemyResponse call (handleAgentEnemyDecision). Boss-gate handling is a
    // cinematic gate keyed on the Ultra Move unlock, not part of that decision.
    const target = this.enemies.find(
      (enemy) => enemy.alive && enemy.x - this.player.x < 1.38 && enemy.x >= this.player.x - 0.8,
    );
    if (target) {
      if (target.bossTier === "boss" && this.player.ultraMove && this.player.ultraCooldown <= 0) {
        this.tryUltraMove();
      } else if (target.bossTier === "boss") {
        this.setAgentActivity("targeting", "BOSS GATE");
      } else {
        this.handleAgentEnemyDecision(target);
      }
    }

    if (this.bossDefeated && this.player.x >= 58.6 && this.mode === "playing") {
      // Live-tested (with a human watching): forcing player.bottom up onto the tower
      // platform here -- as this block used to, unconditionally, the instant x reached
      // 58.6 -- won the run without the agent ever actually making the real jump up onto
      // it (shoeBox platform top ~2.4 to tower platform top ~3.5, a legitimate ~1.1-unit
      // hop). That's a fake win, not a fixed one. The shoeBox-to-tower gap is well within
      // tryJump()'s normal arc (vy=8.25 clears ~1.58 units of rise), and the reactive
      // platformAhead/tryJump() check earlier in this same function already fires for it
      // exactly like every other ledge in the level -- so steering here only holds the
      // stick toward Left Shoe. It must never set position directly again.
      const shoeX = this.leftShoe ? this.leftShoe.position.x - 0.2 : 62.2;
      if (this.player.x < shoeX - 0.05) {
        this.held.right = true;
        this.held.left = false;
      } else {
        this.held.right = false;
        this.held.left = false;
      }
      this.setAgentActivity("advancing", "REACHING LEFT SHOE");
    }
  }

  /** Counts down to the next requestAgentGoal() call and applies the current goal's
   * steering every frame in between -- see AgentGoal's own comment for the cadence
   * design (resolution-driven, not wall-clock). */
  private tickAgentGoal(delta: number) {
    this.agentGoalTimer = Math.max(0, this.agentGoalTimer - delta);
    // A newly-visible pickup or enemy shortens the wait rather than force-firing a
    // request immediately -- keeps a burst of new entities from spamming calls while
    // still reacting sooner than the full resolution-driven gap would otherwise allow.
    const nearbyCount = this.countNearbyForAgent();
    if (nearbyCount > this.agentLastNearbyCount) this.agentGoalTimer = Math.min(this.agentGoalTimer, 0.6);
    this.agentLastNearbyCount = nearbyCount;

    if (this.agentGoalTimer <= 0 && !this.agentGoalPending) this.requestAgentGoal();
    this.steerByGoal();
  }

  private countNearbyForAgent(): number {
    const lookahead = 9;
    const pickups = this.pickups.filter((p) => !p.collected && p.x - this.player.x > -2 && p.x - this.player.x < lookahead).length;
    const enemies = this.enemies.filter((e) => e.alive && e.x - this.player.x > -2 && e.x - this.player.x < lookahead).length;
    return pickups + enemies;
  }

  /** The x the "advance" goal steers toward and the prompt tells the model about -- the
   * next untouched level marker, or Left Shoe once every marker is already behind. Named
   * once so the engine's steering and the model's own situational awareness of "how far
   * to the exit" always agree on what "forward" currently means -- previously "advance"
   * just held right forever with no target at all, and the model was never told the
   * marker's distance, only a static "keep moving forward" line in the game briefing. */
  private nextObjectiveX(): number {
    const nextMarker = this.levelMarkerMeshes.find((marker) => !marker.touched);
    if (nextMarker) return nextMarker.x;
    if (this.screenExitMarker && !this.screenExitMarker.touched) return SCREEN_LENGTH - 4;
    return this.leftShoe ? this.leftShoe.position.x - 0.2 : this.worldEnd;
  }

  /** held.left/held.right toward the current screen's actual exit (or Left Shoe on the
   * final screen) -- the "advance" goal's own steering, also the fallback collect_pickup/
   * engage_enemy fall back to once a detour goes too far backward (see steerByGoal). */
  private steerTowardObjective() {
    const targetX = this.nextObjectiveX();
    this.held.right = this.player.x < targetX - 0.05;
    this.held.left = this.player.x > targetX + 0.05;
  }

  /** Translates the current AgentGoal into held.left/held.right and, for the two
   * instant-ability goals, an immediate action. The engine still decides *which*
   * specific pickup/enemy is nearest and *when* to jump -- the model only picked the
   * category (see requestAgentGoal's PriorityActionState). */
  private steerByGoal() {
    if (this.agentGoal === "use_dash") {
      if (this.player.dashCharges > 0 && this.player.dashCooldown <= 0) this.tryDash();
      this.agentGoal = "advance";
    } else if (this.agentGoal === "use_ultra") {
      if (this.player.ultraMove && this.player.ultraCooldown <= 0) this.tryUltraMove();
      this.agentGoal = "advance";
    } else if (this.agentGoal === "collect_pickup") {
      const nearest = this.pickups
        .filter((p) => !p.collected)
        .sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))[0];
      // Live-tested: "collect_pickup" chasing something several units behind the player
      // directly fights "reach the screen exit" -- the actual win condition per screen --
      // with nothing to arbitrate between them. A pickup barely behind (already all but
      // reached) is harmless; anything further back isn't worth abandoning progress for,
      // so steering falls back to the same forward pull "advance" uses instead.
      if (nearest && nearest.x < this.player.x - 2.5) this.steerTowardObjective();
      else {
        this.held.right = !nearest || nearest.x >= this.player.x;
        this.held.left = Boolean(nearest) && nearest.x < this.player.x;
      }
    } else if (this.agentGoal === "engage_enemy") {
      const nearest = this.enemies
        .filter((e) => e.alive)
        .sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))[0];
      if (nearest && nearest.x < this.player.x - 2.5) this.steerTowardObjective();
      else {
        this.held.right = !nearest || nearest.x >= this.player.x;
        this.held.left = Boolean(nearest) && nearest.x < this.player.x;
      }
    } else {
      this.steerTowardObjective();
    }
  }

  /** Lets the priorityAction decision "see" the ground ahead, not just entities -- a
   * bounce pad or crumble platform coming up (real Platform.special flags), or a gap the
   * reactive jump will clear automatically but that still makes the terrain riskier for
   * something like engaging an enemy mid-crossing. Jump timing itself stays engine-owned
   * (see the platformAhead check in updateAgentRun); this only informs the goal choice. */
  private buildNearbyTerrain(lookahead: number): AgentTerrainHint[] {
    const terrain: AgentTerrainHint[] = [];
    for (const platform of this.platforms) {
      if (platform.crumbled || !platform.special) continue;
      const distance = platform.x - this.player.x;
      if (distance > -2 && distance < lookahead) terrain.push({ kind: platform.special, distance: Number(distance.toFixed(2)) });
    }
    const nextLedge = this.platforms.find(
      (platform) =>
        !platform.crumbled &&
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < lookahead &&
        platform.top > this.player.bottom + 0.18,
    );
    if (nextLedge) {
      const gapDistance = nextLedge.x - nextLedge.width / 2 - this.player.x;
      if (gapDistance > 1.5) terrain.push({ kind: "gap", distance: Number(gapDistance.toFixed(2)) });
    }
    return terrain.sort((a, b) => a.distance - b.distance).slice(0, 3);
  }

  /** Fires the periodic priorityAction decision -- see tickAgentGoal for cadence.
   * Resolution-driven: agentGoalTimer is only reset once this actually resolves (success
   * or fallback, in the .finally below), never on a fixed schedule, so a slow local model
   * can never cause requests to stack. */
  private requestAgentGoal() {
    this.agentGoalPending = true;
    this.setAgentActivity("thinking", "DECIDING");
    this.logAgent(`→ asking ${this.agentBackend}/${this.agentModel} for next move (${this.agentLastNearbyCount} nearby)`);
    this.publishUi(true);

    const lookahead = 9;
    const nearbyPickups = this.pickups
      .filter((p) => !p.collected && p.x - this.player.x > -2 && p.x - this.player.x < lookahead)
      .sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))
      .slice(0, 3)
      .map((p) => ({ kind: p.kind, distance: Number((p.x - this.player.x).toFixed(2)) }));
    const nearbyEnemies = this.enemies
      .filter((e) => e.alive && e.x - this.player.x > -2 && e.x - this.player.x < lookahead)
      .sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))
      .slice(0, 3)
      .map((e) => ({ kind: e.kind, bossTier: e.bossTier ?? null, distance: Number((e.x - this.player.x).toFixed(2)) }));
    const nearbyTerrain = this.buildNearbyTerrain(lookahead);

    const state = {
      player: {
        hearts: this.player.hearts,
        maxHearts: this.player.maxHearts,
        shoeForm: this.player.shoeForm,
        dashCharges: this.player.dashCharges,
        dashReady: this.player.dashCharges > 0 && this.player.dashCooldown <= 0,
        ultraMove: this.player.ultraMove,
        ultraReady: this.player.ultraMove && this.player.ultraCooldown <= 0,
        grounded: this.player.grounded,
      },
      nearbyPickups,
      nearbyEnemies,
      nearbyTerrain,
      nextObjective: { distance: Number((this.nextObjectiveX() - this.player.x).toFixed(2)) },
    };

    this.agentGoalAbortController = new AbortController();
    fetch("/api/agent/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: this.agentRunId, decisionType: "priorityAction", backend: this.agentBackend, model: this.agentModel, state }),
      signal: this.agentGoalAbortController.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((response: { choice?: AgentGoal | null; decisionId?: number; disagreesWithMemory?: boolean; prompt?: string; raw?: string | null } | null) => {
        if (this.disposed) return;
        // The outgoing goal reached the end of its window without damagePlayer ever
        // reporting against it, i.e. it went fine -- close it out as a positive outcome
        // before the id gets overwritten below. See this field's own docstring.
        if (this.agentGoalDecisionId != null) this.reportDecisionOutcome(this.agentGoalDecisionId, "avoided");
        this.agentGoal = response?.choice ?? "advance";
        this.agentGoalDecisionId = response?.decisionId ?? null;
        this.setAgentActivity(this.activityForGoal(this.agentGoal), this.labelForGoal(this.agentGoal));
        this.logAgent(
          response?.choice
            ? `✓ goal: ${response.choice}${response.disagreesWithMemory ? " (note: goes against well-established data here)" : ""}`
            : "⚠ goal fallback: advance (no usable reply in time)",
        );
        // The real prompt sent and the model's unedited reply -- open devtools to see
        // for yourself that this is a live exchange, not the game picking its own outcome.
        if (response?.prompt) console.log(`[Shoe Adventure agent] ${this.agentBackend}/${this.agentModel} asked:\n${response.prompt}\n→ raw reply: ${JSON.stringify(response.raw)}`);
        this.publishUi(true);
      })
      .catch((error) => {
        if (this.disposed || error?.name === "AbortError") return; // quit() cancelled this on purpose
        this.agentGoal = "advance";
        this.setAgentActivity("fallback", "ADVANCING");
        this.logAgent("⚠ goal fallback: advance (request failed)");
      })
      .finally(() => {
        this.agentGoalPending = false;
        this.agentGoalTimer = 1.6;
        this.agentGoalAbortController = null;
      });
  }

  private activityForGoal(goal: AgentGoal): AgentActivity {
    if (goal === "use_dash") return "dodging";
    if (goal === "use_ultra") return "usingUltra";
    if (goal === "engage_enemy") return "targeting";
    return "advancing";
  }

  private labelForGoal(goal: AgentGoal): string {
    if (goal === "use_dash") return "LACE DASH";
    if (goal === "use_ultra") return "ULTRA MOVE";
    if (goal === "engage_enemy") return "ENGAGING";
    if (goal === "collect_pickup") return "COLLECTING";
    return "ADVANCING";
  }

  /** If the player hasn't actually made progress in a while, a free-choosing agent may
   * be stuck at a lane that needs a specific form/ability it hasn't found yet -- a
   * structural impossibility in the old scripted route, but a real risk once the route
   * itself is no longer hardcoded. This is a deterministic safety net, not a route
   * script: it only ever fires when genuinely stalled, and it nudges rather than
   * teleports. */
  private checkAgentStall(delta: number) {
    if (Math.abs(this.player.x - this.agentStallX) > AGENT_STALL_DISTANCE) {
      this.agentStallX = this.player.x;
      this.agentStallTimer = 0;
      this.agentStallStrikes = 0;
      this.despawnMonsterNest();
      return;
    }
    this.agentStallTimer += delta;
    if (this.agentStallTimer < AGENT_STALL_TIMEOUT) return;
    this.agentStallTimer = 0;
    this.agentStallX = this.player.x;
    this.agentStallStrikes += 1;
    const strandedPickup = this.pickups.find((p) => !p.collected && Math.abs(p.x - this.player.x) < 2.5);
    if (strandedPickup) {
      this.collectPickup(strandedPickup);
    } else if (!this.player.grounded === false) {
      this.tryJump();
      this.player.vx = this.player.facing * 6.4;
    }
    // Standing still is no longer safe: force the whole nearby room onto the player
    // rather than just nudging position. Bosses are already always-aggro (see
    // updateBossPattern); this is what puts real pressure on regular enemies that would
    // otherwise happily patrol past a stalled run forever.
    const stalledEnemies = this.enemies.filter((enemy) => enemy.alive && !enemy.bossTier && Math.abs(enemy.x - this.player.x) < 15);
    stalledEnemies.forEach((enemy) => { enemy.aggro = true; });
    this.setAgentActivity("fallback", "UNSTICKING");
    this.logAgent(`⚠ stalled ${AGENT_STALL_TIMEOUT}s — nudging progress, ${stalledEnemies.length} enem${stalledEnemies.length === 1 ? "y" : "ies"} aggroed`);
    // First stall gets the nudge above and nothing more. Stalling again at (roughly) the
    // same spot without the nudge ever having produced real progress means the room's
    // existing enemies aren't the problem -- so a nest spawns in and starts producing
    // fresh pressure instead of aggro-ing the same enemies a second time for no new effect.
    if (this.agentStallStrikes >= 2 && !this.agentNest) this.spawnMonsterNest();
  }

  /** Escalation past the first stall nudge: plants a visible nest at the player's current
   * position that periodically spawns a fresh, already-aggro enemy nearby (see
   * updateMonsterNest) -- real, mounting pressure a free-choosing agent can't just wait
   * out, rather than the same room's enemies getting re-aggroed with no new effect. Capped
   * (see MONSTER_NEST_MAX_SPAWNS) so a genuinely stuck run doesn't spiral into an
   * unwinnable swarm; despawns the moment real progress resumes (checkAgentStall). */
  private spawnMonsterNest() {
    const x = this.player.x + (this.player.facing >= 0 ? 2.2 : -2.2);
    const bottom = this.player.bottom;
    const root = new TransformNode(`monsterNest-${this.titleTime.toFixed(2)}`, this.scene);
    const mound = MeshBuilder.CreateSphere("monsterNestMound", { diameter: 0.9, segments: 16 }, this.scene);
    mound.parent = root;
    mound.scaling = new Vector3(1, 0.55, 0.85);
    mound.position = new Vector3(0, 0.24, -0.15);
    mound.material = this.createMaterial("monsterNestMoundMat", new Color3(0.32, 0.06, 0.42), new Color3(0.1, 0.01, 0.14));
    const glow = MeshBuilder.CreateTorus("monsterNestGlow", { diameter: 0.7, thickness: 0.1, tessellation: 20 }, this.scene);
    glow.parent = root;
    glow.position = new Vector3(0, 0.55, -0.1);
    glow.material = this.createMaterial("monsterNestGlowMat", VIOLET, RESCUE_CORAL);
    root.position = new Vector3(x, bottom, -0.2);
    this.agentNest = { root, x, bottom, spawnTimer: 0.4, spawned: 0 };
    this.spawnSparks(x, bottom + 0.4, VIOLET, 16, 2.6);
    this.setAgentActivity("fallback", "NEST SPAWNED");
    this.logAgent(`⚠⚠ still stalled — a monster nest spawned in and is producing enemies`);
  }

  private despawnMonsterNest() {
    if (!this.agentNest) return;
    this.agentNest.root.dispose();
    this.agentNest = null;
  }

  /** Ticks the active nest's spawn timer and produces a fresh enemy every
   * MONSTER_NEST_SPAWN_INTERVAL seconds, already aggro so it heads straight for the
   * player instead of waiting for ENEMY_AGGRO_RANGE -- up to MONSTER_NEST_MAX_SPAWNS, after
   * which the nest goes quiet (still visible, a reminder of the cost of stalling) rather
   * than spawning forever. */
  private updateMonsterNest(delta: number) {
    if (!this.agentNest) return;
    const nest = this.agentNest;
    nest.root.rotation.y += delta * 1.4;
    if (nest.spawned >= MONSTER_NEST_MAX_SPAWNS) return;
    nest.spawnTimer -= delta;
    if (nest.spawnTimer > 0) return;
    nest.spawnTimer = MONSTER_NEST_SPAWN_INTERVAL;
    nest.spawned += 1;
    const side = nest.spawned % 2 === 0 ? 1 : -1;
    const spawnX = nest.x + side * 0.6;
    const enemy = nest.spawned % 3 === 0 ? this.createSlime(spawnX, nest.bottom, spawnX - 2, spawnX + 2) : this.createLaceGoblin(spawnX, nest.bottom, spawnX - 2, spawnX + 2);
    enemy.aggro = true;
    this.enemies.push(enemy);
    this.spawnSparks(spawnX, nest.bottom + 0.3, VIOLET, 10, 2.2);
  }

  /** The exact hardcoded priority order updateSuperRun always used for
   * this branch -- kept verbatim as: (a) the true fallback when the agent
   * backend is unreachable or replies with something unparseable, and
   * (b) the safety mapper when the agent picks a legal option that isn't
   * actually usable right now (e.g. "gum_stomp" with no charge ready). */
  private scriptedEnemyChoice(enemy: Enemy): AgentEnemyChoice {
    if (enemy.bossTier === "mini" && enemy.bossName === "Gum Marshal" && this.hasSpecialMove("gumStomp")) return "gum_stomp";
    if (enemy.bossTier === "mini" && this.hasSpecialMove("laceLash")) return "lace_lash";
    if (this.hasSpecialMove("gumStomp") && this.player.x > 54) return "gum_stomp";
    if (this.hasSpecialMove("laceLash")) return "lace_lash";
    return "super_kick";
  }

  /** Fires at most one in-flight enemy-response request at a time and never asks about
   * the same enemy twice -- independent of the goal decision's own agentGoalPending track
   * (see that field's own comment for why they used to share one flag and why that was a
   * problem: it meant most enemy encounters never got a real model call at all). Still
   * resolves locally via scriptedEnemyChoice if somehow an enemy-response call is already
   * in flight for a different enemy -- an encounter must never go unanswered. */
  private handleAgentEnemyDecision(enemy: Enemy) {
    if (this.agentAskedEnemies.has(enemy)) return;
    if (this.agentEnemyPending) {
      this.agentAskedEnemies.set(enemy, { decisionId: null, askedAt: Date.now() });
      this.logAgent(`⚡ ${enemy.kind} ahead mid-request — using scripted response`);
      this.applyAgentEnemyChoice(enemy, null, true);
      return;
    }
    this.agentAskedEnemies.set(enemy, { decisionId: null, askedAt: Date.now() });
    this.agentEnemyPending = true;
    this.superRunPauseTimer = Math.max(this.superRunPauseTimer, 0.3);
    this.setAgentActivity("thinking", "DECIDING");
    this.logAgent(`→ asking ${this.agentBackend}/${this.agentModel}: ${enemy.bossTier ? `${enemy.bossTier}-boss ` : ""}${enemy.kind} ahead`);
    this.publishUi(true);

    const state = {
      player: {
        x: this.player.x,
        hearts: this.player.hearts,
        maxHearts: this.player.maxHearts,
        shoeForm: this.player.shoeForm,
        gumStomp: this.player.specialMoveQueue.includes("gumStomp"),
        laceLash: this.player.specialMoveQueue.includes("laceLash"),
        ultraMove: this.player.ultraMove,
        gumStompReady: this.hasSpecialMove("gumStomp"),
        laceLashReady: this.hasSpecialMove("laceLash"),
        ultraMoveReady: this.player.ultraMove && this.player.ultraCooldown <= 0,
      },
      enemy: {
        kind: enemy.kind,
        bossTier: enemy.bossTier ?? null,
        bossName: enemy.bossName ?? null,
        x: enemy.x,
      },
    };

    this.agentEnemyAbortController = new AbortController();
    fetch("/api/agent/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: this.agentRunId,
        decisionType: "enemyResponse",
        backend: this.agentBackend,
        model: this.agentModel,
        state,
      }),
      signal: this.agentEnemyAbortController.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((response: { choice?: AgentEnemyChoice | null; fallback?: boolean; disagreesWithMemory?: boolean; decisionId?: number; latencyMs?: number; prompt?: string; raw?: string | null } | null) => {
        if (this.disposed) return;
        const entry = this.agentAskedEnemies.get(enemy);
        if (entry) entry.decisionId = response?.decisionId ?? null;
        // The model's own choice always executes as given now -- see decide.ts's own
        // comment on why the old silent-override behavior got removed. A disagreement with
        // memory is worth noting (a "second opinion" for whoever reviews the log later,
        // not a correction), so it's logged here rather than changing what actually happens.
        this.logAgent(
          response?.choice
            ? `✓ ${response.choice}${response.disagreesWithMemory ? " (note: goes against well-established data here)" : ""} (${Math.round(response.latencyMs ?? 0)}ms)`
            : "⚠ enemy fallback: no usable reply in time",
        );
        if (response?.prompt) console.log(`[Shoe Adventure agent] ${this.agentBackend}/${this.agentModel} asked:\n${response.prompt}\n→ raw reply: ${JSON.stringify(response.raw)}`);
        this.applyAgentEnemyChoice(enemy, response?.choice ?? null, response?.fallback ?? true);
      })
      .catch((error) => {
        if (this.disposed || error?.name === "AbortError") return; // quit() cancelled this on purpose
        this.logAgent("⚠ enemy fallback: request failed");
        this.applyAgentEnemyChoice(enemy, null, true);
      })
      .finally(() => {
        this.agentEnemyPending = false;
        this.agentEnemyAbortController = null;
      });
  }

  private applyAgentEnemyChoice(enemy: Enemy, choice: AgentEnemyChoice | null, fallback: boolean) {
    if (this.disposed || !enemy.alive) return; // Defeated or off-route by the time the response landed.
    this.superRunAction = fallback
      ? "AGENT FALLBACK — no usable reply in time; Right Shoe improvises the scripted response."
      : `AGENT CHOICE (${this.agentBackend}) — ${choice}.`;
    this.message = "AGENT RUN: " + this.superRunAction;
    this.setAgentActivity(fallback ? "fallback" : "attacking", fallback ? "FALLBACK" : String(choice).toUpperCase().replace(/_/g, " "));

    const resolved = choice ?? this.scriptedEnemyChoice(enemy);
    if (resolved === "gum_stomp" && this.hasSpecialMove("gumStomp")) this.tryUseSpecialMove("gumStomp");
    else if (resolved === "lace_lash" && this.hasSpecialMove("laceLash")) this.tryUseSpecialMove("laceLash");
    else if (resolved === "avoid") {
      // Used to do nothing at all -- just trusted existing forward momentum to carry the
      // player clear, which only works when the enemy happens to be off to the side or
      // below a jump arc already in progress. Live-tested: against a ground-level enemy
      // sitting directly in the walking path (routine in the discrete-screens generator's
      // layouts), that's not a dodge, it's a coin flip -- failed 3/3 in a row in one run.
      // A real dodge now: a reflexive hop, which clears the same height gate updateEnemies'
      // sideHit check uses, plus a brief invulnerability window as a safety net so a dodge
      // the model chose never fails just from bad luck on the exact arc.
      if (this.player.grounded) this.player.vy = Math.max(this.player.vy, 6.2);
      this.player.invulnerable = Math.max(this.player.invulnerable, 0.6);
    } else this.performSuperKick(enemy);

    this.publishUi(true);
  }

  /** Closes the loop on a decision's outcome once the encounter actually resolves (enemy
   * defeated, player took damage) -- see defeatEnemy/the sideHit branch in updateEnemies
   * for the call sites, and checkAgentTimeouts for the "neither happened" case. Silently
   * no-ops for decisions resolved locally via handleAgentEnemyDecision's concurrency
   * fallback (decisionId stays null there -- nothing was actually recorded server-side). */
  private reportAgentOutcome(enemy: Enemy, outcome: "enemy_defeated" | "player_damaged" | "avoided") {
    const entry = this.agentAskedEnemies.get(enemy);
    if (!entry) return;
    this.agentAskedEnemies.delete(enemy);
    if (entry.decisionId != null) this.reportDecisionOutcome(entry.decisionId, outcome);
  }

  /** Live-tested against real accumulated data: 76% of enemyResponse decisions were
   * sitting at outcome "unknown" forever -- nowhere near checkAgentTimeouts' own 6s
   * window firing naturally that often. The real cause was disposeScreen()/
   * startAgentRun()'s own agentAskedEnemies.clear() calls, which fire every screen
   * transition (up to 6x a run) and silently dropped whatever was still pending -- an
   * enemy the player successfully got past just before the screen ended never got
   * credited for it. Anything still pending at this point was, by construction, neither
   * defeated (defeatEnemy already reports and removes it) nor the cause of damage
   * (damagePlayer's sideHit branch already reports and removes it too) -- so "avoided" is
   * the accurate label, not a guess, and flushing it here before clearing is what
   * actually lets the Bayesian memory learn from the other 3 in 4 of these decisions
   * instead of discarding them. */
  private flushPendingEnemyOutcomes() {
    this.agentAskedEnemies.forEach((_entry, enemy) => this.reportAgentOutcome(enemy, "avoided"));
  }

  /** The low-level primitive both reportAgentOutcome (enemyResponse, keyed by which
   * enemy was asked about) and the priorityAction goal-outcome reporting in
   * requestAgentGoal/damagePlayer (keyed by agentGoalDecisionId, no enemy involved) share
   * -- this is what actually closes the loop back to history.ts's recordOutcome, feeding
   * the Bayesian bandit (see decide.ts's getMemory/thompsonSample) real data instead of
   * every row sitting at "unknown" forever. */
  private reportDecisionOutcome(decisionId: number, outcome: "enemy_defeated" | "player_damaged" | "avoided") {
    fetch(`/api/agent/decide/${decisionId}/outcome`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome }),
    }).catch(() => { /* best-effort, same discipline as recordRunCompletion */ });
  }

  /** An enemy that was asked about but neither died nor landed a hit within a few
   * seconds -- the player moved on. Reports "avoided" so getMemory() doesn't leave the
   * row stuck at "unknown" forever, and stops tracking it. */
  private checkAgentTimeouts() {
    const now = Date.now();
    this.agentAskedEnemies.forEach((entry, enemy) => {
      if (now - entry.askedAt > 6000) this.reportAgentOutcome(enemy, "avoided");
    });
  }

  private enterSuperRunStage(stage: number, label: string, checkpoint: string) {
    if (this.superRunStage >= stage) return;
    this.superRunStage = stage;
    this.superRunStageLabel = label;
    this.activeCheckpoint = checkpoint;
    this.markSuperRunMilestone("stage-" + stage + "-entry", "STAGE " + stage + "/3 — " + label + ". The AI reassesses every device and foe in the new zone.", 0.78);
  }

  private markSuperRunMilestone(key: string, action: string, pause = 0.58) {
    if (this.superRunMilestones.has(key)) return false;
    this.superRunMilestones.add(key);
    this.superRunAction = action;
    this.message = "AI SUPER RUN: " + action;
    this.setAgentActivity(this.classifyAgentActivity(action), action.split(" — ")[0]);
    this.superRunPauseTimer = Math.max(this.superRunPauseTimer, pause);
    this.publishUi(true);
    return true;
  }

  /** The icon-first replacement for reading superRunAction's prose as the primary HUD
   * signal (see UiSnapshot.agentActivity / GameCanvas.tsx's glyph map). superRunAction
   * and message keep the full sentence for accessibility text; this only sets the short
   * label and icon category actually shown by default. */
  private setAgentActivity(activity: AgentActivity, label: string) {
    this.agentActivity = activity;
    this.agentActivityTarget = label;
  }

  /** Fires the full-screen splash banner for a form transformation or major ability
   * unlock (see collectPickup) -- ticked down in update() and cleared once popupTimer
   * hits 0, mirroring the reunionTimer pattern already used elsewhere in this file. */
  private showPickupSplash(text: string) {
    this.popupVariant = "pickup";
    this.popupText = text;
    this.popupTimer = 1.15;
    this.popupTilt = (Math.random() - 0.5) * 22;
  }

  /** The comic-book "POW!"/"KA-POW!" onomatopoeia pop for a landed hit -- same mechanism
   * as showPickupSplash, punchier styling (see GameCanvas.tsx's .pickup-splash--impact),
   * shorter and snappier since it's meant to land right on the beat of an already-brief
   * hit-stop rather than linger. */
  private showComicPop(text: string) {
    this.popupVariant = "impact";
    this.popupText = text;
    this.popupTimer = 0.7;
    this.popupTilt = (Math.random() - 0.5) * 30;
  }

  /** A true freeze-frame, not just slow-mo: update() skips the tick entirely while this
   * counts down, so physics/animation/camera all visibly hold for a beat before snapping
   * back into motion. Web Audio runs on its own clock so already-scheduled sound is
   * unaffected -- only the visual side freezes, which is exactly the "this hit actually
   * landed" cue this is for. */
  private triggerHitStop(duration: number) {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
  }

  /** A brief orthographic zoom-in on the very biggest beats -- captures the camera's
   * current ortho bounds once (assumed stable for the effect's short lifetime) and eases
   * back out to exactly that, so it composes cleanly with whatever scene.ts's resize
   * handler last set regardless of viewport size. See updateCamera for the actual easing. */
  private triggerCameraPunch(duration: number) {
    if (!this.cameraZoomBase) {
      this.cameraZoomBase = {
        top: this.camera.orthoTop ?? 10,
        bottom: this.camera.orthoBottom ?? -10,
        left: this.camera.orthoLeft ?? -10,
        right: this.camera.orthoRight ?? 10,
      };
    }
    this.cameraZoomTimer = duration;
  }

  /** Appends one line to the scrolling agent-call log (UiSnapshot.agentLog), capped to
   * the most recent 24 entries so the HUD panel never grows unbounded across a long run. */
  private logAgent(text: string) {
    this.agentLog.push(`${this.titleTime.toFixed(1)}s  ${text}`);
    if (this.agentLog.length > 24) this.agentLog.shift();
  }

  /** Cheap keyword classification so the ~24 existing milestone call sites in
   * updateSuperRun don't each need converting individually -- markSuperRunMilestone
   * routes every one of them through here. New direct setAgentActivity() call sites
   * (checkRescue, tryUltraMove, the target-enemy branch, etc.) pick their own category
   * explicitly instead and never go through this classifier. */
  private classifyAgentActivity(action: string): AgentActivity {
    const upper = action.toUpperCase();
    if (upper.includes("STOMP") || upper.includes("LASH") || upper.includes("SMASH") || upper.includes("ULTRA") || upper.includes("KICK")) return "attacking";
    if (upper.includes("BOSS") || upper.includes("GATE") || upper.includes("MINI-BOSS")) return "targeting";
    if (upper.includes("RECOVERY") || upper.includes("FALLBACK")) return "fallback";
    if (upper.includes("DASH") || upper.includes("JUMP")) return "dodging";
    return "advancing";
  }

  private activateSuperRunContraption(kind: ContraptionKind, callout: string) {
    const contraption = this.contraptions.find((candidate) => candidate.kind === kind);
    if (contraption && !contraption.activated) this.activateContraption(contraption, callout);
  }

  private sweepSuperRunPickups(minX: number, maxX: number, label: string) {
    const pending = this.pickups.filter((pickup) => !pickup.collected && pickup.x >= minX && pickup.x < maxX);
    pending.forEach((pickup) => this.collectPickup(pickup));
    if (pending.length > 0) {
      this.superRunAction = label + " — AI reconciled " + pending.length + " overlooked route patch" + (pending.length === 1 ? "" : "es") + ".";
      this.message = "AI SUPER RUN: " + this.superRunAction;
    }
  }

  private clearSuperRunEnemies(minX: number, maxX: number, label: string) {
    const stragglers = this.enemies.filter((enemy) => enemy.alive && enemy.bossTier !== "boss" && enemy.x >= minX && enemy.x < maxX);
    stragglers.forEach((enemy) => this.defeatEnemy(enemy));
    if (stragglers.length > 0) {
      this.superRunAction = label + " — AI closes " + stragglers.length + " remaining enemy record" + (stragglers.length === 1 ? "" : "s") + ".";
      this.message = "AI SUPER RUN: " + this.superRunAction;
    }
  }

  private claimSuperRunPowerup(kind: PickupKind, callout: string) {
    const pickup = this.pickups
      .filter((candidate) => candidate.kind === kind && !candidate.collected)
      .sort((left, right) => Math.abs(left.x - this.player.x) - Math.abs(right.x - this.player.x))[0];
    if (!pickup) return;
    this.collectPickup(pickup);
    const formPickup = kind === "pump" || kind === "hightop" || kind === "loafer" || kind === "cowboy" || kind === "sneaker";
    const showcasePause = kind === "ultra" ? 1.25 : formPickup ? 0.92 : kind === "heart" || kind === "lash" || kind === "gum" ? 0.64 : 0.42;
    this.superRunPauseTimer = Math.max(this.superRunPauseTimer, showcasePause);
    this.superRunAction = formPickup ? `${callout} Attack fires on pickup.` : callout;
    this.message = `AI SUPER RUN: ${this.superRunAction}`;
  }

  private performSuperKick(enemy: Enemy) {
    if (!enemy.alive || enemy.bossTier === "boss" || enemy.gumArmored) return;
    const move = enemy.bossTier === "mini" ? "MINI-BOSS HEEL BREAK" : enemy.kind === "skate" ? "TURBO HEEL KICK" : enemy.kind === "slime" ? "CRESCENT SOLE KICK" : "SOLE-FLIP KICK";
    if (enemy.kind === "skate" && this.player.dashCharges > 0 && this.player.dashCooldown <= 0) this.tryDash();
    this.superRunKickTimer = 0.72;
    if (this.superRun) this.superRunPauseTimer = Math.max(this.superRunPauseTimer, enemy.bossTier === "mini" ? 0.82 : 0.58);
    this.damageEnemy(enemy);
    this.player.vy = Math.max(this.player.vy, 7.4);
    // damageEnemy already set its own stagger message/log when this hit didn't finish a
    // multi-hit boss -- only overwrite it with the "cleared" callout once it's actually gone.
    if (!enemy.alive) {
      this.superRunAction = `${move} — ${enemy.kind === "skate" ? "rogue skate grounded." : "shoe fiend cleared."}`;
      this.message = `AI SUPER RUN: ${this.superRunAction}`;
    }
    this.triggerCinematicBeat(enemy.bossTier === "mini" ? 0.3 : 0.16, enemy.bossTier === "mini" ? 0.14 : 0.07);
    this.spawnSparks(enemy.x, enemy.bottom + 0.78, RESCUE_CORAL, 12, 3.8);
    this.spawnImpactRing(enemy.x, enemy.bottom + 0.78, RESCUE_CORAL, enemy.bossTier === "mini" ? 1.18 : 0.78);
  }

  private updatePlayer(delta: number) {
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);
    this.player.dashTimer = Math.max(0, this.player.dashTimer - delta);
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.specialMoveCooldown = Math.max(0, this.player.specialMoveCooldown - delta);
    this.player.lashTimer = Math.max(0, this.player.lashTimer - delta);
    this.player.stompTimer = Math.max(0, this.player.stompTimer - delta);
    this.player.formAttackTimer = Math.max(0, this.player.formAttackTimer - delta);
    this.player.formAttackCooldown = Math.max(0, this.player.formAttackCooldown - delta);
    this.player.formShieldTimer = Math.max(0, this.player.formShieldTimer - delta);
    this.player.ultraTimer = Math.max(0, this.player.ultraTimer - delta);
    this.player.ultraCooldown = Math.max(0, this.player.ultraCooldown - delta);
    this.player.superJumpTimer = Math.max(0, this.player.superJumpTimer - delta);
    this.player.moonTimer = Math.max(0, this.player.moonTimer - delta);

    const direction = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    const formDashSpeed = this.player.shoeForm === "sneaker" ? 21 : this.player.shoeForm === "loafer" ? 16.5 : 0;
    const targetSpeed = this.player.dashTimer > 0 ? this.player.facing * 19 : this.player.formAttackTimer > 0 && formDashSpeed > 0 ? this.player.facing * formDashSpeed : direction * 6.4;
    const response = this.player.grounded ? 18 : 10;
    this.player.vx += (targetSpeed - this.player.vx) * Math.min(1, response * delta);
    if (direction !== 0) this.player.facing = direction > 0 ? 1 : -1;

    const wasGrounded = this.player.grounded;
    const fallSpeedBeforeLanding = this.player.vy;
    const previousBottom = this.player.bottom;
    this.player.vy -= 21.5 * delta;
    this.player.x += this.player.vx * delta;
    this.player.bottom += this.player.vy * delta;
    this.player.x = Math.max(-3.5, Math.min(this.worldEnd, this.player.x));
    // The true boss has no physical body blocking the corridor -- only checkRescue()'s
    // bossAlive branch refuses to call it a win. Live-tested: a free-choosing agent's
    // "advance" steering doesn't stop to fight just because a decision hasn't fired yet,
    // so it walked straight through the boss's patrol band and off the world's edge
    // (checkRescue()'s "ran out of room" death) without ever engaging it. An invisible
    // wall just past the boss's patrol range forces an actual confrontation instead.
    const trueBoss = this.enemies.find((enemy) => enemy.alive && enemy.bossTier === "boss");
    if (trueBoss) this.player.x = Math.min(this.player.x, trueBoss.maxX + 1.2);
    this.player.grounded = false;

    if (this.player.vy <= 0) {
      for (const platform of this.platforms) {
        if (platform.crumbled) continue; // vanished: no collision until it respawns
        const overlapX = this.player.x + PLAYER_WIDTH / 2 > platform.x - platform.width / 2 && this.player.x - PLAYER_WIDTH / 2 < platform.x + platform.width / 2;
        const crossedTop = previousBottom >= platform.top - 0.04 && this.player.bottom <= platform.top;
        if (overlapX && crossedTop) {
          this.player.bottom = platform.top;
          if (platform.special === "bouncePad") {
            // A real launch, not a landing: grounded stays false and a fresh jump/dash
            // stays available, same as coming off any other airborne moment.
            this.player.vy = 15.5;
            this.player.jumpUsed = false;
            this.triggerCinematicBeat(0.16, 0.08);
            this.spawnSparks(platform.x, platform.top + 0.1, CYAN, 18, 3.6);
            this.audio.playJump();
          } else {
            this.player.vy = 0;
            this.player.grounded = true;
            this.player.jumpUsed = false;
            if (platform.special === "crumble" && platform.crumbleTimer === undefined) {
              platform.crumbleTimer = 0.45;
            }
          }
          break;
        }
      }
    }
    // A real landing is an airborne-to-grounded transition with meaningful downward
    // speed, not the continuous re-detection that happens every frame a player rests
    // motionless on a platform (vy stays 0, so it would otherwise "land" every tick).
    if (!wasGrounded && this.player.grounded && fallSpeedBeforeLanding < -1) this.audio.playLand();

    // Falling into a pit is the same "out of bounds" as running off the world's far edge
    // (see checkRescue()'s WORLD_END branch) -- both go through handleBoardFall() now, so
    // a fall always costs a life and repositions rather than just chipping a heart off.
    // update()'s own mode gate (line ~1938) already guarantees mode === "playing" by the
    // time this runs, so no extra guard is needed here.
    if (this.player.bottom < -8) this.handleBoardFall();

    const speedRatio = Math.min(1, Math.abs(this.player.vx) / 21);
    const stridePhase = this.titleTime * (8 + speedRatio * 12);
    const bob = this.player.grounded ? Math.sin(stridePhase) * (0.035 + speedRatio * 0.07) : 0;
    const airbornePose = this.player.grounded ? 0 : Math.max(-0.12, Math.min(0.18, this.player.vy * 0.022));
    this.player.root.position.x = this.player.x;
    this.player.root.position.y = this.player.bottom + bob;
    this.player.root.scaling.x = this.player.facing;
    this.player.root.rotation.z = Math.max(-0.22, Math.min(0.22, -this.player.vx * 0.019)) + airbornePose;
    if (this.heroSprite) {
      const attackPose = this.player.ultraTimer > 0 ? 0.2 : this.player.formAttackTimer > 0 ? 0.13 : this.superRunKickTimer > 0 ? 0.18 : 0;
      const squash = this.player.grounded ? Math.sin(stridePhase) * speedRatio * 0.08 : -0.06;
      this.heroSprite.position.x = 0.06 + this.player.facing * attackPose;
      this.heroSprite.position.y = 0.9 + bob * 0.72 + Math.max(0, airbornePose) * 0.35;
      this.heroSprite.rotation.z = -this.player.facing * (attackPose * 0.92 + squash * 0.42);
      const spectatorScale = this.superRun ? 0.86 : 1;
      this.heroSprite.scaling.x = spectatorScale * (1 + Math.abs(squash) + attackPose * 0.45);
      this.heroSprite.scaling.y = spectatorScale * (1 - squash + attackPose * 0.15);
    }
    if (this.superRunKickTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.62;
    if (this.player.ultraTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.76;
    if (this.player.formAttackTimer > 0) this.player.root.rotation.z = this.player.shoeForm === "pump" ? this.player.facing * 0.38 : -this.player.facing * 0.48;
    if (this.player.lashTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.4;
    if (this.player.stompTimer > 0) this.player.root.rotation.z = this.player.facing * 0.16;
    if (this.player.superJumpTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.2;
    if (this.heroHalo) {
      const actionPulse = this.player.ultraTimer > 0 ? 0.48 : this.player.formAttackTimer > 0 || this.superRunKickTimer > 0 ? 0.24 : 0;
      const pulse = 1 + Math.sin(this.titleTime * 7.4) * 0.06 + (this.player.shoeForm === "starter" ? 0 : 0.07) + actionPulse;
      this.heroHalo.scaling = new Vector3(pulse, pulse, 1);
    }
    if (this.player.dashTimer > 0) {
      this.spawnSparks(this.player.x - this.player.facing * 0.5, this.player.bottom + 0.65, RESCUE_CORAL, 1, 1.4);
    }
    if (this.player.lashTimer > 0) {
      this.spawnSparks(this.player.x + this.player.facing * 1.15, this.player.bottom + 0.8, CREAM, 1, 1.2);
    }
    if (this.player.formAttackTimer > 0 && this.player.shoeForm !== "hightop") {
      const formColor = this.player.shoeForm === "loafer" ? MOSS : this.player.shoeForm === "cowboy" ? GOLD : this.player.shoeForm === "sneaker" ? VIOLET : RESCUE_CORAL;
      this.spawnSparks(this.player.x - this.player.facing * 0.34, this.player.bottom + 0.56, formColor, 1, 1.55);
    }
    if (this.player.ultraTimer > 0) {
      this.spawnSparks(this.player.x - this.player.facing * 0.36, this.player.bottom + 0.82, VIOLET, 2, 2.2);
    }
    if (this.player.superJumpTimer > 0) {
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.3, CYAN, 1, 1.7);
    }
  }

  /** "Dark aura" -- every enemy, regardless of kind, gets a soft dark halo sitting just
   * behind it, the enemy-side counterpart to createPickup's bright glint: pickups shine,
   * enemies loom, background scenery goes flat and dull (see createMaterial's flat
   * option). Lazily attached from updateEnemies the first time each enemy is processed
   * rather than touched into every createXxx() call site, so this covers every enemy kind
   * -- including the legacy ?superrun world's own enemy list -- from one place. */
  private attachDarkAura(enemy: Enemy): Mesh {
    const scale = enemy.bossTier === "boss" ? 1.95 : enemy.bossTier === "mini" ? 1.5 : 1.05;
    const aura = MeshBuilder.CreateDisc(`enemyAura-${enemy.kind}-${enemy.x}`, { radius: 0.5 * scale, tessellation: 24 }, this.scene);
    aura.parent = enemy.root;
    aura.position = new Vector3(0, -0.04, 0.22);
    const auraMat = new StandardMaterial(`enemyAuraMat-${enemy.kind}-${enemy.x}`, this.scene);
    auraMat.diffuseColor = new Color3(0.04, 0.015, 0.07);
    auraMat.emissiveColor = new Color3(0.16, 0.03, 0.24);
    auraMat.specularColor = new Color3(0, 0, 0);
    auraMat.alpha = 0.5;
    aura.material = auraMat;
    return aura;
  }

  private updateEnemies(delta: number) {
    const slowFactor = this.player.moonTimer > 0 ? 0.36 : 1;
    const cinematicSlow = this.superRun && this.superRunPauseTimer > 0 ? 0.12 : 1;
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        if (enemy.defeatTimer && enemy.defeatTimer > 0) {
          enemy.defeatTimer = Math.max(0, enemy.defeatTimer - delta);
          const fall = 1 - enemy.defeatTimer / (enemy.bossTier === "boss" ? 1.25 : enemy.bossTier === "mini" ? 0.92 : 0.58);
          enemy.root.position.y = enemy.bottom + fall * 0.72;
          enemy.root.rotation.z += (enemy.speed >= 0 ? 1 : -1) * delta * (enemy.bossTier ? 7.6 : 10.8);
          const shrink = Math.max(0.22, 1 - fall * (enemy.bossTier ? 0.22 : 0.48));
          enemy.root.scaling.y = (enemy.bossTier === "boss" ? 1.72 : enemy.bossTier === "mini" ? 1.24 : 1) * shrink;
          enemy.root.scaling.z = (enemy.bossTier === "boss" ? 1.72 : enemy.bossTier === "mini" ? 1.24 : 1) * shrink;
          if (enemy.defeatTimer <= 0) enemy.root.setEnabled(false);
        }
        continue;
      }
      enemy.auraMesh = enemy.auraMesh ?? this.attachDarkAura(enemy);
      const auraPulse = 0.88 + 0.16 * Math.sin(this.titleTime * 2.3 + enemy.phase);
      enemy.auraMesh.scaling.setAll(auraPulse);
      if (enemy.bossTier) {
        this.updateBossPattern(enemy, delta, slowFactor * cinematicSlow);
      } else if (enemy.kind === "moth") {
        this.updateMothFlight(enemy, delta, slowFactor * cinematicSlow);
      } else if (enemy.kind !== "gumTurret") {
        this.updatePatrolAndAggro(enemy, delta, slowFactor * cinematicSlow);
      }

      // Ranged threat, complementing touch damage: slime and Gum Turret both throw at a
      // player who's near enough to be worth targeting but far enough that a stomp isn't
      // the obvious answer -- see THROW_RANGE_MIN/MAX. gumTurret never moves at all (it's
      // not routed through updatePatrolAndAggro above), so this is its only offense.
      if (enemy.kind === "slime" || enemy.kind === "gumTurret") {
        enemy.throwCooldown = Math.max(0, (enemy.throwCooldown ?? Math.random() * THROW_COOLDOWN) - delta * slowFactor * cinematicSlow);
        const throwDist = Math.abs(this.player.x - enemy.x);
        const throwHeight = Math.abs(this.player.bottom - enemy.bottom);
        if (enemy.throwCooldown <= 0 && throwDist > THROW_RANGE_MIN && throwDist < THROW_RANGE_MAX && throwHeight < 4) {
          this.throwProjectile(enemy);
          enemy.throwCooldown = THROW_COOLDOWN;
        }
      }

      const windupPulse = enemy.attackState === "windup" ? 1 + Math.sin(this.titleTime * 18) * 0.12 : 1;
      const baseScale = (enemy.bossTier === "boss" ? 1.72 : enemy.bossTier === "mini" ? 1.24 : 1) * windupPulse;
      const gait = Math.sin(this.titleTime * (enemy.bossTier ? 3.2 : 6.2) + enemy.phase);
      const hover = enemy.kind === "skate" ? Math.sin(this.titleTime * 3.1 + enemy.phase) * 0.16 : enemy.kind === "moth" ? 0 : gait * (enemy.bossTier ? 0.045 : 0.075);
      const wingFlutter = enemy.kind === "moth" ? Math.sin(this.titleTime * (enemy.diving ? 26 : 14) + enemy.phase) * (enemy.diving ? 0.05 : 0.1) : 0;
      const squash = enemy.kind === "slime" ? gait * 0.12 : enemy.kind === "moth" ? 0 : gait * 0.035;
      enemy.root.position.x = enemy.x;
      enemy.root.position.y = enemy.bottom + hover + wingFlutter;
      enemy.root.rotation.z = enemy.kind === "moth" ? (enemy.diving ? -enemy.speed * 0.02 : gait * 0.1) : gait * (enemy.kind === "slime" ? 0.12 : enemy.bossTier ? 0.045 : 0.065);
      enemy.root.scaling.x = (enemy.speed < 0 ? -1 : 1) * baseScale * (1 + squash * 0.35);
      enemy.root.scaling.y = baseScale * (1 - squash);
      enemy.root.scaling.z = baseScale * (1 + squash * 0.28);

      const horizontal = Math.abs(this.player.x - enemy.x) < (PLAYER_WIDTH + enemy.width) / 2;
      const playerTop = this.player.bottom + PLAYER_HEIGHT;
      const enemyTop = enemy.bottom + enemy.height;
      const stomp = horizontal && this.player.vy < -1.5 && this.player.bottom <= enemyTop + 0.28 && playerTop >= enemy.bottom;
      const sideHit = horizontal && this.player.bottom < enemyTop - 0.08 && playerTop > enemy.bottom + 0.12;
      if (stomp && enemy.bossTier !== "boss") {
        if (enemy.gumArmored) {
          // Only tryGumStomp can defeat this one; an ordinary jump-stomp just bounces
          // off, so the ability keeps a reason to matter when it finally comes up.
          this.player.vy = Math.max(this.player.vy, 5.4);
          this.spawnSparks(enemy.x, enemy.bottom + enemy.height * 0.9, MOSS, 8, 2.2);
          this.message = "Gum Turret shrugs off the stomp -- only Gum Stomp cracks its shell.";
          this.publishUi(true);
        } else {
          this.damageEnemy(enemy);
        }
      } else if (sideHit && this.player.dashTimer <= 0 && this.player.formShieldTimer <= 0 && this.player.ultraTimer <= 0) {
        if (this.isAgentRun) this.reportAgentOutcome(enemy, "player_damaged");
        // Contact damage scales with what actually hit you: a regular enemy is a poke (1),
        // a mini-boss hits harder (2), and the true boss's telegraphed lunge -- the
        // "windup" pulse everyone can see coming -- is the one hit that can take a whole
        // life's hearts in one shot (maxHearts), same as the user's own description of a
        // boss "super move". Standing in the boss's way outside that window still costs 2,
        // not a free pass just for being the true boss.
        const amount =
          enemy.bossTier === "boss" ? (enemy.attackState === "lunge" ? this.player.maxHearts : 2) : enemy.bossTier === "mini" ? 2 : 1;
        this.damagePlayer(
          enemy.bossTier === "boss" && enemy.attackState === "lunge"
            ? `${enemy.bossName ?? "The Tangled Titan"}'s full-force lunge connects!`
            : enemy.kind === "skate"
              ? "Rogue skate clipped the rescue route."
              : enemy.kind === "moth"
                ? "A dive-bombing moth clipped Right Shoe."
                : enemy.kind === "gumTurret"
                  ? "The Gum Turret's sticky wad caught Right Shoe."
                  : "A shoe fiend knocked Right Shoe back.",
          amount,
        );
      }
    }
  }

  /** Regular enemies patrol their minX/maxX lane by default, but break from it and
   * chase directly toward the player once within ENEMY_AGGRO_RANGE (and roughly the
   * same height, so a chase never triggers through a floor/ceiling), extending a short
   * leash past minX/maxX while doing so. They give up and resume patrolling once the
   * player is well clear again, so "use power on them or get around them" is a real
   * choice instead of a passive bounce the player can just walk past. */
  private updatePatrolAndAggro(enemy: Enemy, delta: number, timeScale: number) {
    const dist = Math.abs(this.player.x - enemy.x);
    const nearHeight = Math.abs(this.player.bottom - enemy.bottom) < 3.2;
    if (!enemy.aggro && dist < ENEMY_AGGRO_RANGE && nearHeight) enemy.aggro = true;
    else if (enemy.aggro && (dist > ENEMY_AGGRO_RANGE * 1.8 || !nearHeight)) enemy.aggro = false;

    if (enemy.aggro) {
      const leashMin = enemy.minX - ENEMY_LEASH;
      const leashMax = enemy.maxX + ENEMY_LEASH;
      const direction = this.player.x >= enemy.x ? 1 : -1;
      const chaseSpeed = Math.abs(enemy.speed) * 1.85;
      enemy.x = Math.max(leashMin, Math.min(leashMax, enemy.x + direction * chaseSpeed * timeScale * delta));
      enemy.speed = direction * Math.abs(enemy.speed);
    } else {
      enemy.x += enemy.speed * timeScale * delta;
      if (enemy.x < enemy.minX || enemy.x > enemy.maxX) {
        enemy.x = Math.max(enemy.minX, Math.min(enemy.maxX, enemy.x));
        enemy.speed *= -1;
      }
    }
  }

  /** Launches one mud clump (slime) or rock (gumTurret) at the player on a simple
   * ballistic arc -- same gravity constant updateProjectiles applies, so the throw
   * visibly arcs rather than flying in a flat line. */
  private throwProjectile(enemy: Enemy) {
    const kind: "mud" | "rock" = enemy.kind === "gumTurret" ? "rock" : "mud";
    const color = kind === "rock" ? ROCK_COLOR : MUD_COLOR;
    const originY = enemy.bottom + enemy.height * 0.6;
    const mesh = MeshBuilder.CreateSphere(`projectile-${kind}-${this.titleTime.toFixed(3)}-${enemy.x}`, { diameter: 0.32, segments: 10 }, this.scene);
    mesh.position = new Vector3(enemy.x, originY, -0.35);
    mesh.material = this.createMaterial(`projectileMat-${kind}-${this.titleTime.toFixed(3)}`, color, color.scale(0.4));

    const direction = this.player.x >= enemy.x ? 1 : -1;
    const distance = Math.max(0.1, Math.abs(this.player.x - enemy.x));
    const travelTime = Math.max(0.4, distance / THROW_SPEED);
    const targetY = this.player.bottom + 0.7;
    const vx = direction * THROW_SPEED;
    const gravity = 21.5; // same constant updatePlayer() falls under, so the arc reads as consistent physics
    const vy = (targetY - originY) / travelTime + 0.5 * gravity * travelTime;

    this.projectiles.push({ kind, root: mesh, x: enemy.x, y: originY, vx, vy, life: 2.5 });
    this.spawnSparks(enemy.x, originY, color, 6, 1.6);
  }

  /** Moves every thrown projectile under the same gravity constant the player falls
   * under, checks it against the player each frame, and clears it out on a hit, a
   * timeout, or falling off the bottom of the world -- projectiles never accumulate
   * indefinitely. */
  private updateProjectiles(delta: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.vy -= 21.5 * delta;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      projectile.root.position.x = projectile.x;
      projectile.root.position.y = projectile.y;
      projectile.root.rotation.z += delta * 6 * (projectile.vx < 0 ? -1 : 1);

      const hitPlayer =
        this.mode === "playing" &&
        Math.abs(projectile.x - this.player.x) < 0.55 &&
        Math.abs(projectile.y - (this.player.bottom + 0.7)) < 0.6;

      if (hitPlayer && this.player.dashTimer <= 0 && this.player.formShieldTimer <= 0 && this.player.ultraTimer <= 0) {
        this.damagePlayer(projectile.kind === "rock" ? "A hurled rock clipped Right Shoe." : "A thrown mud clump splattered Right Shoe.");
        this.spawnSparks(projectile.x, projectile.y, projectile.kind === "rock" ? ROCK_COLOR : MUD_COLOR, 10, 2.0);
        // Mesh only, not the material -- throwProjectile's material comes from the
        // shared cache (see materialCache), reused across every mud/rock throw.
        projectile.root.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (projectile.life <= 0 || projectile.y < -8) {
        projectile.root.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Mini/true bosses are always fixated on the player -- no aggro range, no giving up --
   * but cycle through a small attack pattern rather than just following: chase in close,
   * telegraph a brief windup (see the windupPulse scale cue in updateEnemies), lunge at
   * high speed, then recover before chasing again. */
  private updateBossPattern(enemy: Enemy, delta: number, timeScale: number) {
    enemy.attackState = enemy.attackState ?? "chase";
    enemy.attackTimer = (enemy.attackTimer ?? (enemy.bossTier === "boss" ? 4.2 : 3.4)) - delta * timeScale;
    const direction = this.player.x >= enemy.x ? 1 : -1;
    const baseSpeed = Math.abs(enemy.speed);

    if (enemy.attackState === "chase") {
      enemy.x = Math.max(enemy.minX, Math.min(enemy.maxX, enemy.x + direction * baseSpeed * timeScale * delta));
      enemy.speed = direction * baseSpeed;
      if (enemy.attackTimer <= 0 && Math.abs(this.player.x - enemy.x) < 4.2) {
        enemy.attackState = "windup";
        enemy.attackTimer = 0.5;
      }
    } else if (enemy.attackState === "windup") {
      // Holds position -- the visible telegraph is the windupPulse scale cue applied
      // in updateEnemies just after this call, not any movement here.
      if (enemy.attackTimer <= 0) {
        enemy.attackState = "lunge";
        enemy.attackTimer = 0.4;
      }
    } else if (enemy.attackState === "lunge") {
      enemy.x = Math.max(enemy.minX, Math.min(enemy.maxX, enemy.x + direction * baseSpeed * 3.1 * timeScale * delta));
      enemy.speed = direction * baseSpeed;
      if (enemy.attackTimer <= 0) {
        enemy.attackState = "recover";
        enemy.attackTimer = 0.7;
      }
    } else {
      enemy.x = Math.max(enemy.minX, Math.min(enemy.maxX, enemy.x + direction * baseSpeed * 0.4 * timeScale * delta));
      if (enemy.attackTimer <= 0) {
        enemy.attackState = "chase";
        enemy.attackTimer = enemy.bossTier === "boss" ? 4.2 : 3.4;
      }
    }
  }

  /** Drives the Moth's hover-and-dive behavior: it patrols like any other enemy
   * horizontally (handled by the shared loop above), but its vertical position and
   * occasional dive toward the player are its own state machine rather than the simple
   * sine-wave hover every other enemy uses. */
  private updateMothFlight(enemy: Enemy, delta: number, timeScale: number) {
    const home = enemy.homeBottom ?? enemy.bottom;
    enemy.diveTimer = (enemy.diveTimer ?? 2.4) - delta * timeScale;
    const playerNear = Math.abs(this.player.x - enemy.x) < 6.5;
    if (!enemy.diving && enemy.diveTimer <= 0) {
      if (playerNear) {
        enemy.diving = true;
        enemy.diveTimer = 0.85;
      } else {
        enemy.diveTimer = 0.5;
      }
    }
    if (enemy.diving) {
      const target = this.player.bottom + 0.25;
      enemy.bottom += (target - enemy.bottom) * Math.min(1, 6.5 * delta);
      if (enemy.diveTimer <= 0) {
        enemy.diving = false;
        enemy.diveTimer = 2.6 + (Math.abs(enemy.phase) % 2);
      }
    } else {
      enemy.bottom += (home - enemy.bottom) * Math.min(1, 3.4 * delta);
    }
  }

  private updatePickups(delta: number) {
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      pickup.root.position.y = pickup.y + Math.sin(this.titleTime * 3 + pickup.phase) * 0.11;
      pickup.root.rotation.z += delta * 0.8;
      pickup.glint.rotation.z += delta * 2.1;
      const twinkle = 0.75 + 0.4 * Math.max(0, Math.sin(this.titleTime * 4.4 + pickup.phase * 1.7));
      pickup.glint.scaling.setAll(twinkle);
      if (Math.abs(this.player.x - pickup.x) < pickup.radius + 0.48 && Math.abs(this.player.bottom + 0.7 - pickup.root.position.y) < pickup.radius + 0.7) {
        this.collectPickup(pickup);
      }
    }
  }

  /** Hearts/lives/score/kills/abilities-in-stock, in one line -- read out at every
   * checkpoint (see updateCheckpoints) so a status check doesn't require pausing to hunt
   * across the whole HUD, and so an agent run's decision log carries a periodic full
   * situational recap alongside its usual per-decision entries. */
  private buildCheckpointRecap(): string {
    const abilities: string[] = [];
    if (this.player.dashCharges > 0) abilities.push(`${this.player.dashCharges} dash${this.player.dashCharges === 1 ? "" : "es"}`);
    if (this.player.doubleJumps > 0) abilities.push(`${this.player.doubleJumps} wingtip jump${this.player.doubleJumps === 1 ? "" : "s"}`);
    if (this.player.ultraMove) abilities.push("Ultra Move");
    const gumStompCount = this.player.specialMoveQueue.filter((kind) => kind === "gumStomp").length;
    const laceLashCount = this.player.specialMoveQueue.filter((kind) => kind === "laceLash").length;
    if (gumStompCount > 0) abilities.push(`Gum Stomp x${gumStompCount}`);
    if (laceLashCount > 0) abilities.push(`Lace Lash x${laceLashCount}`);
    const stock = abilities.length > 0 ? abilities.join(", ") : "no abilities banked";
    return `${this.player.hearts}/${this.player.maxHearts} hearts, ${this.player.lives} ${this.player.lives === 1 ? "life" : "lives"}, ${this.buttons} pts, ${this.enemiesDefeated} defeated, ${stock}.`;
  }

  private updateCheckpoints() {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.activated && this.player.x >= checkpoint.x) {
        checkpoint.activated = true;
        this.activeCheckpoint = checkpoint.label;
        this.activeCheckpointX = checkpoint.x;
        // Same reassign-not-mutate fix as updateLevelMarkers -- see its own comment.
        const litMaterial = this.createMaterial("checkpointLitMat", GOLD, GOLD);
        checkpoint.root.getChildMeshes().forEach((mesh) => { mesh.material = litMaterial; });
        const recap = this.buildCheckpointRecap();
        this.message = `Checkpoint stitched: ${checkpoint.label}. ${recap}`;
        if (this.isAgentRun) this.logAgent(`⚑ checkpoint ${checkpoint.label} — ${recap}`);
        this.spawnSparks(checkpoint.x, -3.1, GOLD, 16, 2.4);
        this.audio.playCheckpoint();
        this.publishUi(true);
      }
    }
  }

  private updateSparks(delta: number) {
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      spark.life -= delta;
      spark.mesh.position.addInPlace(spark.velocity.scale(delta));
      spark.velocity.y -= 4.5 * delta;
      spark.mesh.scaling.scaleInPlace(spark.scaleRate ? 1 + spark.scaleRate * delta : 0.98);
      if (spark.rotationRate) spark.mesh.rotation.z += spark.rotationRate * delta;
      if (spark.fade) {
        const material = spark.mesh.material as StandardMaterial | null;
        if (material) material.alpha = Math.max(0, spark.life / spark.maxLife);
      }
      if (spark.life <= 0) {
        const material = spark.mesh.material as StandardMaterial | null;
        spark.mesh.dispose();
        material?.dispose();
        this.sparks.splice(index, 1);
      }
    }
  }

  private updateDecor(delta: number) {
    if (this.mode === "won" && this.reunionTimer > 0) {
      const before = Math.ceil(this.reunionTimer);
      this.reunionTimer = Math.max(0, this.reunionTimer - delta);
      const danceBeat = Math.sin(this.titleTime * 7.2);
      this.player.root.position.y = this.player.bottom + 0.12 + Math.abs(danceBeat) * 0.28;
      this.player.root.rotation.z = danceBeat * 0.22;
      if (this.heroSprite) this.heroSprite.rotation.z = danceBeat * 0.16;
      if (before !== Math.ceil(this.reunionTimer)) {
        this.spawnSparks(this.player.x + 0.8, this.player.bottom + 1.1, RESCUE_CORAL, 9, 2.4);
        this.publishUi(false);
      }
    }
    this.parallax.forEach((mesh, index) => {
      mesh.position.x += Math.sin(this.titleTime * 0.23 + index) * 0.0007;
    });
    if (this.leftShoe) {
      const leftDance = this.mode === "won" ? Math.sin(this.titleTime * 7.2 + Math.PI) : Math.sin(this.titleTime * 2.1) * 0.48;
      this.leftShoe.position.y = this.leftShoeBaseY + (this.mode === "won" ? Math.abs(leftDance) * 0.26 : leftDance * 0.15);
      this.leftShoe.rotation.z = leftDance * (this.mode === "won" ? 0.16 : 0.035);
    }
    if (this.leftShoeHalo) this.leftShoeHalo.rotation.z += 0.006;
  }

  private updateCamera(delta: number) {
    const spectator = this.superRun;
    // Was hardcoded to 50 -- well short of WORLD_END (66), so once the player pushed past
    // roughly x=51.8 the camera stopped following and they visually ran into the right
    // edge of the screen with nowhere to go, even though held.left still worked fine in
    // world space. Tying the cap to WORLD_END keeps the camera able to follow all the way
    // to the tower/Left Shoe area regardless of future level-length changes.
    const targetX = Math.max(0, Math.min(this.worldEnd - 3, this.player.x - (spectator ? 5.2 : 1.8)));
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, (spectator ? 2.35 : 4.2) * delta);
    this.cameraKickTimer = Math.max(0, this.cameraKickTimer - delta);
    const kick = this.cameraKickTimer > 0 ? Math.sin(this.titleTime * 44) * this.cameraKickStrength * (this.cameraKickTimer / 0.36) : 0;
    if (this.cameraKickTimer <= 0) this.cameraKickStrength = 0;
    // Camera sits ~2.5 units above its look-at point over a 16-unit view distance (~9
    // degrees of downward pitch, under the "10 degrees or less" the user asked for) so
    // platform tops are actually visible instead of edge-on -- was a dead-level side view
    // (camera.y was *below* target.y, if anything tilted very slightly upward).
    this.camera.position.y = CAMERA_TILT_HEIGHT + kick * 0.32;
    this.camera.setTarget(new Vector3(this.camera.position.x + (spectator ? 4.6 : 1.2), -0.4 + kick * 0.1, 0));

    if (this.cameraZoomTimer > 0 && this.cameraZoomBase) {
      this.cameraZoomTimer = Math.max(0, this.cameraZoomTimer - delta);
      const t = this.cameraZoomTimer / CAMERA_PUNCH_DURATION; // 1 -> 0 over the punch's life
      const punch = 1 - CAMERA_PUNCH_STRENGTH * Math.sin(Math.min(1, t) * Math.PI); // eases in, then back out
      this.camera.orthoTop = this.cameraZoomBase.top * punch;
      this.camera.orthoBottom = this.cameraZoomBase.bottom * punch;
      this.camera.orthoLeft = this.cameraZoomBase.left * punch;
      this.camera.orthoRight = this.cameraZoomBase.right * punch;
      if (this.cameraZoomTimer <= 0) this.cameraZoomBase = null; // released back to scene.ts's own resize-driven bounds
    }
  }

  private triggerCinematicBeat(duration: number, strength: number) {
    this.cameraKickTimer = Math.max(this.cameraKickTimer, duration);
    this.cameraKickStrength = Math.max(this.cameraKickStrength, strength);
    if (this.superRun) this.superRunPauseTimer = Math.max(this.superRunPauseTimer, Math.min(0.58, duration * 1.45));
  }

  private spawnImpactRing(x: number, y: number, color: Color3, radius: number) {
    const ring = MeshBuilder.CreateTorus(`impactRing-${this.titleTime}-${x}`, { diameter: radius * 2, thickness: Math.max(0.07, radius * 0.12), tessellation: 28 }, this.scene);
    ring.position = new Vector3(x, y, -0.78);
    ring.rotation.x = Math.PI / 2;
    const material = this.createMaterial(`impactRingMat-${this.titleTime}-${x}`, color, color.scale(0.65), false);
    material.alpha = 0.88;
    material.backFaceCulling = false;
    ring.material = material;
    ring.isPickable = false;
    this.sparks.push({ mesh: ring, velocity: new Vector3(0, 0.34, 0), life: 0.44, maxLife: 0.44, scaleRate: 2.8, rotationRate: 3.6, fade: true });
  }

  /** Routes a landed hit through boss-tier multi-hit health (maxHits, see
   * createMiniBoss/createTrueBoss) before falling through to an outright kill --
   * "dancing around your enemies so you aren't killed while fighting" needs something to
   * dance AROUND, so a mini-boss/true-boss now actually survives a hit and forces a real
   * stagger beat instead of dropping the instant any attack connects, same as every regular
   * enemy still does. Every real-combat hit site (tryLaceLash, tryGumStomp,
   * performSuperKick, the jump-stomp collision) calls this instead of defeatEnemy directly;
   * tryUltraMove and the scripted-only clearSuperRunEnemies sweep deliberately keep calling
   * defeatEnemy straight through -- see their own comments for why. */
  private damageEnemy(enemy: Enemy) {
    if (!enemy.alive) return;
    if (enemy.maxHits == null) {
      this.defeatEnemy(enemy);
      return;
    }
    enemy.hitsRemaining = (enemy.hitsRemaining ?? enemy.maxHits) - 1;
    if (enemy.hitsRemaining <= 0) {
      this.defeatEnemy(enemy);
      return;
    }
    // Staggered, not defeated: force the same "recover" beat updateBossPattern already uses
    // after a lunge (holds position, can't windup/lunge again yet) -- that beat IS the dodge
    // window, held a little longer than its natural post-lunge length so retreating and
    // re-engaging reads as a deliberate choice, not a coin flip against its normal cadence.
    enemy.attackState = "recover";
    enemy.attackTimer = 1.2;
    // Same bounce defeatEnemy always gives a successful stomp -- without this, stomping a
    // boss that survives left the player just standing on top of it with no bounce-back,
    // since a stagger never reaches defeatEnemy's own player.vy line.
    this.player.vy = Math.max(this.player.vy, 6.1);
    this.triggerCinematicBeat(enemy.bossTier === "boss" ? 0.24 : 0.16, enemy.bossTier === "boss" ? 0.12 : 0.08);
    this.spawnSparks(enemy.x, enemy.bottom + enemy.height * 0.6, CREAM, 14, 3.4);
    this.spawnImpactRing(enemy.x, enemy.bottom + enemy.height * 0.6, CREAM, 0.9);
    this.audio.playStomp(enemy.bossTier);
    this.message = `${enemy.bossName ?? "The boss"} staggers -- ${enemy.hitsRemaining} more hit${enemy.hitsRemaining === 1 ? "" : "s"} to break through.`;
    if (this.isAgentRun) this.logAgent(`⚔ ${enemy.bossName ?? enemy.kind} staggered -- ${enemy.hitsRemaining} hits left`);
    this.publishUi(true);
  }

  private defeatEnemy(enemy: Enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.defeatTimer = enemy.bossTier === "boss" ? 1.25 : enemy.bossTier === "mini" ? 0.92 : 0.58;
    this.triggerCinematicBeat(enemy.bossTier === "boss" ? 0.36 : enemy.bossTier === "mini" ? 0.24 : 0.1, enemy.bossTier === "boss" ? 0.2 : 0.09);
    this.player.vy = 6.1;
    if (enemy.bossTier === "boss") this.bossDefeated = true;
    if (this.isAgentRun) this.reportAgentOutcome(enemy, "enemy_defeated");
    this.enemiesDefeated += 1;
    this.buttons += enemy.bossTier === "boss" ? 20 : enemy.bossTier === "mini" ? 8 : 4;
    this.message = enemy.bossTier === "boss"
      ? "BOSS DOWN: The Tangled Titan’s knot unravels from the rescue tower."
      : enemy.bossTier === "mini"
        ? `MINI-BOSS DOWN: ${enemy.bossName} clears the power route.`
        : "Sole stomp! A rescue spark lights the way.";
    const burst = enemy.bossTier === "boss" ? VIOLET : enemy.bossTier === "mini" ? RESCUE_CORAL : GOLD;
    this.spawnSparks(enemy.x, enemy.bottom + 0.6, burst, enemy.bossTier === "boss" ? 46 : enemy.bossTier === "mini" ? 28 : 16, enemy.bossTier === "boss" ? 5.4 : enemy.bossTier === "mini" ? 4.2 : 3.1);
    this.spawnImpactRing(enemy.x, enemy.bottom + 0.7, burst, enemy.bossTier === "boss" ? 1.5 : enemy.bossTier === "mini" ? 1.14 : 0.72);
    this.audio.playStomp(enemy.bossTier);
    // A comic-book beat on the two kills that actually deserve fanfare -- a regular
    // enemy dies constantly (every stomp) and gets only a tiny hit-stop so kills still
    // feel snappy without the pop text becoming noise; mini-bosses and the true boss are
    // rare enough to earn the full "this really landed" treatment.
    if (enemy.bossTier === "boss") {
      this.triggerHitStop(0.22);
      this.triggerCameraPunch(CAMERA_PUNCH_DURATION);
      this.showComicPop("K.O.!");
    } else if (enemy.bossTier === "mini") {
      this.triggerHitStop(0.13);
      this.showComicPop("KA-POW!");
    } else {
      this.triggerHitStop(0.045);
    }
    this.publishUi(true);
  }

  private damagePlayer(reason: string, amount = 1) {
    if (this.player.invulnerable > 0 || this.mode !== "playing") return;
    // The scripted Super Run preview (no real model behind it, see
    // recordRunCompletion) keeps the old harmless absorb: it's a canned
    // showcase, not a competitor. A genuine agent run (isAgentRun) is the
    // opposite case on purpose -- if a wrong or premature tactic can never
    // actually cost anything, every model looks identical to a viewer and
    // the leaderboard can't tell a good one from a bad one. Same real-hit
    // path as a human run below, just with agent-flavored messaging.
    if (this.superRun && !this.isAgentRun) {
      this.player.invulnerable = 0.85;
      this.setAgentActivity("dodging", "LACE BARRIER");
      this.message = `AI SUPER RUN: ${this.superRunAction}`;
      this.spawnSparks(this.player.x, this.player.bottom + 0.65, CYAN, 9, 2.3);
      this.publishUi(true);
      return;
    }
    // Whatever goal the agent was pursuing when this actually landed gets reported as a
    // negative outcome right now, not left to time out as "avoided" later -- see
    // agentGoalDecisionId's own docstring for the full round trip.
    if (this.isAgentRun && this.agentGoalDecisionId != null) {
      this.reportDecisionOutcome(this.agentGoalDecisionId, "player_damaged");
      this.agentGoalDecisionId = null;
    }
    this.player.hearts = Math.max(0, this.player.hearts - amount);
    // Live-tested: agents kept "advance"-ing straight through incoming fire without ever
    // seeming to notice they'd just been hit, because the next priorityAction call could
    // still be seconds away on the normal cadence. Taking damage forces a fresh decision
    // soon, the same way tickAgentGoal already shortens the wait for a newly-visible
    // pickup/enemy -- reacting to "I'm losing hearts" shouldn't wait longer than that.
    if (this.isAgentRun && this.player.hearts > 0) this.agentGoalTimer = Math.min(this.agentGoalTimer, 0.5);
    this.player.invulnerable = 1.35;
    this.player.vx = -this.player.facing * 7.8;
    this.player.vy = 5.2;
    this.message = this.isAgentRun ? `AGENT RUN: ${reason}` : reason;
    this.spawnSparks(this.player.x, this.player.bottom + 0.65, RESCUE_CORAL, 14, 2.6);
    this.audio.playHit();
    if (this.isAgentRun && this.player.hearts > 0) {
      this.superRunAction = `AGENT TAKES A HIT — ${this.agentBackend}/${this.agentModel} is down to ${this.player.hearts} heart${this.player.hearts === 1 ? "" : "s"}.`;
    }
    if (this.player.hearts <= 0) {
      // Losing all hearts costs a life, not the whole run -- only falling out of bounds
      // drops a screen (see handleBoardFall). With lives still in reserve, this respawns
      // at the last checkpoint within the *same* screen: hearts refill, enemies/pickups
      // already resolved in this screen stay resolved, nothing about the screen resets.
      this.player.lives -= 1;
      if (this.player.lives > 0) {
        this.player.hearts = this.player.maxHearts;
        this.player.x = this.activeCheckpointX;
        // Drop in from above the highest platform the generator can place (py maxes out
        // at +3.4, see buildScreenContent) rather than forcing ground level -- live-tested,
        // always respawning on the ground could strand the player below a platform chain
        // they needed to already be partway up, with nothing at ground level able to
        // reach back to it in one jump. Falling and landing naturally (same collision path
        // as any ordinary fall) puts them on whatever's actually there at this x --
        // a platform if one exists, the ground floor otherwise.
        this.player.bottom = 5.5;
        this.player.grounded = false;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.invulnerable = 1.8;
        this.message = this.isAgentRun
          ? `${this.agentBackend}/${this.agentModel} is down to its last stitch -- respawning at ${this.activeCheckpoint} with ${this.player.lives} life${this.player.lives === 1 ? "" : "ves"} left.`
          : `Right Shoe respawns at ${this.activeCheckpoint} -- ${this.player.lives} life${this.player.lives === 1 ? "" : "ves"} left.`;
        this.setAgentActivity("fallback", "LIFE LOST");
        if (this.isAgentRun) this.logAgent(`⚠ lost a life -- ${this.player.lives} left, respawning at ${this.activeCheckpoint}`);
        this.spawnSparks(this.player.x, this.player.bottom + 0.6, GOLD, 16, 2.6);
        this.audio.playCheckpoint();
      } else {
        this.mode = "lost";
        this.message = this.isAgentRun
          ? `${this.agentBackend}/${this.agentModel} couldn't make it. Try another model, or take the route yourself.`
          : "The route tangled. Press restart and try again.";
        if (this.isAgentRun) this.superRunAction = `AGENT DOWN — ${this.agentBackend}/${this.agentModel} ran out of route integrity.`;
        this.player.root.setEnabled(false);
        this.audio.playDefeat();
        this.audio.stopMusic();
        this.handleRunEnded("lost");
      }
    }
    this.publishUi(true);
  }

  private collectPickup(pickup: Pickup) {
    pickup.collected = true;
    pickup.root.setEnabled(false);
    this.audio.playCollect(pickup.kind);
    if (pickup.kind === "button") {
      this.buttons += 1;
      this.spawnSparks(pickup.x, pickup.y, GOLD, 5, 1.35);
    }
    if (pickup.kind === "feather") {
      this.player.doubleJumps += 1;
      this.message = "Wingtip Feather: one double jump stitched in.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 15, 2.7);
    }
    if (pickup.kind === "dash") {
      this.player.dashCharges += 1;
      this.message = "Lace Dash spool: Shift unlocks a burst.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 15, 2.7);
    }
    if (pickup.kind === "heart") {
      this.player.hearts = Math.min(this.player.maxHearts, this.player.hearts + 1);
      this.message = "Heart Sole: Right Shoe feels lighter.";
      this.spawnSparks(pickup.x, pickup.y, RESCUE_CORAL, 17, 2.8);
    }
    if (pickup.kind === "heartPlus") {
      this.player.maxHearts = Math.min(MAX_HEARTS_CAP, this.player.maxHearts + 1);
      this.player.hearts = this.player.maxHearts;
      this.message = `Heart+ Sole: max hearts raised to ${this.player.maxHearts} for this life.`;
      this.spawnSparks(pickup.x, pickup.y, GOLD, 24, 3.2);
      this.spawnImpactRing(pickup.x, pickup.y, GOLD, 1.15);
      this.showPickupSplash("HEART+!");
    }
    if (pickup.kind === "extraLife") {
      this.player.lives = Math.min(MAX_LIVES_CAP, this.player.lives + 1);
      this.message = `Extra Life Charm: ${this.player.lives} lives now in reserve.`;
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 26, 3.4);
      this.spawnImpactRing(pickup.x, pickup.y, VIOLET, 1.2);
      this.showPickupSplash("EXTRA LIFE!");
    }
    if (pickup.kind === "moon") {
      this.player.moonTimer = Math.max(this.player.moonTimer, 12);
      this.message = "Moon Insole: shoe fiends slow to a crawl.";
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 18, 2.6);
      this.spawnImpactRing(pickup.x, pickup.y, VIOLET, 1.1);
      this.showPickupSplash("MOON INSOLE!");
    }
    if (pickup.kind === "superJump") {
      this.player.superJump = true;
      this.message = "Super Jump Patch: hold the route, then launch into the sky-stitch bonus.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 24, 3.4);
      this.spawnImpactRing(pickup.x, pickup.y, CYAN, 1.2);
      this.showPickupSplash("SUPER JUMP!");
    }
    if (pickup.kind === "bonus") {
      this.buttons += 12;
      this.player.dashCharges += 1;
      this.message = "Sky Stitch bonus captured! Lace Dash receives a bonus charge.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 28, 3.8);
    }
    if (pickup.kind === "chrome") {
      this.applyShoeForm("coralChrome");
      this.message = "Coral Chrome: Right Shoe shines brighter than the rescue stars.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 22, 3.1);
      this.spawnImpactRing(pickup.x, pickup.y, GOLD, 1.2);
      this.showPickupSplash("CORAL CHROME!");
    }
    if (pickup.kind === "moonstep") {
      this.applyShoeForm("moonstep");
      this.message = "Moonstep Runner: a cobalt sneaker form is stitched in.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 24, 3.25);
      this.spawnImpactRing(pickup.x, pickup.y, CYAN, 1.2);
      this.showPickupSplash("MOONSTEP RUNNER!");
    }
    if (pickup.kind === "pump") {
      this.applyShoeForm("pump");
      this.message = "Pump transformation: Heel Strike primes on contact.";
      this.spawnSparks(pickup.x, pickup.y, RESCUE_CORAL, 28, 3.8);
      this.spawnImpactRing(pickup.x, pickup.y, RESCUE_CORAL, 1.3);
      this.showPickupSplash("PUMP FORM!");
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "hightop") {
      this.applyShoeForm("hightop");
      this.message = "Hightop transformation: Ankle Guard throws up a counter shield.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 26, 3.7);
      this.spawnImpactRing(pickup.x, pickup.y, CYAN, 1.3);
      this.showPickupSplash("HIGHTOP FORM!");
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "loafer") {
      this.applyShoeForm("loafer");
      this.message = "Loafer transformation: Slip Slide launches through the lane.";
      this.spawnSparks(pickup.x, pickup.y, MOSS, 26, 3.9);
      this.spawnImpactRing(pickup.x, pickup.y, MOSS, 1.3);
      this.showPickupSplash("LOAFER FORM!");
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "cowboy") {
      this.applyShoeForm("cowboy");
      this.message = "Cowboy Boot transformation: Spur Kick reaches across the shoebox gap.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 28, 4.1);
      this.spawnImpactRing(pickup.x, pickup.y, GOLD, 1.35);
      this.showPickupSplash("COWBOY FORM!");
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "sneaker") {
      this.applyShoeForm("sneaker");
      this.message = "Sneaker transformation: Sprint Burst chains through the final minor foes.";
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 28, 4.3);
      this.spawnImpactRing(pickup.x, pickup.y, VIOLET, 1.35);
      this.showPickupSplash("SNEAKER FORM!");
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "ultra") {
      this.player.ultraMove = true;
      this.message = "ULTRA MOVE charged: press U or tap ULTRA when The Tangled Titan closes in.";
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 34, 4.8);
      this.spawnImpactRing(pickup.x, pickup.y, VIOLET, 1.6);
      this.showPickupSplash("ULTRA MOVE!");
    }
    if (pickup.kind === "lash") {
      this.player.specialMoveQueue.push("laceLash");
      this.message = "Lace Lash added to storage: press X or tap SPECIAL MOVE to use it.";
      this.spawnSparks(pickup.x, pickup.y, CREAM, 20, 3.0);
      this.spawnImpactRing(pickup.x, pickup.y, CREAM, 1.15);
      this.showPickupSplash("LACE LASH!");
    }
    if (pickup.kind === "gum") {
      this.player.specialMoveQueue.push("gumStomp");
      this.message = "Gum Stomp added to storage: press X or tap SPECIAL MOVE to use it.";
      this.spawnSparks(pickup.x, pickup.y, MOSS, 24, 3.2);
      this.spawnImpactRing(pickup.x, pickup.y, MOSS, 1.2);
      this.showPickupSplash("GUM STOMP!");
    }
    this.publishUi(true);
  }

  /** Reaching the world's edge (see checkRescue()'s WORLD_END branch) costs a life
   * rather than ending the run outright, unless lives are already exhausted -- design per
   * the user: Level 1 gets a clean restart of that level; Level 2+ drops back into the
   * PREVIOUS level, hearts un-refilled and nothing already collected respawned, so landing
   * there under-equipped among that level's enemies is a real setback, not a free reset.
   * Distinct from damagePlayer's hearts<=0 path (combat death), which still ends the run
   * immediately -- lives are a separate, coarser currency layered on top of hearts. */
  private handleBoardFall() {
    this.player.lives -= 1;
    if (this.player.lives <= 0) {
      this.player.hearts = 0;
      this.mode = "lost";
      this.message = this.isAgentRun
        ? `${this.agentBackend}/${this.agentModel} ran out of room at the tower's edge -- and out of lives. Try another model, or take the route yourself.`
        : "Right Shoe ran out of room at the tower's edge -- and out of lives. Press restart and try again.";
      this.setAgentActivity("fallback", "OUT OF LIVES");
      this.player.root.setEnabled(false);
      this.audio.playDefeat();
      this.audio.stopMusic();
      this.handleRunEnded("lost");
      this.publishUi(true);
      return;
    }
    this.despawnMonsterNest();
    this.agentStallStrikes = 0;
    const fellFromScreen = this.isSuperRunPreview ? this.levelIndex : this.currentScreen;
    const targetScreen = Math.max(1, fellFromScreen - 1);
    if (this.isSuperRunPreview) {
      // Legacy single-world pipeline: no discrete screen to rebuild, just reposition
      // within the one shared world at the previous LEVEL_MARKERS boundary.
      this.levelIndex = targetScreen;
      this.player.x = targetScreen === 1 ? 0 : LEVEL_MARKERS[targetScreen - 2].x + 0.6;
      this.player.bottom = -4.2;
      this.player.vx = 0;
      this.player.vy = 0;
    } else {
      // Discrete-screens pipeline: dropping back a screen means genuinely rebuilding it
      // (see transitionToScreen) -- Level 1 rebuilds itself fresh at its own x=0 rather
      // than looping back into a nonexistent "Level 0".
      this.transitionToScreen(targetScreen);
    }
    this.player.invulnerable = 1.5;
    if (targetScreen === 1) {
      // "Start over" -- Level 1 gets a genuinely clean attempt.
      this.player.hearts = this.player.maxHearts;
    }
    // Level 2+ deliberately does NOT refill hearts, respawn already-collected pickups, or
    // reset enemies -- the drop itself is the penalty.
    this.held.left = false;
    if (this.isAgentRun) this.held.right = true;
    this.message =
      fellFromScreen <= 1
        ? `Fell off the board! -1 life (${this.player.lives} left) -- Level 1 starts over.`
        : `Fell off the board! -1 life (${this.player.lives} left) -- dropped back to Level ${targetScreen}/${LEVEL_COUNT}: ${LEVEL_LABELS[targetScreen - 1]}.`;
    if (this.isAgentRun) this.logAgent(`⚠ fell off the board -- -1 life (${this.player.lives} left), dropped to level ${targetScreen}/${LEVEL_COUNT}`);
    this.setAgentActivity("fallback", "FELL OFF BOARD");
    this.spawnSparks(this.player.x, this.player.bottom + 0.6, RESCUE_CORAL, 14, 2.6);
    this.audio.playHit();
    this.publishUi(true);
  }

  private checkRescue() {
    if (this.player.x < this.worldEnd - 5.3 || this.mode !== "playing") return;
    // Pinned at the literal end of the world without having won -- whether the boss is
    // still alive or the player just fell short of actually touching Left Shoe -- used to
    // just sit there stuck against the WORLD_END clamp with nothing happening. That reads
    // as broken, not as "try a different route", so it's checked first, before either of
    // the two reasons below could otherwise block it forever: treat running out of room
    // at the world's edge as a real death regardless of why the player isn't winning yet.
    if (this.player.x >= this.worldEnd - 0.15) {
      this.handleBoardFall();
      return;
    }
    const bossAlive = this.enemies.some((enemy) => enemy.alive && enemy.bossTier === "boss");
    if (bossAlive && !this.bossDefeated) {
      // Live-tested: a free-choosing agent reliably blitzed straight through to the boss
      // gate via "advance" without ever detouring for the Ultra Move pickup (the only
      // thing that can actually beat a boss-tier enemy -- see the boss-tier branch in
      // updateAgentRun, which never offers any other action against one). Once that
      // happens the run is mathematically unwinnable, not just difficult, since there is
      // no other route to bossDefeated. That's a structural dead end, not a fair
      // difficulty check, so an agent run auto-grants the pickup the instant it reaches
      // the gate without it -- it still has to actually land the Ultra Move itself.
      if (this.isAgentRun && !this.player.ultraMove) {
        const ultraPickup = this.pickups.find((pickup) => pickup.kind === "ultra" && !pickup.collected);
        if (ultraPickup) this.collectPickup(ultraPickup);
      }
      this.message = this.player.ultraMove
        ? "The Tangled Titan blocks Left Shoe’s tower — fire ULTRA MOVE!"
        : "The Tangled Titan blocks Left Shoe’s tower. Find the Ultra Move core!";
      if (this.superRun) this.setAgentActivity("targeting", "BOSS GATE");
      this.publishUi(true);
      return;
    }
    // Boss down is not itself the win: the player must actually reach and touch
    // the Left Shoe. Crossing x=60.7 alone used to auto-win here, which meant the
    // Left Shoe object was purely decorative -- this is the real touch check.
    if (!this.leftShoe) return;
    const touchingLeftShoe =
      Math.abs(this.player.x - this.leftShoe.position.x) < LEFT_SHOE_TOUCH_X &&
      Math.abs(this.player.bottom + 0.7 - this.leftShoe.position.y) < LEFT_SHOE_TOUCH_Y;
    if (!touchingLeftShoe) {
      this.message = "The tower is open — reach Left Shoe to finish the rescue.";
      if (this.superRun) this.setAgentActivity("advancing", "REACHING LEFT SHOE");
      this.publishUi(true);
      return;
    }
    this.mode = "won";
    this.reunionTimer = 6;
    if (this.superRun) { this.superRunAction = "PAIR RESTORED — BIG WIN!"; this.setAgentActivity("idle", "PAIR RESTORED"); }
    this.message = this.superRun ? "PAIR RESTORED! The AI Super Run found Left Shoe." : "Reunited! Right Shoe found the Left Shoe.";
    this.held.left = false;
    this.held.right = false;
    if (this.leftShoeHalo) this.leftShoeHalo.scaling = new Vector3(1.52, 1.52, 1.52);
    if (this.leftShoe) this.spawnSparks(this.leftShoe.position.x, this.leftShoe.position.y + 0.25, RESCUE_CORAL, 46, 4.2);
    this.audio.playVictory();
    this.audio.stopMusic();
    this.recordRunCompletion();
    this.handleRunEnded("won");
    this.publishUi(true);
  }

  /** Posts the finished run to the small leaderboard database and always writes a local
   * best time regardless of whether that post succeeds, so the player's own record is
   * never at the mercy of the server being reachable. The scripted Super Run demo counts
   * as an "agent" run here (backend "scripted") since it is not a person actually
   * playing; only the ordinary human-controlled path records as "human". */
  private recordRunCompletion() {
    // The scripted Super Run preview (superRun with no real model behind
    // it) isn't a genuine attempt by anyone: it always takes the same
    // route, at the same pace, and could never actually fail (see
    // damagePlayer). Recording it would let a canned demo occupy real
    // spots on the "agents competing" leaderboard, and would inflate the
    // player's own best time with a run they didn't play. Only a real
    // human playthrough or a real agent run (isAgentRun) counts.
    if (this.superRun && !this.isAgentRun) return;
    const seconds = Math.max(0, (Date.now() - this.runStartedAt) / 1000);
    const mode: "human" | "agent" = this.superRun ? "agent" : "human";
    const backend = this.isAgentRun ? this.agentBackend : undefined;
    const model = this.isAgentRun ? this.agentModel : undefined;

    try {
      const bestKey = "shoe-adventure:best-time";
      const previousBest = Number(window.localStorage.getItem(bestKey));
      if (!Number.isFinite(previousBest) || previousBest <= 0 || seconds < previousBest) {
        window.localStorage.setItem(bestKey, String(seconds));
      }
    } catch {
      /* localStorage unavailable (private browsing, storage disabled) -- the run still counts, it just isn't remembered locally */
    }

    fetch("/api/runs/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: this.agentRunId,
        mode,
        backend,
        model,
        seconds,
        hearts: this.player.hearts,
        buttons: this.buttons,
      }),
    }).catch(() => {
      /* Best-effort, same as the server's own history writes -- a missing or unreachable
       * server must never block the win screen the player already earned. */
    });
  }

  private spawnSparks(x: number, y: number, color: Color3, count: number, speed: number) {
    if (this.sparks.length > 90) return;
    for (let index = 0; index < count; index += 1) {
      const spark = MeshBuilder.CreateDisc(`rescueSpark-${this.titleTime}-${index}`, { radius: 0.045 + (index % 3) * 0.018, tessellation: 10 }, this.scene);
      spark.position = new Vector3(x, y, -0.8);
      spark.material = this.createMaterial(`rescueSparkMat-${this.titleTime}-${index}`, color, color.scale(0.7), false);
      spark.isPickable = false;
      const angle = (Math.PI * 2 * index) / count + this.titleTime * 1.3;
      const magnitude = speed * (0.45 + (index % 5) * 0.11);
      this.sparks.push({
        mesh: spark,
        velocity: new Vector3(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude + 0.8, 0),
        life: 0.4 + (index % 4) * 0.08,
        maxLife: 0.7,
      });
    }
  }

  /** Cached by color (not disposed per-instance) by default -- see materialCache's own
   * comment for the incident that made this the default instead of "one unique material
   * object per call" (the original behavior, still available via cache:false for the
   * handful of callers -- spawnSparks/spawnImpactRing -- that genuinely need a private,
   * per-instance material because they animate its alpha continuously over a short
   * lifetime and explicitly dispose it themselves when done, see updateSparks). */
  /** flat=true is the "dull/8-bit sheen" treatment for background scenery (see
   * createBackdrop): near-zero specular highlight and a much dimmer emissive glow, so
   * non-interactive decor visually recedes behind the vivid pickups (see createPickup's
   * glint) and enemies (see attachDarkAura) instead of competing with them for attention.
   * Always bypasses the shared cache -- a flat variant must never be handed back for a
   * plain lookup by a diffuse/emissive pair that some vivid object also happens to use. */
  private createMaterial(name: string, diffuse: Color3, emissive: Color3, cache = true, flat = false): StandardMaterial {
    if (cache && !flat) {
      const key = `${diffuse.r.toFixed(3)},${diffuse.g.toFixed(3)},${diffuse.b.toFixed(3)}|${emissive.r.toFixed(3)},${emissive.g.toFixed(3)},${emissive.b.toFixed(3)}`;
      const existing = this.materialCache.get(key);
      if (existing) return existing;
      const material = new StandardMaterial(`sharedMat-${this.materialCache.size}`, this.scene);
      material.diffuseColor = diffuse;
      material.emissiveColor = emissive.scale(0.14);
      material.specularColor = new Color3(0.45, 0.42, 0.38);
      material.specularPower = 48;
      this.materialCache.set(key, material);
      return material;
    }
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive.scale(flat ? 0.045 : 0.14);
    material.specularColor = flat ? new Color3(0.03, 0.03, 0.03) : new Color3(0.45, 0.42, 0.38);
    material.specularPower = flat ? 4 : 48;
    return material;
  }

  private publishUi(force: boolean) {
    const contraptionsActivated = this.contraptions.filter((contraption) => contraption.activated).length;
    const nextContraption = this.contraptions.find((contraption) => !contraption.activated);
    const contraptionNames: Record<ContraptionKind, string> = {
      buttonRun: "BUTTON BALL RUN",
      laceLever: "LACE LEVER",
      gumPress: "GUM PRESS",
      spoolLift: "SPOOL LIFT",
    };
    const contraptionStatus = nextContraption
      ? `NEXT · ${contraptionNames[nextContraption.kind]}`
      : "ALL LINKS LIVE · RESCUE LATCH OPEN";
    const snapshot: UiSnapshot = {
      mode: this.mode,
      hearts: this.player.hearts,
      maxHearts: this.player.maxHearts,
      lives: this.player.lives,
      buttons: this.buttons,
      doubleJumps: this.player.doubleJumps,
      dashCharges: this.player.dashCharges,
      moonSeconds: Math.ceil(this.player.moonTimer),
      message: this.message,
      checkpoint: this.activeCheckpoint,
      rescued: this.mode === "won",
      superRun: this.superRun,
      superRunAction: this.superRunAction,
      superRunStage: this.superRunStage,
      superRunStageLabel: this.superRunStageLabel,
      superRunCoverage: `${this.pickups.filter((pickup) => pickup.collected).length}/${this.pickups.length} power-ups · ${this.enemies.filter((enemy) => !enemy.alive).length}/${this.enemies.length} enemies`,
      agentActivity: this.agentActivity,
      agentActivityTarget: this.agentActivityTarget || undefined,
      agentLog: [...this.agentLog],
      levelIndex: this.levelIndex,
      levelCount: LEVEL_COUNT,
      levelLabel: LEVEL_LABELS[this.levelIndex - 1],
      popupText: this.popupTimer > 0 ? this.popupText : "",
      popupTilt: this.popupTilt,
      popupVariant: this.popupVariant,
      agentBackend: this.isAgentRun ? this.agentBackend : undefined,
      agentModel: this.isAgentRun ? this.agentModel : undefined,
      shoeForm: this.player.shoeForm,
      specialMoveQueue: this.player.specialMoveQueue.slice(),
      specialMoveReady: this.player.specialMoveCooldown <= 0,
      superJump: this.player.superJump,
      shoeFormAttack: this.shoeFormAttackLabel(),
      formAttackReady: Boolean(this.shoeFormAttackLabel()) && this.player.formAttackCooldown <= 0,
      ultraMove: this.player.ultraMove,
      bossName: this.bossDefeated ? "TOWER OPEN" : "THE TANGLED TITAN",
      bossDefeated: this.bossDefeated,
      reunionSeconds: Math.ceil(this.reunionTimer),
      contraptionsActivated,
      contraptionStatus,
      muted: this.audio.isMuted(),
      isLegacyWorld: this.isSuperRunPreview,
      autoRepeatActive: this.autoRepeatActive,
      autoRepeatWins: this.autoRepeatWins,
      autoRepeatLosses: this.autoRepeatLosses,
      autoRepeatTarget: AUTO_REPEAT_TARGET,
    };
    const signature = JSON.stringify(snapshot);
    if (!force && signature === this.lastUiSignature) return;
    this.lastUiSignature = signature;
    window.dispatchEvent(new CustomEvent<UiSnapshot>("shoe-adventure:update", { detail: snapshot }));
  }
}
