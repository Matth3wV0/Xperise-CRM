import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

// Model fallback order: try primary first, then fallbacks if all keys exhausted
const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

const keys = (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (keys.length === 0) {
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
}

// Global round-robin counter — shared across all calls
let keyCounter = 0;

function isQuotaError(err: unknown): boolean {
  const e = err as any;
  // Direct APICallError (when maxRetries: 0)
  if (e?.statusCode === 429) return true;
  // RetryError wrapping APICallError
  if (e?.lastError?.statusCode === 429) return true;
  return false;
}

export async function generateWithFallback(params: {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}): Promise<string> {
  const startKey = keyCounter;

  for (const modelId of MODELS) {
    // Try every key in rotation for this model
    for (let i = 0; i < keys.length; i++) {
      const key = keys[(startKey + i) % keys.length];
      const model = createGoogleGenerativeAI({ apiKey: key })(modelId);

      try {
        const { text } = await generateText({
          model,
          system: params.system,
          prompt: params.prompt,
          maxOutputTokens: params.maxOutputTokens,
          maxRetries: 0, // disable built-in retry so we control fallback
        });

        // Advance global counter so next call starts from next key
        keyCounter = (startKey + i + 1) % keys.length;
        return text;
      } catch (err) {
        if (isQuotaError(err)) {
          console.warn(`[gemini] 429 on key[${(startKey + i) % keys.length}] model=${modelId}, trying next...`);
          continue;
        }
        throw err; // non-quota error — rethrow immediately
      }
    }

    console.warn(`[gemini] All ${keys.length} keys exhausted for model=${modelId}, trying next model...`);
  }

  throw new Error(`[gemini] All ${keys.length} keys × ${MODELS.length} models exhausted`);
}
