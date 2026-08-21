// llama.cpp backend. Implemented against llama-server's documented
// /completion API and GBNF grammar field -- the same mechanism Dominion's
// inference/grammars.py builds ("llama-server's /completion accepts a
// 'grammar' field") -- but NOT live-tested in this pass: this sandbox has
// no llama-server to talk to. Treat this as a real first implementation
// that needs a live smoke test against an actual llama-server before it's
// trusted the way the Ollama backend is (see server/agent/backends/ollama.ts).
//
// llama-server is expected running in router mode, same setup Dominion's
// README documents, reachable at agentConfig.llamacppUrl.

import type { AgentBackend, BackendReply } from "./base";
import { agentConfig } from "../config";

function literal(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Constrains the reply to exactly one of the given option tokens --
 * mirrors Dominion's grammars.py index_choice_grammar/letter_or_pass_grammar
 * shape (root ::= alternation of literals), just built from our option
 * strings instead of indices/letters. */
function optionGrammar(options: readonly string[]): string {
  return `root ::= ${options.map(literal).join(" | ")}\n`;
}

export class LlamaCppBackend implements AgentBackend {
  readonly backendName = "llamacpp";
  readonly supportsConstrainedOutput = true;

  constructor(private readonly baseUrl: string = agentConfig.llamacppUrl) {}

  async decide(prompt: string, model: string, options: readonly string[], timeoutMs: number): Promise<BackendReply> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/completion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          grammar: optionGrammar(options),
          n_predict: 8,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { raw: null, latencyMs: Date.now() - started };
      const data = (await res.json()) as { content?: string };
      return { raw: data.content ?? null, latencyMs: Date.now() - started };
    } catch {
      return { raw: null, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}
