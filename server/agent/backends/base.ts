// The backend-agnostic boundary every AgentBackend implements. Mirrors
// Dominion's inference/base.py InferenceClient Protocol: one capability
// flag, one method, and a contract that it NEVER throws -- a network
// failure, timeout, or malformed backend response all come back as
// `raw: null`, so decide.ts never needs a try/catch around a live call and
// always has a clean signal to fall back on.

export interface BackendReply {
  raw: string | null;
  latencyMs: number;
}

export interface AgentBackend {
  /** Stable label used on every logged decision and stats row -- see
   * decide.ts and history.ts. */
  readonly backendName: string;

  /** Whether this backend can constrain generation to the option set
   * itself (llama.cpp's GBNF grammar, a hosted API's JSON schema/tool
   * choice). decide.ts's parser stays in place regardless -- constrained
   * output is a reliability improvement, not the only safety net, the same
   * discipline Dominion's grammars.py documents. */
  readonly supportsConstrainedOutput: boolean;

  decide(prompt: string, model: string, options: readonly string[], timeoutMs: number): Promise<BackendReply>;
}
