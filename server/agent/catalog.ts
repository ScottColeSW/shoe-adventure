// Installed-Ollama-model catalog, mirroring the methodology from Scott's
// Dominion project (src/dominion/server/model_catalog.py): what's actually
// pulled on this machine right now, queried live from Ollama's own
// /api/tags, rather than a fixed hardcoded list. Backs the title screen's
// Agent Run model picker (see GameCanvas.tsx).
//
// Dominion's version also catalogs a llama.cpp models directory and sums a
// multi-model selection against a memory budget, because a Dominion show
// can run several models side by side. Shoe Adventure only ever drives one
// agent backend at a time, and only the Ollama backend is verified working
// (see README.md), so this starts smaller: Ollama only, one model chosen
// at a time. The per-model size + system-memory-budget shape carries over
// unchanged so the picker can still greave out a model that would not
// comfortably fit.

import os from "node:os";
import { agentConfig } from "./config";

const OLLAMA_TAGS_TIMEOUT_MS = 3000;

export interface CatalogModel {
  name: string;
  sizeBytes: number;
}

export interface ModelCatalog {
  reachable: boolean;
  models: CatalogModel[];
  systemMemory: { totalBytes: number; availableBytes: number };
}

interface OllamaTagsEntry {
  name?: string;
  model?: string;
  size?: number;
  capabilities?: string[];
}

async function fetchOllamaModels(): Promise<{ reachable: boolean; models: CatalogModel[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TAGS_TIMEOUT_MS);
  try {
    const res = await fetch(`${agentConfig.ollamaUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { reachable: false, models: [] };
    const data = (await res.json()) as { models?: OllamaTagsEntry[] };
    const models: CatalogModel[] = [];
    for (const entry of data.models ?? []) {
      const name = entry.name ?? entry.model;
      const size = entry.size;
      const capabilities = entry.capabilities ?? [];
      // Same completion-capability filter as Dominion's model_catalog.py:
      // an embedding-only model (nomic-embed-text and similar) can never
      // return a usable enemy-response choice, so it never belongs in this
      // list. Ollama reports this itself on /api/tags, no hardcoded
      // per-model-name list needed. Older Ollama builds that omit
      // "capabilities" entirely report an empty array here, which this
      // treats as "unknown, don't exclude" rather than filtering everything
      // out -- the opposite assumption from Dominion's, deliberately: that
      // project's Ollama install always reports capabilities, this one is
      // unverified, and showing an extra embedding model in the picker is a
      // far smaller problem than showing an empty picker.
      if (name && typeof size === "number" && (capabilities.length === 0 || capabilities.includes("completion"))) {
        models.push({ name, sizeBytes: size });
      }
    }
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function getModelCatalog(): Promise<ModelCatalog> {
  const ollama = await fetchOllamaModels();
  return {
    reachable: ollama.reachable,
    models: ollama.models,
    // os.freemem() is the closest built-in equivalent to psutil's
    // available_bytes without adding a dependency; on Windows (Scott's own
    // machine) it already reports available physical memory directly, with
    // none of the buffer/cache accounting nuance that would make it an
    // overestimate on Linux.
    systemMemory: { totalBytes: os.totalmem(), availableBytes: os.freemem() },
  };
}
