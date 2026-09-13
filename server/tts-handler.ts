import { z } from 'zod';
import type { VisionEnvironment } from './vision-env';

const schema = z.object({
  text: z.string().trim().min(1).max(4000),
  language: z.string().trim().max(16).optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handleTtsRequest(request: Request, env: VisionEnvironment): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST for speech.' }, 405);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send a JSON request.' }, 415);
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Speech must be requested from this app.' }, 403);
  }
  if (!env.ELEVENLABS_API_KEY?.trim()) return json({ error: 'Speech is not configured.' }, 503);
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'The request could not be read.' }, 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: 'Send text to read aloud.' }, 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=mp3_44100_128', {
      method: 'POST', signal: controller.signal,
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: parsed.data.text, model_id: 'eleven_flash_v2_5' }),
    });
    if (response.ok) {
      return new Response(response.body, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      });
    }
    return json({ error: 'Spoken audio is unavailable.' }, response.status === 429 ? 429 : 502);
  } catch {
    return json({ error: 'Spoken audio could not be reached.' }, 502);
  } finally { clearTimeout(timeout); }
}
