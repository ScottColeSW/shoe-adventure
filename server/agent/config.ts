// Env-driven settings for the agent-decision module, mirroring the shape of
// Dominion's inference/config.py `settings` object: one place that reads
// process.env once, with sane local-dev defaults so nothing here is
// required just to run `pnpm dev`.

export const agentConfig = {
  ollamaUrl: process.env.SHOE_OLLAMA_URL || "http://127.0.0.1:11434",
  llamacppUrl: process.env.SHOE_LLAMACPP_URL || "http://127.0.0.1:8080",
  hostedApiUrl: process.env.SHOE_HOSTED_API_URL || "https://api.anthropic.com/v1/messages",
  hostedApiKey: process.env.SHOE_HOSTED_API_KEY || "",
  hostedModel: process.env.SHOE_HOSTED_MODEL || "claude-haiku-4-5",
  /** Hard ceiling on any single decision call. A run must never stall
   * waiting on a slow model -- see server/agent/decide.ts's fallback path. */
  decisionTimeoutMs: Number(process.env.SHOE_DECISION_TIMEOUT_MS) || 4000,
  dbPath: process.env.SHOE_AGENT_DB_PATH || new URL("./decision_history.db", import.meta.url).pathname,
};
