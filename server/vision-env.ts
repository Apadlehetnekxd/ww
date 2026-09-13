export type VisionEnvironment = { OPENROUTER_API_KEY?: string; ELEVENLABS_API_KEY?: string; VISION_MODEL?: string };

/** Called on the server only. Legacy deployments can reuse their existing key. */
export function visionEnvironment(env: Record<string, string | undefined> = process.env): VisionEnvironment {
  return {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY,
    ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
    VISION_MODEL: env.VISION_MODEL || env.VITE_VISION_MODEL || 'google/gemini-3.7-flash',
  };
}
