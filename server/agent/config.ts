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
  /** Hard ceiling on any single decision call. A run must never stall
   * waiting on a slow model -- see server/agent/decide.ts's fallback path. */
  decisionTimeoutMs: Number(process.env.SHOE_DECISION_TIMEOUT_MS) || 4000,
  // fileURLToPath, not new URL(...).pathname: a URL pathname on Windows
  // keeps a leading slash before the drive letter ("/H:/pet_projects/..."),
  // which better-sqlite3's underlying SQLite open call rejects outright
  // ("Cannot open database because the directory does not exist"), even
  // though the directory is right there. fileURLToPath is the standard
  // fix for exactly this file-URL-to-local-path conversion and produces a
  // real Windows path ("H:\pet_projects\...") instead.
  dbPath: process.env.SHOE_AGENT_DB_PATH || fileURLToPath(new URL("./decision_history.db", import.meta.url)),
};
