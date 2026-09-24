# Shoe Adventure

A tiny rescue quest with a giant personality.

The Right Shoe is on a full-screen nighttime mission through a toy-scale bedroom to reunite with the Left Shoe and defeat the rogue roller skate tower.

<div align="center">

![Shoe Adventure](https://img.shields.io/badge/Shoe%20Adventure-Playful%20Rescue%20Platformer-FF5A4F?style=for-the-badge)

[![License](https://img.shields.io/github/license/ScottColeSW/shoe-adventure)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/ScottColeSW/shoe-adventure)](https://github.com/ScottColeSW/shoe-adventure/releases/latest)

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

The title screen itself also has an **AGENT RUN** button next to the normal LACE UP & LEAP start, so you no longer need a query string to try this. It opens a small picker, live installed-model list pulled straight from Ollama's own API, a plain offline hint if Ollama isn't running yet, and a memory check so a model too large for the machine's free memory greys out. This mirrors the pre-show model picker from Scott's Dominion project, scaled down to Shoe Adventure's single-agent-at-a-time shape. Run `ollama serve` locally first, then open the title screen.

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
- `server/agent/` — the agent-play "Strategic Director" backend (see [`AGENT_PLAY.md`](./AGENT_PLAY.md)), plus the installed-model catalog (`catalog.ts`) backing the title screen's Agent Run picker
- `server/runs.ts`, `server/runsRouter.ts` — run history and the leaderboard API
- `shared/` — shared constants and cross-cutting values
- `patches/` — package patch files

## 🚀 Run it locally

### Install dependencies

```bash
pnpm install
```

### (Optional) Give the agent a head start

```bash
pnpm seed-agent-memory
```

Pre-populates the agent decision database with synthetic-but-representative outcomes (a few seconds, no Ollama required) so Agent Run's Bayesian bandit isn't starting from zero the first time you watch it play. Safe to skip -- the game works fine without it, the bandit just learns from scratch as real runs happen.

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
- `pnpm check-env` — preflight check: confirms the decision/run history database can actually open on this machine, and reports whether Ollama is reachable. Optional, but worth running once before your first `pnpm dev` (mirrors Dominion's own `check_env.py`)
- `pnpm seed-agent-memory` — optional, one-time: pre-populates the agent decision database with synthetic-but-representative outcomes (~6,300 rows, takes a few seconds) so the Bayesian bandit behind Agent Run (see `server/agent/decide.ts`) starts with real priors instead of a cold "totally unsure" state on a fresh clone. Doesn't call Ollama or any model — worth running once after `pnpm install`, before your first Agent Run
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

## About the creator

Built by **Scott A. Cole**, an AI strategy consultant and the author of 31 books on AI strategy, GenAI, and
decision-making, including the five-book [**Stop Learning AI** series](https://www.amazon.com/dp/B0GPRFYCQF?&linkCode=ll2&tag=ifio42-20&linkId=b67e3c17a4eb0539b2ec9ec37ef410e4&language=en_US&ref_=as_li_ss_tl) for executives who need to
make good AI decisions without becoming technical themselves. The app includes an **About** page and a **Books** page listing every title and edition ([`client/about.html`](client/about.html), [`client/books.html`](client/books.html), reachable from the game's ABOUT link or at `/about.html` and `/books.html` on the dev server). More projects, including [Aegis Vector](https://github.com/ScottColeSW/Project-Aegis-Vector) and [Palimpsest](https://github.com/ScottColeSW/Palimpsest), are at
[github.com/ScottColeSW](https://github.com/ScottColeSW).

<sub>As an Amazon Associate I earn from qualifying purchases.</sub>

## License

MIT