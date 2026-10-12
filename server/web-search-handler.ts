export type WebSearchEnvironment = { SERPAPI_KEY?: string };

type OrganicResult = { title?: string; link?: string; snippet?: string; source?: string; date?: string; thumbnail?: string };

export async function handleWebSearchRequest(request: Request, env: WebSearchEnvironment): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  let body: { query?: string; locale?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const query = body.query?.trim().slice(0, 300);
  if (!query) return Response.json({ results: [] });
  if (!env.SERPAPI_KEY) return Response.json({ error: 'Web search is not configured.' }, { status: 503 });
  const language = body.locale === 'hu' ? 'hu' : 'en';
  const country = body.locale === 'hu' ? 'hu' : 'us';
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: env.SERPAPI_KEY, num: '6', hl: language, gl: country });
  try {
    const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(12_000) });
    const data = await response.json() as { error?: string; organic_results?: OrganicResult[] };
    if (!response.ok || data.error) return Response.json({ error: 'Web search is temporarily unavailable.' }, { status: 502 });
    const results = (data.organic_results || []).slice(0, 6).filter((item) => item.link && item.title).map((item) => ({ title: item.title!, link: item.link!, snippet: item.snippet || '', source: item.source || new URL(item.link!).hostname, date: item.date, thumbnail: item.thumbnail }));
    return Response.json({ query, results });
  } catch { return Response.json({ error: 'Web search is temporarily unavailable.' }, { status: 502 }); }
}

export function webSearchEnvironment(env: Record<string, string | undefined> = process.env): WebSearchEnvironment { return { SERPAPI_KEY: env.SERPAPI_KEY }; }

export function formatWebSearchContext(query: string, results: Array<{ title: string; link: string; snippet?: string; source?: string }>): string {
  return `[LIVE WEB SOURCES FOR: ${query}]\n${results.map((result, index) => `${index + 1}. [${result.title}](${result.link}) — ${result.source || 'Web'}\n${result.snippet || ''}`).join('\n')}\n[END LIVE WEB SOURCES]\nUse these sources for current facts and cite them as clickable markdown links in the answer.`;
}
    
