import { createGoogleGenerativeAI } from "@ai-sdk/google";

const DEFAULT_MODEL = "gemini-2.5-flash";

// Support single key or comma-separated key pool:
// GOOGLE_GENERATIVE_AI_API_KEY="key1,key2,key3"
const keys = (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (keys.length === 0) {
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
}

let counter = 0;

/**
 * Returns a Gemini model instance using the next API key in the pool (round-robin).
 * Each call advances the key pointer, distributing load across all keys.
 */
export function getModel(modelId: string = DEFAULT_MODEL) {
  const key = keys[counter % keys.length];
  counter++;
  return createGoogleGenerativeAI({ apiKey: key })(modelId);
}
