/** Ollama models that are free (no subscription/credits required). */
export const FREE_MODELS = [
  "gpt-oss:20b",
  "gpt-oss:120b",
  "gemma3:27b",
  "nemotron-3-nano:30b",
  "nemotron-3-super",
  "nemotron-3-ultra",
] as const;

const FREE_SET: Set<string> = new Set(FREE_MODELS);

/** Returns true if the model name is in the free models list. */
export function isFreeModel(model: string): boolean {
  return FREE_SET.has(model);
}

/** Returns a display label for a model, appending "(free)" for free models. */
export function modelLabel(model: string): string {
  return isFreeModel(model) ? `${model} (free)` : model;
}
