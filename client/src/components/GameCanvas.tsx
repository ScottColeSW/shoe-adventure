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
};

type Command =
  | "start"
  | "restart"
  | "pause"
  | "jump"
  | "dash"
  | "holdLeft"
  | "holdRight"
  | "releaseLeft"
  | "releaseRight"
  | "superRun";

function dispatchCommand(command: Command) {
  window.dispatchEvent(new CustomEvent<Command>("shoe-adventure:command", { detail: command }));
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(initialSnapshot);

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
            <img className="realistic-shoe-mark stage-righty" src={gameAssets.rightShoeRealistic} alt="" />
            <em>RIGHTY</em>
          </div>
          <div className="stage-lace-route"><i /><i /><i /><i /><i /><i /></div>
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
          <span>AI SUPER RUN</span>
          <b>{snapshot.superRunAction}</b>
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
          </div>

          <div className="hud-powerups stitched-panel" aria-label="Collected power-ups">
            <div className="hud-eyebrow">LACE POCKET</div>
            <div className="powerup-counters">
              <span title="Wingtip Feather">WING <b>{snapshot.doubleJumps}</b></span>
              <span title="Lace Dash">DASH <b>{snapshot.dashCharges}</b></span>
              <span title="Moon Insole">MOON <b>{snapshot.moonSeconds || "—"}</b></span>
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
              <p className="story-intro">The Right Shoe has crossed every shoebox, lace bridge, and laundry chute in the room. Now the Left Shoe is trapped in the rogue roller skate’s tower. Run, jump, stomp, and stitch the pair back together.</p>
            ) : (
              <p className="story-intro">{snapshot.message}</p>
            )}

            {snapshot.mode === "title" && (
              <div className="story-hero-strip" aria-hidden="true">
                <img className="realistic-shoe-mark story-righty" src={gameAssets.rightShoeRealistic} alt="" />
                <span className="story-rule" />
                <img className="realistic-shoe-mark story-lefty" src={gameAssets.leftShoeRealistic} alt="" />
              </div>
            )}

            <div className="story-actions">
              {snapshot.mode === "title" || snapshot.mode === "paused" ? (
                <button className="primary-action" type="button" onClick={() => dispatchCommand("start")}>LACE UP &amp; LEAP <span>↗</span></button>
              ) : (
                <button className="primary-action" type="button" onClick={() => dispatchCommand("restart")}>STITCH THE ROUTE AGAIN <span>↗</span></button>
              )}
              {snapshot.mode === "title" && (
                <button className="super-run-action" type="button" onClick={() => dispatchCommand("superRun")}>WATCH SUPER RUN <span>✦</span></button>
              )}
              {snapshot.mode === "won" && snapshot.superRun && (
                <button className="super-run-action" type="button" onClick={() => dispatchCommand("superRun")}>REPLAY SUPER RUN <span>✦</span></button>
              )}
              {snapshot.mode !== "title" && snapshot.mode !== "won" && (
                <button className="secondary-action" type="button" onClick={() => dispatchCommand("restart")}>RESTART FROM CHECKPOINT</button>
              )}
            </div>

            {snapshot.mode === "title" && (
              <div className="controls-guide" aria-label="Game controls">
                <span><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd> RUN</span>
                <span><kbd>SPACE</kbd> JUMP</span>
                <span><kbd>SHIFT</kbd> LACE DASH</span>
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
            <button type="button" className="dash-touch" onPointerDown={() => dispatchCommand("dash")}>DASH</button>
            <button type="button" className="jump-touch" onPointerDown={() => dispatchCommand("jump")}>JUMP</button>
          </div>
        </section>
      )}
    </main>
  );
}
