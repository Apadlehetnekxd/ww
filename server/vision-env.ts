export type VisionEnvironment = { OPENROUTER_API_KEY?: string; GEMINI_API_KEY?: string; ELEVENLABS_API_KEY?: string; VISION_MODEL?: string };

/** Called on the server only. Legacy deployments can reuse their existing key. */
export function visionEnvironment(env: Record<string, string | undefined> = process.env): VisionEnvironment {
  return {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
  };
}
