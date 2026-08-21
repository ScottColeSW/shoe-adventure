// Builds the prompt for a decision, calls the selected backend, and
// parses the reply defensively -- the same "grammar/schema constrains
// syntax, the parser stays in place regardless" discipline Dominion's
// grammars.py documents. Any failure at any step (unknown backend, call
// failure, unparseable reply) returns fallback: true rather than throwing,
// so the Express route (server/index.ts) never needs its own try/catch
// around a live call.

import { ENEMY_RESPONSE_OPTIONS, type DecisionRequest, type DecisionResponse, type EnemyResponseChoice } from "./types";
import type { AgentBackend } from "./backends/base";
import { OllamaBackend } from "./backends/ollama";
import { LlamaCppBackend } from "./backends/llamacpp";
import { HostedApiBackend } from "./backends/hostedApi";
import { agentConfig } from "./config";
import { recordDecision } from "./history";

const backends: Record<DecisionRequest["backend"], AgentBackend> = {
  ollama: new OllamaBackend(),
  llamacpp: new LlamaCppBackend(),
  hosted: new HostedApiBackend(),
};

function buildEnemyResponsePrompt(request: DecisionRequest): string {
  const { player, enemy } = request.state;
  const bossNote = enemy.bossTier ? ` It is a ${enemy.bossTier} boss named ${enemy.bossName}.` : "";
  return [
    "You are playing Shoe Adventure, a platformer. Right Shoe is about to encounter an enemy.",
    `Right Shoe has ${player.hearts} hearts left and is currently in ${player.shoeForm} form.${bossNote}`,
    `The enemy is a ${enemy.kind}.`,
    "Available responses:",
    player.gumStompReady ? "- gum_stomp: a sticky ground-pound attack" : null,
    player.laceLashReady ? "- lace_lash: a short-range whip attack" : null,
    "- super_kick: a basic jumping kick, always available",
    "- avoid: dodge past without attacking",
    "Reply with exactly one word: gum_stomp, lace_lash, super_kick, or avoid.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseEnemyResponseChoice(raw: string | null): EnemyResponseChoice | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return (ENEMY_RESPONSE_OPTIONS as readonly string[]).find((option) => normalized.includes(option)) as
    | EnemyResponseChoice
    | null
    | undefined ?? null;
}

export async function decide(request: DecisionRequest): Promise<DecisionResponse> {
  const backend = backends[request.backend];
  const base = { backend: request.backend, model: request.model };

  if (!backend) {
    recordDecision({ runId: request.runId, decisionType: request.decisionType, ...base, choice: null, fallback: true, outcome: "unknown", latencyMs: 0 });
    return { choice: null, fallback: true, ...base, latencyMs: 0 };
  }

  const prompt = buildEnemyResponsePrompt(request);
  const { raw, latencyMs } = await backend.decide(prompt, request.model, ENEMY_RESPONSE_OPTIONS, agentConfig.decisionTimeoutMs);
  const choice = parseEnemyResponseChoice(raw);

  console.log(
    JSON.stringify({
      event: "agent_decision",
      runId: request.runId,
      decisionType: request.decisionType,
      backend: request.backend,
      model: request.model,
      choice,
      fallback: choice === null,
      latencyMs,
    }),
  );

  // Outcome (did the chosen response actually work?) is only known once
  // the game resolves the encounter, which happens after this call
  // returns -- recorded as "unknown" here. Enriching this row once the
  // client reports what happened is a natural fast-follow, not done in
  // this pass; the schema (history.ts) already has the column for it.
  recordDecision({ runId: request.runId, decisionType: request.decisionType, ...base, choice, fallback: choice === null, outcome: "unknown", latencyMs });

  return { choice, fallback: choice === null, ...base, latencyMs };
}
