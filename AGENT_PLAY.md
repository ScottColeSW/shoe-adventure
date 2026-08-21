# Shoe Adventure — Agent Play (Phase 1: Strategic Director)

## Status: built and type-checked, not yet on your machine

Everything described here exists in a working copy on the cloud side, where it has passed a full TypeScript check. None of it has been copied back to your computer yet, and nothing has been committed to git. It is on hold while we work through the fun-factor pass first. This document is here so you can review the shape of it before it ships.

## What this is

Shoe Adventure's project goal calls for a game that is good for people and AI agents to play. Until now, the only agent-facing thing in the game was the existing Super Run autopilot, which is a fully scripted, deterministic route: it always makes the same choices at the same points, keyed off the player's position in the level. That is good spectacle, but no outside agent is actually deciding anything.

This phase changes one part of that. When an ordinary enemy or a mini-boss comes into range during an agent-driven run, instead of following the hardcoded rule the Super Run always used, the game now asks a real AI model how to handle it: fight with a stomp, fight with a lash, use a basic kick, or dodge past. Everything else about the run, the route, the power-ups, the camera, the finale, stays exactly as it was. Only that one decision point is opened up.

## Why it works this way

Shoe Adventure runs its physics at sixty frames a second. A live call to an AI model takes anywhere from a fraction of a second to several seconds, so asking a model to make every single movement decision in real time is not realistic. The approach here borrows the shape of an idea from your Dominion project rather than copying it wholesale: keep the fast-moving, physical parts of the game exactly as reliable as they already are, and open up only a small number of high-value, discrete decisions to an outside agent. This first phase ships exactly one such decision. More can be added the same way later.

## How a run is reliable even when the AI is not

This is the same principle your Dominion project leans on: a live show should never stall because a model is slow or unreachable. Every decision call has a hard time limit. If the model does not answer in time, if the connection fails, or if the reply cannot be understood, the game falls back instantly to the exact same choice the original scripted Super Run always made. A person watching would only notice the fallback from a brief status line, never from the game freezing or breaking.

## What backends are supported

Three are built, at different levels of readiness:

- **Ollama**, a locally-run model server, is the one that has been fully built and is ready for a real test on your machine, since it needs no special setup beyond having Ollama running with a model pulled.
- **llama.cpp**, matching the setup your Dominion project already uses, is implemented against its documented API and its grammar feature, which constrains a model's reply to a fixed set of valid answers. It has not been tested against a live llama-server yet, since none was available in this session.
- A **hosted API** backend (Claude, by default) is implemented the same way, using a forced tool call to constrain the reply, but it also has not been tested live, since no API key was configured in this session.

Whichever backend answers, the reply still goes through a careful reader on the game's side, the same discipline your Dominion project uses: a constrained reply is more reliable, but it is not the only safety net, so a plain reader is always in place regardless of backend.

## What gets recorded

Every decision, whether it comes from a real model or falls back to the script, is written to a small local database on the game's server: which backend and model answered, what was chosen, how long it took, and whether it was a fallback. A `/api/agent/stats` endpoint summarizes this by backend and model. Turning that into an actual outcome, such as whether the choice led to the enemy being defeated or the player taking damage, is a natural next step but is not wired up yet; the database already has a column reserved for it.

## How you would try it

Once this is shipped to your machine, starting the game with `?agent=ollama&model=<a model you have pulled>` in the address bar hands enemy encounters to that model for the length of the run, with everything else behaving exactly like the existing Super Run. The plan is to test this for real once we finish the fun-factor pass and bring this code over.

## What is intentionally not done yet

Only one decision point is agent-driven so far. Two more identified while building this, which power-up to prioritize and whether to fight or retreat from a real threat, are natural next additions using the same pattern. The llama.cpp and hosted API backends need a real live test before they should be trusted the way the Ollama one can be. And there is no way yet to watch many runs at once and compare backends the way your Dominion project's batch tooling does; that is a reasonable next step once this foundation is proven out.
