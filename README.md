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
- a dramatic “AI Super Run” mode that is genuinely fun to watch
- a polished, toy-world vibe instead of a generic dashboard look

## ⚡ Local showcase modes

This repo does not have a public hosted deployment yet, so the best way to experience the game is to run it locally. When the app is up, these built-in query routes make the showcase moments easy to try:

- `?demo` — auto-driven rescue run showcase
- `?superrun` — spectacle-focused Super Run preview
- `?dance` — reunion celebration preview

Use those URLs after starting the dev server to watch the game’s signature moments without needing a live deployment.

## 🕹️ Controls

- `A` / `D` or arrow keys: move
- `W` / `Space` / Up: jump
- `Shift` or dash input where available
- pause and restart through the in-game HUD

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
- `client/src/components/` — UI and game-host components
- `server/` — Express server entrypoint
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

- richer enemy patterns and more level variety
- more power-up combinations and boss interactions
- stronger audio and animation polish
- a more formal deploy-ready pipeline

## License

MIT