# Shoe Adventure

A tiny rescue quest with a giant personality.

The Right Shoe is on a full-screen nighttime mission through a toy-scale bedroom to reunite with the Left Shoe and defeat the rogue roller skate tower.

<div align="center">

![Shoe Adventure](https://img.shields.io/badge/Shoe%20Adventure-Playful%20Rescue%20Platformer-FF5A4F?style=for-the-badge)

</div>

## 🎮 What this is

Shoe Adventure is a playful browser platformer built with React, Vite, Babylon.js, and Express. It mixes cinematic rescue-story presentation with fast action, collectible power-ups, and a delightfully stitched-together HUD.

If the repo were a character, it would be: bright, a little chaotic, and absolutely determined to make the rescue look stylish.

## ✨ Why it feels fun

- a full-screen action scene with a strong visual identity
- a rescue mission that reads clearly at a glance
- collectible buttons, contraptions, and power-up progression
- a full sound pass, jump, land, collect, hit, stomp, checkpoint, and victory cues, plus a two-layer background music bed that gets more intense when an enemy is close
- a Left Shoe that visually reads as its own character, warm cream and gold, instead of a mirrored copy of the Right Shoe
- a wider enemy and terrain roster, including a dive-bombing Moth and a Gum Turret that only a Gum Stomp can crack, plus bounce pads and crumbling platforms
- a best-time and leaderboard system so a run, human or AI, leaves a record behind
- a dramatic “AI Super Run” mode that is genuinely fun to watch, with an optional real AI model driving enemy encounters
- a polished, toy-world vibe instead of a generic dashboard look

## ⚡ Local showcase modes

This repo does not have a public hosted deployment yet, so the best way to experience the game is to run it locally. When the app is up, these built-in query routes make the showcase moments easy to try:

- `?demo` — auto-driven rescue run showcase
- `?superrun` — spectacle-focused Super Run preview
- `?dance` — reunion celebration preview
- `?agent=ollama&model=<a model you have pulled>` — hands enemy encounters during the Super Run to a real AI model instead of the scripted response; see [`AGENT_PLAY.md`](./AGENT_PLAY.md) for how this works and what backends are supported

Use those URLs after starting the dev server to watch the game’s signature moments without needing a live deployment.

## 🔊 Sound

Every sound effect and both music layers are generated directly in code with the Web Audio API by default, so the game is never silent even with no audio files checked in. Real recorded mp3s can be dropped in to replace any of those placeholders one at a time: save a file under `client/public/audio/` using the exact name the game expects, and it takes over automatically the next time that sound plays. See [`SOUND_LIST.md`](./SOUND_LIST.md) for the full list of expected file names and what each one should sound like. A mute button lives in the game's own HUD.

## 🕹️ Controls

- `A` / `D` or arrow keys: move
- `W` / `Space` / Up: jump
- `Shift` or dash input where available
- `Q` Lace Lash, `E` Gum Stomp, `U` Ultra Move, once each is unlocked
- pause, restart, and mute through the in-game HUD

## 🧰 Tech stack

- React 19
- TypeScript
- Vite
- Express
- Babylon.js
- Tailwind CSS + Radix UI primitives
- pnpm

## 🏗️ Project structure

- `client/` — frontend app and game canvas shell
- `client/src/game/` — world logic, scene setup, and game assets
- `client/src/game/audio.ts` — sound effects and music, procedural by default, real files optional (see [`SOUND_LIST.md`](./SOUND_LIST.md))
- `client/public/audio/` — where real recorded sound files go, if you add any
- `client/src/components/` — UI and game-host components
- `server/` — Express server entrypoint
- `server/agent/` — the agent-play "Strategic Director" backend (see [`AGENT_PLAY.md`](./AGENT_PLAY.md))
- `server/runs.ts`, `server/runsRouter.ts` — run history and the leaderboard API
- `shared/` — shared constants and cross-cutting values
- `patches/` — package patch files

## 🚀 Run it locally

### Install dependencies

```bash
pnpm install
```

### Start the dev server

```bash
pnpm dev
```

Then open the local Vite URL shown in the terminal. Because this project is not yet live on the web, the local development server is the expected way to try the game.

### Build for production

```bash
pnpm build
```

### Start the production server

```bash
pnpm start
```

## 📜 Available scripts

- `pnpm dev` — run the Vite development server
- `pnpm build` — build the frontend and bundle the server
- `pnpm start` — serve the production build
- `pnpm preview` — preview the built frontend locally
- `pnpm check` — run TypeScript type checking
- `pnpm format` — format the workspace with Prettier

## 🪡 Notes

- This project uses `pnpm` as the package manager.
- The Express server serves the built frontend from `dist/public` in production mode.
- The experience is intentionally built as a single immersive browser adventure rather than a standard multi-page app.
- There is currently no public hosted demo URL; local execution is the intended preview workflow.

## 🔮 Possible next steps

- more enemy patterns and level variety beyond the Moth and Gum Turret
- more power-up combinations and boss interactions
- the remaining agent-play backends, llama.cpp and a hosted API, need a real live test; only the Ollama backend has been verified against a running server
- an in-game settings screen for volume and mute, rather than a single mute button
- a more formal deploy-ready pipeline

## License

MIT