// The Lost Pair visual reminder: this UI frames a tactile twilight rescue quest—never a generic dashboard. Use stitched patches, Rescue Coral #FF5A4F, warm cream, and cinematic asymmetry.

import { useEffect, useMemo, useRef, useState } from "react";
import { createBestAvailableEngine, createGameScene, type GameHandle, type RenderEngine } from "@/game/scene";
import { gameAssets } from "@/game/assets";
import type { UiSnapshot } from "@/game/GameWorld";

const initialSnapshot: UiSnapshot = {
  mode: "title",
  hearts: 3,
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
  shoeForm: "starter",
  laceLash: false,
  gumStomp: false,
  superJump: false,
  shoeFormAttack: "",
  formAttackReady: false,
  ultraMove: false,
  bossName: "THE TANGLED TITAN",
  bossDefeated: false,
  reunionSeconds: 0,
  contraptionsActivated: 0,
  contraptionStatus: "NEXT · BUTTON BALL RUN",
  muted: false,
};

type Command =
  | "start"
  | "restart"
  | "pause"
  | "jump"
  | "dash"
  | "lash"
  | "stomp"
  | "formAttack"
  | "ultra"
  | "holdLeft"
  | "holdRight"
  | "releaseLeft"
  | "releaseRight"
  | "superRun"
  | "celebrate"
  | "muteToggle";

function dispatchCommand(command: Command) {
  window.dispatchEvent(new CustomEvent<Command>("shoe-adventure:command", { detail: command }));
}

interface LeaderboardEntry {
  mode: "human" | "agent";
  backend: string | null;
  model: string | null;
  seconds: number;
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

function dispatchStartAgent(model: string) {
  window.dispatchEvent(
    new CustomEvent<{ backend: "ollama"; model: string }>("shoe-adventure:startAgent", {
      detail: { backend: "ollama", model },
    }),
  );
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(initialSnapshot);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const [topRun, setTopRun] = useState<LeaderboardEntry | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

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

  // Reads the player's own best time (always available, independent of the server) and
  // fetches the fastest recorded run overall each time a win happens, so the win screen
  // can show both without either one blocking the celebration if the server is unreachable.
  useEffect(() => {
    if (snapshot.mode !== "won") return;
    try {
      const stored = Number(window.localStorage.getItem("shoe-adventure:best-time"));
      if (Number.isFinite(stored) && stored > 0) setBestTime(stored);
    } catch {
      /* localStorage unavailable -- the win screen just won't show a best time */
    }
    fetch("/api/runs/leaderboard?limit=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { entries?: LeaderboardEntry[] } | null) => setTopRun(data?.entries?.[0] ?? null))
      .catch(() => {
        /* Leaderboard is a nice-to-have on the win screen, never required for it to render */
      });
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
  const rescueProgress = snapshot.rescued ? 100 : Math.min(92, 20 + snapshot.buttons * 5);
  const modeHeading = useMemo(() => {
    if (snapshot.mode === "won") return "A perfect pair, found.";
    if (snapshot.mode === "lost") return "The route tangled.";
    if (snapshot.mode === "paused") return "The rescue waits.";
    return "Shoe Adventure";
  }, [snapshot.mode]);
  const heroArt = snapshot.shoeForm === "moonstep"
    ? gameAssets.rightShoeMoonstep
    : snapshot.shoeForm === "coralChrome" || snapshot.mode === "title" || snapshot.mode === "won"
      ? gameAssets.rightShoeCoralChrome
      : gameAssets.rightShoeRealistic;
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

  return (
    <main
      className="game-shell"
      style={
        {
          "--target-art": `url(${gameAssets.visualTarget})`,
          "--backdrop-art": `url(${gameAssets.visualTarget})`,
        } as React.CSSProperties
      }
      aria-label="Shoe Adventure game"
    >
      <div className="game-backdrop" aria-hidden="true" />
      <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />

      <div className="screen-vignette" aria-hidden="true" />
      {snapshot.mode !== "title" && (
        <div className="stage-storyline" aria-hidden="true">
          <div className="stage-box stage-box-left"><span>SHOEBOX CLIFF</span></div>
          <div className="stage-hero-wrap">
            <img className={`realistic-shoe-mark stage-righty form-${snapshot.shoeForm}`} src={heroArt} alt="" />
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
            <img className="realistic-shoe-mark stage-lefty" src={gameAssets.leftShoeRealistic} alt="" />
            <em>LEFTY</em>
            <small>RESCUE BEACON</small>
          </div>
          <div className="stage-box stage-box-right"><span>ROGUE TOWER</span></div>
        </div>
      )}
      <div className="graphics-badge" aria-label="Browser graphics mode">WEBGPU READY · WEBGL FALLBACK</div>
      {snapshot.superRun && snapshot.mode !== "title" && (
        <aside className="super-run-ribbon" aria-live="polite">
          <span>{snapshot.agentBackend ? "AGENT RUN" : "AI SUPER RUN"}</span>
          <b>{snapshot.superRunAction}</b>
          {snapshot.agentBackend && (
            <em className="agent-chip" title="A real AI model is driving enemy encounters this run">
              {snapshot.agentBackend}
              {snapshot.agentModel ? ` · ${snapshot.agentModel}` : ""}
            </em>
          )}
          <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
        </aside>
      )}

      {snapshot.mode !== "title" && (
        <section className="game-hud" aria-live="polite">
          <div className="hud-mission stitched-panel">
            <div className="hud-eyebrow">FIND LEFTY</div>
            <div className="hud-route"><span className="route-knot" />{snapshot.checkpoint}</div>
            <p>{snapshot.message}</p>
            <div className="rescue-meter" aria-label={`Rescue route ${rescueProgress}% complete`}>
              <span><i style={{ width: `${rescueProgress}%` }} /></span>
              <b>LEFTY BEACON · {rescueProgress}%</b>
            </div>
            <div className="contraption-readout" aria-label={`${snapshot.contraptionsActivated} of 4 contraptions activated`}>
              <span>CHAIN BOARD</span>
              <b>{snapshot.contraptionStatus}</b>
              <i>{snapshot.contraptionsActivated}/4 LIVE</i>
            </div>
            <div className={`boss-readout ${snapshot.bossDefeated ? "boss-cleared" : ""}`} aria-label={`Final encounter: ${snapshot.bossName}`}>
              <span>FINAL GATE</span><b>{snapshot.bossName}</b>
            </div>
            {snapshot.superRun && (
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
              <span className={snapshot.laceLash ? "upgrade-unlocked" : ""}>Q · LACE LASH</span>
              <span className={snapshot.gumStomp ? "upgrade-unlocked" : ""}>E · GUM STOMP</span>
              <span className={snapshot.ultraMove ? "upgrade-unlocked ultra-chip" : "ultra-chip"}>U · ULTRA MOVE</span>
            </div>
            <div className="powerup-stitches" aria-hidden="true"><i /><i /><i /></div>
          </div>

          <div className="hud-lives stitched-panel">
            <div className="heart-row" aria-label={`${snapshot.hearts} hearts remaining`}>
              {[0, 1, 2].map((heart) => <span key={heart} className={heart < snapshot.hearts ? "heart heart-live" : "heart"}>♥</span>)}
            </div>
            <span className="button-score">BUTTONS {snapshot.buttons.toString().padStart(2, "0")}</span>
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
              <p className="story-intro">The Right Shoe has crossed every shoebox, lace bridge, and laundry chute in the room. Now the Left Shoe is trapped in the rogue roller skate’s tower. Trigger the Button Ball Run, snap the Lace Lever, launch the Gum Press, and raise the Spool Lift to stitch the pair back together.</p>
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
                  <img className="realistic-shoe-mark story-righty form-coralChrome" src={heroArt} alt="Bright coral Right Shoe" />
                  <b>RIGHTY <small>SHINE MODE</small></b>
                </div>
                <span className="story-rule" />
                <div className="story-shoe-card story-shoe-card-left">
                  <img className="realistic-shoe-mark story-lefty" src={gameAssets.leftShoeRealistic} alt="Left Shoe awaiting rescue" />
                  <b>LEFTY <small>RESCUE BEACON</small></b>
                </div>
              </div>
            )}
            {snapshot.mode === "won" && (
              <div className="reunion-dance" aria-label="Right Shoe and Left Shoe dance together after their rescue">
                <div className="dance-spark dance-spark-one" /><div className="dance-spark dance-spark-two" /><div className="dance-spark dance-spark-three" />
                <img src={gameAssets.reunionDance} alt="Right Shoe and Left Shoe dancing together" />
                <b>THE PAIR DANCE</b>
                <small>{snapshot.reunionSeconds > 0 ? `DANCE FINALE · ${snapshot.reunionSeconds}s` : "DANCE FINALE · ENCORE"}</small>
              </div>
            )}
            {snapshot.mode === "won" && (bestTime !== null || topRun) && (
              <div className="run-results" aria-label="Run time results">
                {bestTime !== null && (
                  <span className="run-results-best">YOUR BEST <b>{formatSeconds(bestTime)}</b></span>
                )}
                {topRun && (
                  <span className="run-results-top">
                    FASTEST RECORDED <b>{formatSeconds(topRun.seconds)}</b>
                    <i>{topRun.mode === "agent" ? `AGENT${topRun.backend ? ` · ${topRun.backend.toUpperCase()}` : ""}` : "HUMAN"}</i>
                  </span>
                )}
              </div>
            )}

            <div className="story-actions">
              {snapshot.mode === "title" || snapshot.mode === "paused" ? (
                <button className="primary-action" type="button" onClick={() => dispatchCommand("start")}>LACE UP &amp; LEAP <span>↗</span></button>
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
              {snapshot.mode === "won" && snapshot.superRun && (
                <button className="super-run-action" type="button" onClick={() => dispatchCommand("superRun")}>REPLAY SUPER RUN <span>✦</span></button>
              )}
              {snapshot.mode === "won" && (
                <button className="secondary-action reunion-preview-action" type="button" onClick={() => dispatchCommand("celebrate")}>DANCE AGAIN</button>
              )}
              {snapshot.mode !== "title" && snapshot.mode !== "won" && (
                <button className="secondary-action" type="button" onClick={() => dispatchCommand("restart")}>RESTART FROM CHECKPOINT</button>
              )}
            </div>

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
                    <button
                      className="super-run-action agent-picker-confirm"
                      type="button"
                      disabled={!selectedModel}
                      onClick={() => {
                        if (!selectedModel) return;
                        dispatchStartAgent(selectedModel);
                        setAgentPickerOpen(false);
                      }}
                    >
                      START AGENT RUN <span>✦</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {snapshot.mode === "title" && (
              <div className="controls-guide" aria-label="Game controls">
                <span><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd> RUN</span>
                <span><kbd>SPACE</kbd> JUMP</span>
                <span><kbd>SHIFT</kbd> LACE DASH</span>
                <span><kbd>Q</kbd> LACE LASH</span>
                <span><kbd>E</kbd> GUM STOMP</span>
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
            {snapshot.laceLash && <button type="button" className="lash-touch" onPointerDown={() => dispatchCommand("lash")}>LASH</button>}
            {snapshot.gumStomp && <button type="button" className="stomp-touch" onPointerDown={() => dispatchCommand("stomp")}>STOMP</button>}
            {snapshot.ultraMove && <button type="button" className="ultra-touch" onPointerDown={() => dispatchCommand("ultra")}>ULTRA</button>}
            <button type="button" className="dash-touch" onPointerDown={() => dispatchCommand("dash")}>DASH</button>
            <button type="button" className="jump-touch" onPointerDown={() => dispatchCommand("jump")}>JUMP</button>
          </div>
        </section>
      )}
    </main>
  );
}
