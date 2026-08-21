// Ollama backend -- the one AgentBackend fully implemented and exercised in
// Phase 1 (see plan: no grammar plumbing needed to get first signal).
// Mirrors Dominion's ollama_client.py: a plain POST to /api/generate with
// stream: false, no constrained-output mechanism (Ollama's public API has
// none, same limitation Dominion's InferenceClient.supports_grammar
// documents), and every failure mode collapsed to `raw: null` rather than
// a thrown error.

import type { AgentBackend, BackendReply } from "./base";
import { agentConfig } from "../config";

export class OllamaBackend implements AgentBackend {
  readonly backendName = "ollama";
  readonly supportsConstrainedOutput = false;

  constructor(private readonly baseUrl: string = agentConfig.ollamaUrl) {}

  async decide(prompt: string, model: string, _options: readonly string[], timeoutMs: number): Promise<BackendReply> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Ollama's generate prompt asks for exactly one of the option
        // tokens on its own line -- there is no grammar to enforce this,
        // so decide.ts's parser is the only thing standing between a
        // rambling reply and a legal choice.
        body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 24 } }),
        signal: controller.signal,
      });
      if (!res.ok) return { raw: null, latencyMs: Date.now() - started };
      const data = (await res.json()) as { response?: string };
      return { raw: data.response ?? null, latencyMs: Date.now() - started };
    } catch {
      // Network error, abort/timeout, or a non-JSON body -- all the same
      // "this call failed" signal to the caller, never a thrown error.
      return { raw: null, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}
