export type LebangEnvironment = { LEBANG_API_KEY?: string };

export async function handleLebangRequest(request: Request, env: LebangEnvironment): Promise<Response> {
  const key = env.LEBANG_API_KEY;
  if (!key) return Response.json({ error: "LEBANG_API_KEY is not configured." }, { status: 503 });
  const target = new URL(request.url).pathname.endsWith("/models") ? "https://lebang.si/v1/models" : "https://lebang.si/v1/chat/completions";
  const response = await fetch(target, {
    method: request.method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
  });
  return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" } });
}

export function lebangEnvironment(env: Record<string, string | undefined>): LebangEnvironment {
  return { LEBANG_API_KEY: env.LEBANG_API_KEY };
}
