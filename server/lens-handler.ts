export type LensEnvironment = { SERPAPI_KEY?: string };

type LensResult = { title?: string; link?: string; source?: string; thumbnail?: string; snippet?: string };

export async function handleLensRequest(request: Request, env: LensEnvironment): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  if (!env.SERPAPI_KEY) return Response.json({ error: 'Visual search is not configured yet.' }, { status: 503 });

  let body: { image?: string; label?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body.image || typeof body.image !== 'string' || body.image.length > 8_000_000) return Response.json({ error: 'A valid camera image is required.' }, { status: 400 });

  const params = new URLSearchParams({ engine: 'google_lens', url: body.image, api_key: env.SERPAPI_KEY });
  if (body.label) params.set('q', body.label.slice(0, 120));
  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: AbortSignal.timeout(25_000) });
    const data = await response.json() as { error?: string; visual_matches?: LensResult[]; knowledge_graph?: { title?: string; description?: string; source?: { name?: string; link?: string } } };
    if (!response.ok || data.error) return Response.json({ error: 'Visual search is temporarily unavailable.' }, { status: 502 });
    const matches = (data.visual_matches || []).slice(0, 12).map(item => ({ title: item.title || 'Visual match', link: item.link, source: item.source, thumbnail: item.thumbnail, snippet: item.snippet })).filter(item => item.link);
    return Response.json({ matches, knowledge: data.knowledge_graph ? { title: data.knowledge_graph.title, description: data.knowledge_graph.description, source: data.knowledge_graph.source?.name, link: data.knowledge_graph.source?.link } : null });
  } catch { return Response.json({ error: 'Visual search is temporarily unavailable.' }, { status: 502 }); }
}

export function lensEnvironment(env: Record<string, string | undefined> = process.env): LensEnvironment { return { SERPAPI_KEY: env.SERPAPI_KEY }; }

