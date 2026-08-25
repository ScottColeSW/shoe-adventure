// Env-driven settings for the agent-decision module, mirroring the shape of
// Dominion's inference/config.py `settings` object: one place that reads
// process.env once, with sane local-dev defaults so nothing here is
// required just to run `pnpm dev`.

import { fileURLToPath } from "node:url";

export const agentConfig = {
  ollamaUrl: process.env.SHOE_OLLAMA_URL || "http://127.0.0.1:11434",
  llamacppUrl: process.env.SHOE_LLAMACPP_URL || "http://127.0.0.1:8080",
  hostedApiUrl: process.env.SHOE_HOSTED_API_URL || "https://api.anthropic.com/v1/messages",
  hostedApiKey: process.env.SHOE_HOSTED_API_KEY || "",
  hostedModel: process.env.SHOE_HOSTED_MODEL || "claude-haiku-4-5",
  /** The generous ceiling used until a given backend+model has enough real latency
   * history to trust (see decisionLatencySamplesToTighten) -- decide.ts calls this the
   * "learning phase" timeout. Was a flat 4000ms for every call ever made; live-tested
   * against local Ollama on CPU (llama3.2:3b), every single decision timed out at
   * ~4000-4030ms with `fallback: true` -- 4s isn't enough for CPU inference, especially
   * cold. Once decide.ts has enough successful-call history for a specific backend+model
   * (see getLatencyProfile), it tightens the actual per-request timeout toward that
   * model's own observed p90 latency instead of always using this ceiling. */
  decisionTimeoutMs: Number(process.env.SHOE_DECISION_TIMEOUT_MS) || 10000,
  /** Once a backend+model has this many successful (non-fallback) calls on record,
   * decide.ts trusts getLatencyProfile's p90 over the learning-phase ceiling above.
   * Was 8 -- live-tested, and 8 fast calls from one run under light load were enough to
   * tighten the timeout down near the floor, then a later run under slightly heavier
   * load (same machine, same model) pushed real latency just past that tightened value
   * and every single call started missing it. 8 samples from one run isn't a robust
   * enough estimate of latency across varying real-world load; a larger pool smooths
   * that out. */
  decisionLatencySamplesToTighten: Number(process.env.SHOE_DECISION_LATENCY_SAMPLES) || 20,
  /** The tightened timeout is p90LatencyMs * this multiplier -- headroom above the
   * observed 90th percentile so an ordinarily-fast model isn't cut off by an unlucky
   * slightly-slower-than-usual reply, while still being meaningfully tighter than the
   * learning-phase ceiling once real data says it can be. Was 1.6 -- too thin a margin,
   * see decisionLatencySamplesToTighten's comment for what that caused. */
  decisionLatencyBuffer: Number(process.env.SHOE_DECISION_LATENCY_BUFFER) || 2.2,
  /** Never tighten below this, regardless of how fast a model's history looks -- leaves
   * room for ordinary request/response jitter even for a consistently-fast model. Was
   * 1500ms, which real qwen2.5:3b calls started missing by a hair once the timeout had
   * tightened onto it -- raised for real margin. */
  decisionMinTimeoutMs: Number(process.env.SHOE_DECISION_MIN_TIMEOUT_MS) || 3000,
  // fileURLToPath, not new URL(...).pathname: a URL pathname on Windows
  // keeps a leading slash before the drive letter ("/H:/pet_projects/..."),
  // which better-sqlite3's underlying SQLite open call rejects outright
  // ("Cannot open database because the directory does not exist"), even
  // though the directory is right there. fileURLToPath is the standard
  // fix for exactly this file-URL-to-local-path conversion and produces a
  // real Windows path ("H:\pet_projects\...") instead.
  dbPath: process.env.SHOE_AGENT_DB_PATH || fileURLToPath(new URL("./decision_history.db", import.meta.url)),
};
