// Environment preflight check, mirroring the role Dominion's own
// check_env.py plays there: run this once before your first `pnpm dev`
// (or any time something agent-related misbehaves) to catch the two
// things that otherwise fail deep inside a request instead of up front --
// the decision/run history database not opening, and Ollama not being
// reachable -- with a clear one-line message instead of a stack trace.
//
// Like Dominion's version, nothing here is a hard requirement: the game
// runs fine with Ollama offline (agent runs just report a fallback choice
// every time, see server/agent/decide.ts) and this script never exits
// non-zero for that. It only exits non-zero if the database itself can't
// be opened at all, since that's a real, silent-failure-prone bug, not an
// optional feature being unavailable.

import { agentConfig } from "../server/agent/config";
import { ensureReady as ensureAgentHistoryReady } from "../server/agent/history";
import { ensureReady as ensureRunsReady } from "../server/runs";

const OLLAMA_CHECK_TIMEOUT_MS = 3000;

function checkNodeVersion() {
  console.log(`[ok]   Node ${process.version}`);
}

function checkDatabase(): boolean {
  try {
    ensureAgentHistoryReady();
    ensureRunsReady();
    console.log(`[ok]   Decision + run history database opens fine at ${agentConfig.dbPath}`);
    return true;
  } catch (error) {
    console.error(`[FAIL] Could not open the database at ${agentConfig.dbPath}`);
    console.error(`       ${String(error)}`);
    console.error("       This usually means the directory in that path doesn't exist yet on this machine --");
    console.error("       make sure server/agent/ is present (it ships with the repo) and try again.");
    return false;
  }
}

async function checkOllama(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${agentConfig.ollamaUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const count = data.models?.length ?? 0;
    console.log(`[ok]   Ollama reachable at ${agentConfig.ollamaUrl} -- ${count} model${count === 1 ? "" : "s"} installed`);
  } catch {
    console.log(`[skip] Ollama not reachable at ${agentConfig.ollamaUrl}.`);
    console.log("       The game still runs fine without it -- the title screen's AGENT RUN picker will just");
    console.log("       show an offline hint, and any agent run falls back to a scripted response. To enable");
    console.log("       live agent play: install Ollama (https://ollama.com/download), run `ollama serve`, and");
    console.log("       `ollama pull <a model>`.");
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("Shoe Adventure setup check\n" + "=".repeat(26));
  checkNodeVersion();
  const dbOk = checkDatabase();
  await checkOllama();

  console.log("\nSetup check complete." + (dbOk ? "" : " Fix the database issue above before continuing.") + "\n");
  console.log("Start the dev server:\n\n    pnpm dev\n\nThen open the local URL it prints.");

  if (!dbOk) process.exitCode = 1;
}

main();
