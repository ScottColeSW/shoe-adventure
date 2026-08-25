// The Lost Pair visual reminder: this UI frames a tactile twilight rescue quest—never a generic dashboard. Use stitched patches, Rescue Coral #FF5A4F, warm cream, and cinematic asymmetry.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { createBestAvailableEngine, createGameScene, type GameHandle, type RenderEngine } from "@/game/scene";
import { LEVEL_LABELS, type UiSnapshot } from "@/game/GameWorld";

const initialSnapshot: UiSnapshot = {
  mode: "title",
  hearts: 3,
  maxHearts: 3,
  lives: 3,
  buttons: 0,
  doubleJumps: 0,
  dashCharges: 0,
  moonSeconds: 0,
  message: "Lace up. The rescue starts now.",
  checkpoint: "Bedroom Threshold",
  rescued: false,
  superRun: false,
  superRunAction: "AI standing by.",
  superRunStage: 0,
  superRunStageLabel: "STANDBY",
  superRunCoverage: "0/0 power-ups · 0/0 enemies",
  agentActivity: "idle",
  agentLog: [],
  levelIndex: 1,
  levelCount: 6,
  levelLabel: "BUTTON TRAIL",
  popupText: "",
  popupTilt: 0,
  popupVariant: "pickup",
  shoeForm: "starter",
  specialMoveQueue: [],
  specialMoveReady: true,
  superJump: false,
  shoeFormAttack: "",
  formAttackReady: false,
  ultraMove: false,
  bossName: "THE TANGLED TITAN",
  bossDefeated: false,
  reunionSeconds: 0,
  contraptionsActivated: 0,
  isLegacyWorld: false,
  autoRepeatActive: false,
  autoRepeatWins: 0,
  autoRepeatLosses: 0,
  autoRepeatTarget: 100,
  contraptionStatus: "NEXT · BUTTON BALL RUN",
  muted: false,
};

/** Icon-first replacement for reading superRunAction's prose as the primary AI status
 * signal -- keyed off GameWorld's AgentActivity enum. Plain glyph characters, same
 * approach as the existing ♥/♡ heart row and ←/→ touch controls, no external assets. */
const AGENT_ACTIVITY_GLYPH: Record<UiSnapshot["agentActivity"], string> = {
  idle: "◇",
  advancing: "➤",
  targeting: "◎",
  attacking: "⚔",
  dodging: "↺",
  usingUltra: "⚡",
  thinking: "…",
  fallback: "⟲",
};

type Command =
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

function dispatchCommand(command: Command) {
  window.dispatchEvent(new CustomEvent<Command>("shoe-adventure:command", { detail: command }));
}

interface LeaderboardEntry {
  mode: "human" | "agent";
  backend: string | null;
  model: string | null;
  seconds: number;
  hearts: number;
}

/** Mirrors server/agent/catalog.ts's response shape -- see that file's own
 * docstring for how this maps to Dominion's model_catalog.py. */
interface ModelCatalog {
  reachable: boolean;
  models: { name: string; sizeBytes: number }[];
  systemMemory: { totalBytes: number; availableBytes: number };
}

// Same conservative worst-case margin Dominion's own picker uses (see that
// project's index.html): budget against 80% of available memory, not all
// of it, since the OS and everything else running need headroom too.
const MODEL_PICKER_BUDGET_FRACTION = 0.8;
// Mirrors GameWorld.ts's own AUTO_REPEAT_TARGET -- only used for the picker's button
// label before a run (and thus a live snapshot value) exists; the in-run counter reads
// the real snapshot.autoRepeatTarget instead.
const AUTO_REPEAT_TARGET = 100;
// How often the title screen re-checks Ollama while the picker could be
// open -- cheap enough (a 3s-capped /api/tags call server-side) to poll
// fairly often, and it's genuinely useful: starting `ollama serve` after
// the page has already loaded, exactly like Scott just did, should not
// require a manual refresh to be picked up.
const MODEL_CATALOG_POLL_MS = 6000;

function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

function dispatchStartAgent(model: string, auto?: boolean) {
  window.dispatchEvent(
    new CustomEvent<{ backend: "ollama"; model: string; auto?: boolean }>("shoe-adventure:startAgent", {
      detail: { backend: "ollama", model, auto },
    }),
  );
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const agentLogRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(initialSnapshot);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const [topRuns, setTopRuns] = useState<LeaderboardEntry[]>([]);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // Set while POST /api/agent/warm is in flight -- see the START AGENT RUN button below.
  // A cold model load was live-tested at ~12.5s; better to show that as an explicit
  // "warming up" moment than let the first real gameplay decision eat it silently.
  const [warmingModel, setWarmingModel] = useState<string | null>(null);

  // The Agent Run model picker's live data (see server/agent/catalog.ts):
  // polled only while the title screen is up, the one place this picker
  // can appear, matching Dominion's own "pre-show only" picker lifetime.
  useEffect(() => {
    if (snapshot.mode !== "title") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/agent/catalog")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: ModelCatalog | null) => {
          if (cancelled || !data) return;
          setModelCatalog(data);
          setSelectedModel((current) => {
            if (current && data.models.some((m) => m.name === current)) return current;
            return data.models[0]?.name ?? null;
          });
        })
        .catch(() => {
          /* Ollama being unreachable is a normal, in-panel state -- see
           * the "offline" branch below, never a console error. */
        });
    };
    load();
    const interval = window.setInterval(load, MODEL_CATALOG_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [snapshot.mode]);

  // Keeps the scrolling agent-call log pinned to its newest entry (see
  // GameWorld.logAgent) rather than making a spectator scroll down manually mid-run.
  useEffect(() => {
    const el = agentLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snapshot.agentLog]);

  // Reads the player's own best time (always available, independent of the server) and
  // fetches a small ranked leaderboard each time a win happens, so the win screen
  // can show both without either one blocking the celebration if the server is unreachable.
  // A top-5 list, not just a single "fastest", is what actually reads as a scoreboard
  // multiple models (and humans) can be seen competing on, rather than one number.
  useEffect(() => {
    if (snapshot.mode !== "won") return;
    try {
      const stored = Number(window.localStorage.getItem("shoe-adventure:best-time"));
      if (Number.isFinite(stored) && stored > 0) setBestTime(stored);
    } catch {
      /* localStorage unavailable -- the win screen just won't show a best time */
    }
    fetch("/api/runs/leaderboard?limit=5")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { entries?: LeaderboardEntry[] } | null) => setTopRuns(data?.entries ?? []))
      .catch(() => {
        /* Leaderboard is a nice-to-have on the win screen, never required for it to render */
      });
  }, [snapshot.mode]);

  // A harder-hitting beat before the softer "The route tangled" retry screen, which reads
  // as too soft as the very first thing shown on a loss. Fires once per transition INTO
  // "lost" (React only re-runs on an actual value change, so this naturally re-fires on
  // every fresh loss even during rapid auto-repeat cycling -- see GameWorld.ts's
  // handleRunEnded) and clears itself; the interstitial underneath is unaffected either way.
  const [showGameOver, setShowGameOver] = useState(false);
  useEffect(() => {
    if (snapshot.mode !== "lost") return;
    setShowGameOver(true);
    const timer = window.setTimeout(() => setShowGameOver(false), 1100);
    return () => window.clearTimeout(timer);
  }, [snapshot.mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    let active = true;
    let engine: RenderEngine | null = null;
    let handle: GameHandle | null = null;

    createBestAvailableEngine(canvas)
      .then((createdEngine) => {
        engine = createdEngine;
        if (!active) {
          createdEngine.dispose();
          return null;
        }
        return createGameScene(createdEngine, canvas);
      })
      .then((createdHandle) => {
        if (!createdHandle || !active || !engine) {
          createdHandle?.dispose();
          return;
        }
        handle = createdHandle;
        engine.runRenderLoop(() => createdHandle.scene.render());
      })
      .catch((error) => {
        console.error("Shoe Adventure could not start its graphics engine.", error);
      });

    const onResize = () => engine?.resize();
    const onUpdate = (event: Event) => setSnapshot((event as CustomEvent<UiSnapshot>).detail);
    window.addEventListener("resize", onResize);
    window.addEventListener("shoe-adventure:update", onUpdate);

    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("shoe-adventure:update", onUpdate);
      handle?.dispose();
      engine?.dispose();
      startedRef.current = false;
    };
  }, []);

  const isInterstitial = snapshot.mode === "title" || snapshot.mode === "paused" || snapshot.mode === "lost" || snapshot.mode === "won";
  // Was `Math.min(92, 20 + snapshot.buttons * 5)` -- buttons is a general score (button
  // pickups +1, enemy defeats +4..+20, bonus pickups +12), not a small bounded counter,
  // so that formula started a fresh run at a misleading 20% and then saturated near its
  // 92% cap within the first minute of real play, leaving the meter pinned near "almost
  // there" for nearly the entire run. Level progress is a far more honest, evenly-paced
  // stand-in for "how far through the rescue am I" -- 0% at the very start, only ever
  // 100% on an actual win.
  const rescueProgress = snapshot.rescued ? 100 : Math.round(((snapshot.levelIndex - 1) / snapshot.levelCount) * 100);
  const modeHeading = useMemo(() => {
    if (snapshot.mode === "won") return "A perfect pair, found.";
    if (snapshot.mode === "lost") return "The route tangled.";
    if (snapshot.mode === "paused") return "The rescue waits.";
    return "Shoe Adventure";
  }, [snapshot.mode]);
  const heroFormLabel = ({
    starter: "BRIGHT STARTER",
    coralChrome: "CORAL CHROME",
    moonstep: "MOONSTEP RUNNER",
    pump: "PUMP FORM",
    hightop: "HIGHTOP FORM",
    loafer: "LOAFER FORM",
    cowboy: "COWBOY BOOT",
    sneaker: "SNEAKER FORM",
  } as const)[snapshot.shoeForm];

  const beginAgentRun = (auto: boolean) => {
    if (!selectedModel) return;
    const model = selectedModel;
    setWarmingModel(model);
    fetch("/api/agent/warm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "ollama", model }),
    })
      .catch(() => {
        /* Best-effort -- if the warm-up call itself fails, the run still starts; the
         * first real decision just pays whatever cold-load cost is left. */
      })
      .finally(() => {
        setWarmingModel(null);
        dispatchStartAgent(model, auto);
        setAgentPickerOpen(false);
      });
  };

  return (
    <main className="game-shell" aria-label="Shoe Adventure game">
      <div className="game-backdrop" aria-hidden="true" />
      <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />

      <div className="screen-vignette" aria-hidden="true" />
      {showGameOver && (
        <div className="game-over-splash" aria-hidden="true">
          <span>GAME OVER</span>
        </div>
      )}
      {snapshot.mode !== "title" && snapshot.isLegacyWorld && (
        <div className="stage-storyline" aria-hidden="true">
          <div className="stage-box stage-box-left"><span>SHOEBOX CLIFF</span></div>
          <div className="stage-hero-wrap">
            <em>{heroFormLabel}</em>
          </div>
          <div className="stage-lace-route"><i /><i /><i /><i /><i /><i /></div>
          <div className="stage-contraption-map" aria-hidden="true">
            <span className={snapshot.contraptionsActivated > 0 ? "link-live" : ""}>① BALL RUN</span>
            <span className={snapshot.contraptionsActivated > 1 ? "link-live" : ""}>② LACE LEVER</span>
            <span className={snapshot.contraptionsActivated > 2 ? "link-live" : ""}>③ GUM PRESS</span>
            <span className={snapshot.contraptionsActivated > 3 ? "link-live" : ""}>④ SPOOL LIFT</span>
          </div>
          <div className="stage-rescue-beacon">
            <em>LEFTY</em>
            <small>RESCUE BEACON</small>
          </div>
          <div className="stage-box stage-box-right"><span>ROGUE TOWER</span></div>
        </div>
      )}
      {snapshot.mode !== "title" && !snapshot.isLegacyWorld && (
        // The six-screen replacement for .stage-storyline above -- that strip hardcoded 4
        // fixed contraption names for one 66-unit world and can't generalize to a variable
        // screen count, so it was gated off entirely (isLegacyWorld) during the discrete-
        // screens rebuild with nothing put back in its place. LEVEL_LABELS (exported from
        // GameWorld.ts) drives this one instead, so it stays correct if the level count or
        // names ever change.
        <div className="route-line-strip" aria-hidden="true">
          <span className="route-line-start">RIGHTY</span>
          <div className="route-line-track">
            {LEVEL_LABELS.map((label, index) => {
              const levelNumber = index + 1;
              const state = levelNumber < snapshot.levelIndex || snapshot.rescued ? "done" : levelNumber === snapshot.levelIndex ? "current" : "upcoming";
              const side = index % 2 === 0 ? "up" : "down";
              return (
                <div key={label} className={`route-line-node route-line-node--${state} route-line-node--${side}`}>
                  <i className="route-line-dot" />
                  <span className="route-line-rib">{label}</span>
                </div>
              );
            })}
          </div>
          <span className="route-line-end">LEFTY</span>
        </div>
      )}
      <div className="graphics-badge" aria-label="Browser graphics mode">WEBGPU READY · WEBGL FALLBACK</div>
      {snapshot.autoRepeatActive && (
        <div className="auto-repeat-chip" aria-live="polite" aria-label={`Auto-repeat running: ${snapshot.autoRepeatWins} wins, ${snapshot.autoRepeatLosses} losses, stopping at ${snapshot.autoRepeatTarget} of either`}>
          <span>AUTO-REPEAT</span>
          <b>{snapshot.autoRepeatWins}W · {snapshot.autoRepeatLosses}L</b>
          <i>stops at {snapshot.autoRepeatTarget}</i>
          <button type="button" onClick={() => dispatchCommand("stopAutoRepeat")}>STOP</button>
        </div>
      )}
      {snapshot.superRun && snapshot.mode !== "title" && (
        <aside className="super-run-ribbon" aria-live="polite" aria-label={snapshot.superRunAction}>
          <span>{snapshot.agentBackend ? "AGENT RUN" : "AI SUPER RUN"}</span>
          <span className={`agent-activity-icon agent-activity-${snapshot.agentActivity}`} aria-hidden="true">
            {AGENT_ACTIVITY_GLYPH[snapshot.agentActivity]}
          </span>
          <b>{snapshot.agentActivityTarget || snapshot.superRunAction}</b>
          {snapshot.agentBackend && (
            <em className="agent-chip" title="A real AI model is driving enemy encounters this run">
              {snapshot.agentBackend}
              {snapshot.agentModel ? ` · ${snapshot.agentModel}` : ""}
            </em>
          )}
          <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
        </aside>
      )}

      {snapshot.superRun && snapshot.agentBackend && snapshot.mode !== "title" && (
        <aside className="agent-log-panel" aria-label="Agent decision log">
          <div className="agent-log-header">
            <span>AGENT CALLS</span>
            <em>{snapshot.agentBackend}{snapshot.agentModel ? ` · ${snapshot.agentModel}` : ""}</em>
          </div>
          <div className="agent-log-body" ref={agentLogRef}>
            {snapshot.agentLog.length === 0 ? (
              <div className="agent-log-line agent-log-empty">waiting for the first decision…</div>
            ) : (
              snapshot.agentLog.map((line, index) => (
                <div key={index} className="agent-log-line">{line}</div>
              ))
            )}
          </div>
        </aside>
      )}

      {snapshot.popupText && (
        <div
          className={`pickup-splash${snapshot.popupVariant === "impact" ? " pickup-splash--impact" : ""}`}
          key={snapshot.popupText}
          style={{ "--tilt": `${snapshot.popupTilt}deg` } as React.CSSProperties}
          aria-live="assertive"
        >
          {snapshot.popupText}
        </div>
      )}

      {snapshot.mode !== "title" && (
        <section className="game-hud" aria-live="polite">
          <div className="hud-mission stitched-panel">
            <div className="hud-eyebrow">FIND LEFTY</div>
            <div className="hud-route"><span className="route-knot" />{snapshot.checkpoint}</div>
            <div className="level-badge" aria-label={`Level ${snapshot.levelIndex} of ${snapshot.levelCount}: ${snapshot.levelLabel}`}>
              <span>LEVEL {snapshot.levelIndex}/{snapshot.levelCount}</span>
              <b>{snapshot.levelLabel}</b>
            </div>
            <p>{snapshot.message}</p>
            <div className="rescue-meter" aria-label={`Rescue route: level ${snapshot.levelIndex} of ${snapshot.levelCount}, ${rescueProgress}% complete`}>
              <span className="rescue-meter-zones">
                {Array.from({ length: snapshot.levelCount }, (_, index) => {
                  const zoneLevel = index + 1;
                  const state = zoneLevel < snapshot.levelIndex || snapshot.rescued ? "done" : zoneLevel === snapshot.levelIndex ? "current" : "upcoming";
                  return <i key={zoneLevel} className={`rescue-meter-zone rescue-meter-zone--${state}`} />;
                })}
              </span>
              <b>LEFTY BEACON · LEVEL {snapshot.levelIndex}/{snapshot.levelCount}</b>
            </div>
            {snapshot.isLegacyWorld && (
              <div className="contraption-readout" aria-label={`${snapshot.contraptionsActivated} of 4 contraptions activated`}>
                <span>CHAIN BOARD</span>
                <b>{snapshot.contraptionStatus}</b>
                <i>{snapshot.contraptionsActivated}/4 LIVE</i>
              </div>
            )}
            <div className={`boss-readout ${snapshot.bossDefeated ? "boss-cleared" : ""}`} aria-label={`Final encounter: ${snapshot.bossName}`}>
              <span>FINAL GATE</span><b>{snapshot.bossName}</b>
            </div>
            {snapshot.superRun && snapshot.isLegacyWorld && (
              <div className="super-run-stage" aria-label={`Super Run stage ${snapshot.superRunStage} of 3: ${snapshot.superRunStageLabel}. ${snapshot.superRunCoverage}`}>
                <span>STAGE {snapshot.superRunStage}/3</span>
                <b>{snapshot.superRunStageLabel}</b>
                <i>{snapshot.superRunCoverage}</i>
              </div>
            )}
          </div>

          <div className="hud-powerups stitched-panel" aria-label="Collected power-ups">
            <div className="hud-eyebrow">LACE POCKET</div>
            <div className="powerup-counters">
              <span title="Wingtip Feather">WING <b>{snapshot.doubleJumps}</b></span>
              <span title="Lace Dash">DASH <b>{snapshot.dashCharges}</b></span>
              <span title="Moon Insole">MOON <b>{snapshot.moonSeconds || "—"}</b></span>
            </div>
            <div className="upgrade-readout">
              <b>{heroFormLabel}</b>
              <span className={snapshot.superJump ? "upgrade-unlocked super-jump-chip" : ""}>⇧ · SUPER JUMP</span>
              {snapshot.shoeFormAttack && <span className={snapshot.formAttackReady ? "upgrade-unlocked form-attack-chip" : "form-attack-chip"}>F · {snapshot.shoeFormAttack}</span>}
              <span
                className={snapshot.specialMoveQueue.length > 0 && snapshot.specialMoveReady ? "upgrade-unlocked" : ""}
                title={snapshot.specialMoveQueue.length > 0 ? snapshot.specialMoveQueue.map((kind) => (kind === "gumStomp" ? "Gum Stomp" : "Lace Lash")).join(", ") : "Storage empty"}
              >
                X · SPECIAL MOVE{snapshot.specialMoveQueue.length > 0 ? ` (${snapshot.specialMoveQueue.length})` : ""}
              </span>
              <span className={snapshot.ultraMove ? "upgrade-unlocked ultra-chip" : "ultra-chip"}>U · ULTRA MOVE</span>
            </div>
            <div className="powerup-stitches" aria-hidden="true"><i /><i /><i /></div>
          </div>

          <div className="hud-lives stitched-panel">
            <div className="heart-row" aria-label={`${snapshot.hearts} of ${snapshot.maxHearts} hearts remaining`}>
              {Array.from({ length: snapshot.maxHearts }, (_, heart) => (
                <span key={heart} className={heart < snapshot.hearts ? "heart heart-live" : "heart"}>♥</span>
              ))}
            </div>
            <span className="lives-score" aria-label={`${snapshot.lives} lives remaining`}>LIVES {snapshot.lives}</span>
            <span className="button-score">SCORE {snapshot.buttons.toString().padStart(2, "0")}</span>
          </div>

          <button className="hud-pause stitched-panel" type="button" onClick={() => dispatchCommand("pause")} aria-label="Pause game">
            {snapshot.mode === "paused" ? "RESUME" : "PAUSE"}
          </button>
          <button
            className="hud-mute stitched-panel"
            type="button"
            onClick={() => dispatchCommand("muteToggle")}
            aria-label={snapshot.muted ? "Unmute sound" : "Mute sound"}
            aria-pressed={snapshot.muted}
          >
            {snapshot.muted ? "MUTED" : "SOUND"}
          </button>
        </section>
      )}

      {isInterstitial && (
        <section className={`story-overlay story-${snapshot.mode}`} aria-live="assertive">
          <div className="story-art" aria-hidden="true" />
          <div className="story-overlay-scrim" aria-hidden="true" />
          <div className="story-copy">
            <div className="story-logo" aria-hidden="true"><i /><b /></div>
            <div className="chapter-label">{snapshot.mode === "won" ? "RESCUE COMPLETE" : snapshot.mode === "lost" ? "TRY THE STITCHED PATH AGAIN" : snapshot.mode === "paused" ? "MID-QUEST" : "A TINY SHOE. A GIANT PROMISE."}</div>
            <h1>{modeHeading}</h1>
            {snapshot.mode === "title" ? (
              <p className="story-intro">The Right Shoe has crossed every shoebox, lace bridge, and laundry chute in the room. Now the Left Shoe is trapped in the rogue roller skate’s tower. Trigger the Button Ball Run, snap the Lace Lever, launch the Gum Press, and raise the Spool Lift to reunite the pair.</p>
            ) : snapshot.mode === "won" ? (
              <p className="story-intro">{snapshot.message} Collect Coral Chrome, Moonstep Runner, Lace Lash, and Gum Stomp on your next rescue run — then watch the pair celebrate every stitch home.</p>
            ) : (
              <p className="story-intro">{snapshot.message}</p>
            )}

            {snapshot.mode === "title" && (
              <div className="story-rescue-stitchline" aria-label="Rescue mission reminder">
                <span>MISSION PATCH</span><b>EVERY LEAP GETS YOU CLOSER TO YOUR LEFT.</b>
              </div>
            )}
            {snapshot.mode === "title" && (
              <div className="story-hero-strip" aria-label="Right Shoe begins the rescue route toward Left Shoe">
                <div className="story-shoe-card story-shoe-card-right">
                  <b>RIGHTY <small>SHINE MODE</small></b>
                </div>
                <span className="story-rule" />
                <div className="story-shoe-card story-shoe-card-left">
                  <b>LEFTY <small>RESCUE BEACON</small></b>
                </div>
              </div>
            )}
            {snapshot.mode === "won" && (
              <div className="reunion-dance" aria-label="Right Shoe and Left Shoe dance together after their rescue">
                <div className="dance-spark dance-spark-one" /><div className="dance-spark dance-spark-two" /><div className="dance-spark dance-spark-three" />
                <div className="reunion-shoes">
                  <div className="reunion-shoe reunion-shoe-right">
                    <span className="reunion-shoe-sole" /><span className="reunion-shoe-heel" /><span className="reunion-shoe-upper" /><span className="reunion-shoe-tongue" />
                    <span className="reunion-shoe-lace" /><span className="reunion-shoe-lace" /><span className="reunion-shoe-lace" />
                  </div>
                  <div className="reunion-shoe reunion-shoe-left">
                    <span className="reunion-shoe-sole" /><span className="reunion-shoe-heel" /><span className="reunion-shoe-upper" /><span className="reunion-shoe-tongue" /><span className="reunion-shoe-heart" />
                    <span className="reunion-shoe-lace" /><span className="reunion-shoe-lace" /><span className="reunion-shoe-lace" />
                  </div>
                </div>
                <b>THE PAIR DANCE</b>
                <small>{snapshot.reunionSeconds > 0 ? `DANCE FINALE · ${snapshot.reunionSeconds}s` : "DANCE FINALE · ENCORE"}</small>
              </div>
            )}
            {snapshot.mode === "won" && (bestTime !== null || topRuns.length > 0) && (
              <div className="run-results" aria-label="Run time results">
                {bestTime !== null && (
                  <span className="run-results-best">YOUR BEST <b>{formatSeconds(bestTime)}</b></span>
                )}
                {topRuns.length > 0 && (
                  <ol className="run-leaderboard" aria-label="Fastest recorded runs, human and agent">
                    {topRuns.map((run, index) => (
                      <li key={`${run.mode}-${run.model ?? run.backend ?? "human"}-${run.seconds}-${index}`}>
                        <span className="run-leaderboard-rank">{index + 1}</span>
                        <span className="run-leaderboard-time">{formatSeconds(run.seconds)}</span>
                        <span className="run-leaderboard-who">{run.mode === "agent" ? (run.model || run.backend || "AGENT").toUpperCase() : "HUMAN"}</span>
                        <span className="run-leaderboard-hearts" aria-label={`${run.hearts} of 3 hearts remaining`}>
                          {"♥".repeat(Math.max(0, Math.min(3, run.hearts)))}
                          {"♡".repeat(Math.max(0, 3 - run.hearts))}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <div className="story-actions">
              {snapshot.mode === "title" || snapshot.mode === "paused" ? (
                <button className="primary-action" type="button" onClick={() => dispatchCommand("start")}>LACE UP &amp; LEAP <span>↗</span></button>
              ) : snapshot.mode === "lost" && snapshot.agentBackend ? (
                // A human restarting picks up right where they fell, which makes
                // sense at a checkpoint they were actually walking. An agent run
                // has no such continuity to hand back to -- the honest next step
                // is the picker, not a checkpoint the player never stood at.
                <button className="primary-action" type="button" onClick={() => dispatchCommand("returnToTitle")}>TRY ANOTHER MODEL <span>↗</span></button>
              ) : (
                <button className="primary-action" type="button" onClick={() => dispatchCommand("restart")}>STITCH THE ROUTE AGAIN <span>↗</span></button>
              )}
              {snapshot.mode === "title" && (
                <button
                  className="super-run-action"
                  type="button"
                  aria-expanded={agentPickerOpen}
                  onClick={() => setAgentPickerOpen((open) => !open)}
                >
                  AGENT RUN <span>✦</span>
                </button>
              )}
              {snapshot.mode === "title" && (
                <button className="super-run-action" type="button" onClick={() => dispatchCommand("superRun")}>WATCH SUPER RUN <span>✦</span></button>
              )}
              {snapshot.mode === "title" && (
                <button className="secondary-action reunion-preview-action" type="button" onClick={() => dispatchCommand("celebrate")}>WATCH THE PAIR DANCE</button>
              )}
              {snapshot.mode === "title" && (
                <Link href="/stats" className="secondary-action stats-link-action">AGENT STATS <span>↗</span></Link>
              )}
              {snapshot.mode === "won" && snapshot.superRun && !snapshot.agentBackend && (
                <button className="super-run-action" type="button" onClick={() => dispatchCommand("superRun")}>REPLAY SUPER RUN <span>✦</span></button>
              )}
              {snapshot.mode === "won" && snapshot.agentBackend && (
                <button className="super-run-action" type="button" onClick={() => dispatchCommand("returnToTitle")}>TRY ANOTHER MODEL <span>✦</span></button>
              )}
              {snapshot.mode === "won" && (
                <button className="secondary-action reunion-preview-action" type="button" onClick={() => dispatchCommand("celebrate")}>DANCE AGAIN</button>
              )}
              {snapshot.mode !== "title" && snapshot.mode !== "won" && !(snapshot.mode === "lost" && snapshot.agentBackend) && (
                <button className="secondary-action" type="button" onClick={() => dispatchCommand("restart")}>RESTART FROM CHECKPOINT</button>
              )}
              {snapshot.mode !== "title" && (
                <button
                  className="secondary-action quit-action"
                  type="button"
                  onClick={() => dispatchCommand("quit")}
                  title="Stop this run, cleanly close any in-flight agent request, and return to the title screen"
                >
                  QUIT
                </button>
              )}
            </div>

            {snapshot.mode === "title" && (
              <footer className="title-footer">
                <a href="/about.html">ABOUT</a>
                <span aria-hidden="true">·</span>
                <a href="/books.html">BOOKS</a>
              </footer>
            )}

            {snapshot.mode === "title" && agentPickerOpen && (
              <div className="agent-picker" aria-label="Choose a model to drive the Agent Run">
                {!modelCatalog ? (
                  <p className="agent-picker-status">Checking for Ollama…</p>
                ) : !modelCatalog.reachable ? (
                  <p className="agent-picker-status agent-picker-offline">
                    ✗ Ollama offline — run <code>ollama serve</code> in a terminal, then this list fills in on its own.
                  </p>
                ) : modelCatalog.models.length === 0 ? (
                  <p className="agent-picker-status">
                    ✓ Ollama ready, but nothing is pulled yet. Run <code>ollama pull llama3.2</code> in a terminal to add a model here.
                  </p>
                ) : (
                  <>
                    <p className="agent-picker-status agent-picker-online">✓ Ollama ready — {modelCatalog.models.length} model{modelCatalog.models.length === 1 ? "" : "s"} installed</p>
                    <div className="agent-picker-list">
                      {modelCatalog.models.map((model) => {
                        const budgetBytes = (modelCatalog.systemMemory.availableBytes || 0) * MODEL_PICKER_BUDGET_FRACTION;
                        const wouldFit = model.sizeBytes <= budgetBytes;
                        return (
                          <label key={model.name} className={`agent-picker-row${wouldFit ? "" : " unaffordable"}`}>
                            <input
                              type="radio"
                              name="agent-model"
                              value={model.name}
                              checked={selectedModel === model.name}
                              disabled={!wouldFit}
                              onChange={() => setSelectedModel(model.name)}
                            />
                            <span className="agent-picker-name">{model.name}</span>
                            <span className="agent-picker-size">{formatBytes(model.sizeBytes)}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="agent-picker-actions">
                      <button
                        className="super-run-action agent-picker-confirm"
                        type="button"
                        disabled={!selectedModel || warmingModel !== null}
                        onClick={() => beginAgentRun(false)}
                      >
                        {warmingModel ? `WARMING UP ${warmingModel}…` : <>START AGENT RUN <span>✦</span></>}
                      </button>
                      <button
                        className="super-run-action agent-picker-repeat"
                        type="button"
                        disabled={!selectedModel || warmingModel !== null}
                        title={`Auto-restart with the same model after every win or loss until ${AUTO_REPEAT_TARGET} of one or the other -- for gathering real decision data at scale.`}
                        onClick={() => beginAgentRun(true)}
                      >
                        REPEAT ×{AUTO_REPEAT_TARGET}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {snapshot.mode === "title" && (
              <div className="controls-guide" aria-label="Game controls">
                <span><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd> RUN</span>
                <span><kbd>W</kbd> or <kbd>SPACE</kbd> JUMP</span>
                <span><kbd>S</kbd> or <kbd>SHIFT</kbd> LACE DASH</span>
                <span><kbd>X</kbd> SPECIAL MOVE</span>
                <span><kbd>F</kbd> FORM ATTACK</span>
                <span><kbd>U</kbd> ULTRA MOVE</span>
              </div>
            )}
          </div>
        </section>
      )}

      {snapshot.mode === "playing" && !snapshot.superRun && (
        <section className="touch-controls" aria-label="Touch controls">
          <div className="touch-cluster touch-directional">
            <button
              type="button"
              aria-label="Move left"
              onPointerDown={() => dispatchCommand("holdLeft")}
              onPointerUp={() => dispatchCommand("releaseLeft")}
              onPointerLeave={() => dispatchCommand("releaseLeft")}
            >←</button>
            <button
              type="button"
              aria-label="Move right"
              onPointerDown={() => dispatchCommand("holdRight")}
              onPointerUp={() => dispatchCommand("releaseRight")}
              onPointerLeave={() => dispatchCommand("releaseRight")}
            >→</button>
          </div>
          <div className="touch-cluster touch-action">
            {snapshot.shoeFormAttack && <button type="button" className="form-touch" onPointerDown={() => dispatchCommand("formAttack")}>{snapshot.shoeFormAttack.split(" ")[0]}</button>}
            {snapshot.specialMoveQueue.length > 0 && (
              <button type="button" className="special-move-touch" onPointerDown={() => dispatchCommand("specialMove")}>SPECIAL<b>{snapshot.specialMoveQueue.length}</b></button>
            )}
            {snapshot.ultraMove && <button type="button" className="ultra-touch" onPointerDown={() => dispatchCommand("ultra")}>ULTRA</button>}
            <button type="button" className="dash-touch" onPointerDown={() => dispatchCommand("dash")}>DASH</button>
            <button type="button" className="jump-touch" onPointerDown={() => dispatchCommand("jump")}>JUMP</button>
          </div>
        </section>
      )}
    </main>
  );
}

// The Babylon engine, its WebGPU/WebGL context, and the AudioDirector's AudioContext are
// all real browser resources this component's mount effect creates exactly once (see the
// startedRef guard above) and are not React state -- they don't tolerate being hot-patched
// in place the way ordinary component state does. A live edit here (or to any file this
// module imports) was observed corrupting the WebGPU shader pipeline mid-session -- the
// scene would go blank while the update loop and audio kept running underneath, since a
// WebGPU validation failure doesn't throw, it just fails to draw. A full reload always
// recovers cleanly (a fresh page gets a fresh WebGPU adapter and a fresh AudioContext), so
// opt out of Fast Refresh's in-place patching in favor of that instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
