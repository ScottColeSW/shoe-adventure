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

## Design Invariant: No Silent Dead Ends for a Free-Choosing Agent

A human stuck in the level can back up, explore, and try something else. A free-choosing
Agent Run (see `updateAgentRun`'s goal-driven loop) can't reliably do that -- live-tested,
it consistently rushed straight to the boss gate via the `advance` goal without ever
detouring for the Ultra Move pickup, the *only* thing that can defeat a boss-tier enemy
(`checkRescue`'s `bossAlive` gate has no other path to `bossDefeated`). That made the level
mathematically unwinnable for an agent the moment it reached the gate without that one
pickup -- not a difficulty problem, a structural one, since nothing else in the level could
substitute for it.

**The rule going forward:** any ability that hard-gates progress (currently only Ultra
Move, vs. the true boss) needs a deterministic guarantee that an agent run can obtain it,
not just a live model's hope of choosing to detour for it. `checkRescue()` auto-grants the
Ultra Move pickup to an agent run the instant it reaches the boss gate without it -- the
agent still has to actually land the move. If a future boss or hard-gated ability is added,
give it the same treatment (or an equivalent), and extend `GameWorld.auditBossGates()`
(a dev-console regression guard, not a full reachability check -- it only catches a
pickup being missing, moved past, or removed, not an agent choosing not to collect one).

**A second, related dead end found the same way (live-tested):** even with the Ultra Move
auto-grant above, agent runs kept ending in `checkRescue()`'s "ran out of room at the
tower's edge" death instead of a win. Cause: the true boss (`createTrueBoss`, patrol range
~58.3-59.55) was never a physical obstacle -- `updatePlayer`'s only x-clamp was the world
bound (`Math.min(WORLD_END, this.player.x)`), so an `"advance"` goal that didn't happen to
trigger an enemy-response decision for the boss in time just walked straight through its
patrol band and off the end of the level. `checkRescue()`'s `bossAlive` branch (the
"boss blocks the tower" message) never actually blocked anything physically, only the win
check -- so the player could sail past the boss, past the Left Shoe's touch zone, and into
the edge-death check, all without a single fight. Fixed with an invisible wall in
`updatePlayer`: while the true boss is alive, `player.x` is clamped to `trueBoss.maxX +
1.2`, just past its patrol range and short of the Left Shoe's touch zone -- so the agent
is physically forced into the fight instead of being able to out-walk it. **The rule this
adds:** a `bossAlive`-gated message in `checkRescue()` is not itself a barrier -- any enemy
whose defeat is required to proceed needs an actual movement clamp near it, not just a UI
message withholding the win.

## Visual Pipeline

The scene is WebGPU-ready with a WebGL fallback. It uses a stylized physically informed look: standard/PBR-like material highlights, multi-light color separation, glow and image-processing color grading, parallax-ready background planes, a soft simulated ground shadow, lace particles, and low-cost geometric details. Effects are intentionally subtle so the clear side-scroller silhouette remains more important than raw rendering complexity.
