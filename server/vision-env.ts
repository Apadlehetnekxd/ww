export type VisionEnvironment = { OPENROUTER_API_KEY?: string; GEMINI_API_KEY?: string; ELEVENLABS_API_KEY?: string; VISION_MODEL?: string };

/** Called on the server only. Legacy deployments can reuse their existing key. */
const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash';

export function visionEnvironment(env: Record<string, string | undefined> = process.env): VisionEnvironment {
  const configuredModel = env.VISION_MODEL || env.VITE_VISION_MODEL;
  const isModelId = Boolean(configuredModel && !configuredModel.trim().startsWith('sk-') && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(configuredModel.trim()));
  return {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
    VISION_MODEL: isModelId ? configuredModel!.trim() : DEFAULT_VISION_MODEL,
  };
}
