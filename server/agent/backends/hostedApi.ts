// Hosted API backend (Anthropic's Messages API by default). Implemented
// against the documented forced tool-call shape -- tool_choice pinned to
// one tool whose input_schema enum is the option set -- as this stack's
// equivalent of llama.cpp's GBNF grammar: a real constrained-output
// mechanism, just a JSON schema instead of a grammar string. NOT
// live-tested in this pass: no API key is configured in this sandbox.
// Needs a real smoke test with SHOE_HOSTED_API_KEY set before it's trusted
// the way the Ollama backend is (see server/agent/backends/ollama.ts).

import type { AgentBackend, BackendReply } from "./base";
import { agentConfig } from "../config";

export class HostedApiBackend implements AgentBackend {
  readonly backendName = "hosted";
  readonly supportsConstrainedOutput = true;

  constructor(
    private readonly baseUrl: string = agentConfig.hostedApiUrl,
    private readonly apiKey: string = agentConfig.hostedApiKey,
  ) {}

  async decide(prompt: string, model: string, options: readonly string[], timeoutMs: number): Promise<BackendReply> {
    const started = Date.now();
    if (!this.apiKey) return { raw: null, latencyMs: 0 }; // Never attempt a call with no key configured.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 32,
          messages: [{ role: "user", content: prompt }],
          tools: [
            {
              name: "choose",
              description: "Choose exactly one option for this decision.",
              input_schema: {
                type: "object",
                properties: { choice: { type: "string", enum: options } },
                required: ["choice"],
              },
            },
          ],
          tool_choice: { type: "tool", name: "choose" },
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { raw: null, latencyMs: Date.now() - started };
      const data = (await res.json()) as { content?: Array<{ type: string; input?: { choice?: string } }> };
      const toolUse = data.content?.find((block) => block.type === "tool_use");
      return { raw: toolUse?.input?.choice ?? null, latencyMs: Date.now() - started };
    } catch {
      return { raw: null, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}
