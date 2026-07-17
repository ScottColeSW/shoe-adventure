# Shoe Adventure — Runtime Structure

## Ownership

The React layer is only the **picture frame**. `GameCanvas.tsx` creates and disposes the Babylon engine, renders the full-screen canvas, owns the title/pause/finish overlays, and listens for small browser events that keep the DOM HUD in sync. `App.tsx` renders `GameCanvas` as the only root-route content.

The Babylon layer is the **painting**. `client/src/game/scene.ts` exposes `createGameScene(engine, canvas): Promise<GameHandle>`, selects a WebGPU engine when the browser supports it and otherwise keeps the WebGL engine path, then creates a `GameWorld`. The `GameWorld` owns scene assets, input, collision bounds, camera behavior, player state, enemy state, power-up state, checkpoints, particles, scoring, and deterministic demo behavior. No gameplay rule depends on React state.

## Modules

| File | Responsibility |
| --- | --- |
| `client/src/components/GameCanvas.tsx` | Lifecycle-safe Babylon host; title, HUD, accessibility controls, and custom-event bridge. |
| `client/src/game/scene.ts` | Scene creation, physical lighting/post-process configuration, engine compatibility, and exported game handle. |
| `client/src/game/GameWorld.ts` | Platform level construction, input actions, movement/collision, enemies, pickups, quest flow, scoring, effects, demo mode, and UI event emission. |
| `client/src/game/assets.ts` | Stable runtime URLs for generated visual assets. |
| `client/src/App.tsx` | Sole `/` route entry that renders the game canvas. |
| `client/src/index.css` | The Lost Pair typography, HUD treatment, responsive overlay layout, fallback controls, and motion accessibility. |

## State Model

The world uses explicit modes: `title`, `playing`, `paused`, `won`, and `lost`. The player uses `grounded`, `rising`, and `falling` motion states indirectly through velocity and grounded state. Temporary power-up durations are stored separately so they can influence movement and enemy behavior without changing the core movement grammar.

The required user input vocabulary is semantic: `left`, `right`, `jump`, `dash`, `pause`, and `restart`. Keyboard and touch controls update the same input state. The `?demo` path injects the same semantic actions into the update loop, so visual verification shows real game behavior rather than a separate animation.

## Visual Pipeline

The scene is WebGPU-ready with a WebGL fallback. It uses a stylized physically informed look: standard/PBR-like material highlights, multi-light color separation, glow and image-processing color grading, parallax-ready background planes, a soft simulated ground shadow, lace particles, and low-cost geometric details. Effects are intentionally subtle so the clear side-scroller silhouette remains more important than raw rendering complexity.
