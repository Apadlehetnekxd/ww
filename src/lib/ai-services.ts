// AI Services - Direct client-side API calls to free AI providers
// Since this is a pure client-side Vite app (not TanStack Start), we call providers directly
import type { ChatAttachment } from "./history";

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";

export type ChatModelMode = "fast" | "quality" | "ultra";
export const ULTRA_COOLDOWN_MS = 10 * 60 * 1000;
export const ULTRA_MESSAGES_PER_COOLDOWN = 5;

const QUALITY_MODEL = "dots-studio/dots-3-note-preview:free";
const SPEED_MODEL = "nvidia/nemotron-3.5-lightning:free";

const OPENROUTER_CHAT_MODELS: Record<ChatModelMode, string> = {
  fast: SPEED_MODEL,
  quality: QUALITY_MODEL,
  ultra: QUALITY_MODEL,
};

// Keep attachment requests on the model selected for the current mode.
const OPENROUTER_VISION_MODELS: Record<ChatModelMode, string> = {
  fast: SPEED_MODEL,
  quality: QUALITY_MODEL,
  ultra: QUALITY_MODEL,
};

// ============================================================================
// WEB SEARCH HELPERS (for chat)
// ============================================================================

function isNewsQuery(query: string): boolean {
  const newsKeywords = [
    "news", "hírek", "hír", "hirek", "hir", "latest", "recent", "today", "yesterday",
    "this week", "elmúlt", "elmult", "mai", "tegnapi", "friss", "aktuális", "aktualis",
    "események", "esemenyek", "történt", "tortent", "what happened", "mi történt",
    "mi tortent", "week", "het", "hét", "meselj", "mesélj", "mond el",
  ];
  const q = query.toLowerCase();
  return newsKeywords.some((k) => q.includes(k));
}

export function needsWebSearch(query: string): boolean {
  const triggers = [
    "news", "hírek", "hír", "latest", "recent", "today", "current", "now",
    "who is", "what is", "where is", "when did", "how much", "price",
    "weather", "idő", "időjárás", "stock", "score", "result",
    "ki az", "mi az", "hol van", "mikor", "mennyi", "ár",
    "2024", "2025", "2026", "this year", "last year", "idén", "tavaly",
    "president", "elnök", "ceo", "company", "cég", "died", "meghalt",
    "born", "született", "released", "megjelent", "announced", "bejelent",
  ];
  const q = query.toLowerCase();
  return triggers.some((t) => q.includes(t));
}

async function performWebSearch(query: string, onProgress?: StreamChatOptions['onWebSearchProgress']): Promise<string> {
  onProgress?.({ status: 'started', query, count: 0, sources: [] });
  try {
    const response = await fetch('/api/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as { results?: Array<{ title: string; link: string; snippet?: string; source?: string }>; error?: string };
    if (!response.ok || !payload.results?.length) {
      onProgress?.({ status: 'complete', query, count: 0, sources: [] });
      return `[WEB SEARCH FAILED FOR: ${query}]\nLive search returned no usable sources. Do not guess current facts. Tell the user that live search is temporarily unavailable and ask them to try again.`;
    }
    const sources = payload.results.map((result) => result.source || (result.link ? new URL(result.link).hostname : 'Web'));
    onProgress?.({ status: 'complete', query, count: payload.results.length, sources });
    return `[LIVE WEB SOURCES FOR: ${query}]\n${payload.results.map((result, index) => `${index + 1}. [${result.title}](${result.link}) — ${result.source || 'Web'}\n${result.snippet || ''}`).join('\n')}\n[END LIVE WEB SOURCES]\nUse these current sources and cite the relevant claims as clickable markdown links in the answer.`;
  } catch {
    onProgress?.({ status: 'complete', query, count: 0, sources: [] });
    return `[WEB SEARCH FAILED FOR: ${query}]\nLive search could not be reached. Do not guess current facts. Tell the user that live search is temporarily unavailable and ask them to try again.`;
  }
}

// ============================================================================
// CHAT SERVICE
// ============================================================================

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };
export type UltraComparison = { quality: string; speed: string };
export type StreamChatOptions = {
  ultraCompare?: boolean;
  onUltraComparison?: (comparison: UltraComparison) => void;
  onWebSearchProgress?: (progress: { status: 'started' | 'complete'; query: string; count: number; sources: string[] }) => void;
};

async function collectOpenRouterAnswer(
  model: string,
  messages: unknown[]
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENROUTER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.35,
      max_tokens: 3072,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "OpenRouter authentication failed. Set a valid VITE_OPENROUTER_API_KEY in .env and restart the dev server."
      );
    }
    if (response.status === 429) {
      throw new Error("One of the Ultra models is temporarily rate-limited. Please try again later.");
    }
    if (response.status === 404) {
      throw new Error("One of the Ultra models is currently unavailable.");
    }
    throw new Error(body || "OpenRouter request failed (" + response.status + ").");
  }
  if (!response.body) throw new Error("OpenRouter returned an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as {
          choices?: Array<{ delta?: { content?: unknown } }>;
        };
        const content = chunk.choices?.[0]?.delta?.content;
        if (typeof content === "string") answer += content;
      } catch {
        // Ignore malformed keep-alive chunks and continue reading the stream.
      }
    }
    if (done) break;
  }
  return answer.trim();
}

export async function streamChat(
  messages: ChatMessage[],
  webSearch?: boolean,
  onChunk: (text: string) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: string) => void = () => {},
  attachments: ChatAttachment[] = [],
  mode: ChatModelMode = "quality",
  options: StreamChatOptions = {}
): Promise<void> {
  if (!OPENROUTER_API_KEY) {
    onError("Chat is not available. Please configure the VITE_OPENROUTER_API_KEY environment variable.");
    return;
  }

  try {
    const recent = messages.slice(-6);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted: any[] = recent.map((m) => ({ role: m.role, content: m.content }));

    const textFiles = attachments.filter((a) => a.kind === "text" && a.text);
    const imageFiles = attachments.filter((a) => a.kind === "image" && a.dataUrl);

    // The current turn's attachments belong to the last user message.
    const lastUserIdx = formatted.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx !== -1 && attachments.length > 0) {
      let baseText: string = formatted[lastUserIdx].content || "";

      if (textFiles.length > 0) {
        const blocks = textFiles
          .map((f) => {
            // Cap very large files so we don't blow the context window.
            const body = (f.text || "").slice(0, 20000);
            const truncated = (f.text || "").length > 20000 ? "\n…[truncated]" : "";
            return `\n\n[Attached file: ${f.name}]\n\`\`\`\n${body}${truncated}\n\`\`\``;
          })
          .join("");
        baseText = `${baseText}${blocks}`;
      }

      if (!baseText.trim()) {
        baseText = "Please analyze the attached file(s).";
      }

      if (imageFiles.length > 0) {
        formatted[lastUserIdx].content = [
          { type: "text", text: baseText },
          ...imageFiles.map((img) => ({
            type: "image_url",
            image_url: { url: img.dataUrl },
          })),
        ];
      } else {
        formatted[lastUserIdx].content = baseText;
      }
    }

    const activeModel = imageFiles.length > 0
      ? OPENROUTER_VISION_MODELS[mode]
      : OPENROUTER_CHAT_MODELS[mode];

    let searchContext = "";
    const lastUser = [...recent].reverse().find((m) => m.role === "user");
    // Skip web search when images are attached — the model should focus on the image.
    if (lastUser && imageFiles.length === 0) {
      const shouldSearch = webSearch || needsWebSearch(lastUser.content);
      if (shouldSearch) searchContext = await performWebSearch(lastUser.content, options.onWebSearchProgress);
    }

    const systemMessage = `You are Neurix, a friendly and helpful AI assistant.

IMPORTANT RESPONSE GUIDELINES:
- NEVER use markdown tables. Format information as clean bullet points or numbered lists instead.
- Write naturally and conversationally, like a knowledgeable friend explaining things.
- Be concise but thorough. Break down complex topics into easy-to-understand sections.
- Use headers (##) to organize longer responses, but keep them simple.
- Use **bold** for emphasis on key terms or important points.
- Detect the user's language and ALWAYS respond in the SAME language. If they write in Hungarian, respond in Hungarian. If English, respond in English. Etc.
- If greeted, respond warmly and ask how you can help.
- For news or current events, present information as a flowing narrative with bullet points, NOT tables.
- Keep your tone helpful, engaging, and approachable.
- When live web sources are provided, cite the relevant claims with the supplied markdown links. Never invent links or hide the sources.
- Never claim to know the current time, weather, prices, news, scores, or other changing facts from memory. If the user asks for changing/current information, use the live web sources when available; if search failed, clearly say that live search is unavailable instead of guessing.
- For time questions, distinguish the current time from the date and do not invent a timezone or clock time. Ask for the city/timezone if it is not clear.
${mode === "fast" ? "- Speed mode: answer directly and concisely so the response arrives as quickly as possible. Avoid unnecessary reasoning or repetition.\n" : ""}
${mode === "ultra" ? "- Ultra mode: provide exactly one deeply considered final answer. Think through assumptions, check important details, and give a calm, complete response. Do not provide multiple drafts, second opinions, or mention internal model instructions.\n" : ""}
\nFILE OUTPUT:
- When the user asks you to create, write, generate, export, save, or produce a file, output the COMPLETE file in a fenced code block whose info string is exactly file:<filename>.
- Choose a clear filename with the requested extension, such as notes.txt, index.html, styles.css, or data.json.
- Put the complete final file contents inside the block. A short explanation may go outside it.
${
  textFiles.length > 0
    ? `\nFILE EDITING:
- The user attached ${textFiles.length === 1 ? "a file" : "files"}: ${textFiles.map((f) => f.name).join(", ")}.
- If the user asks you to edit, rewrite, fix, refactor, translate, or otherwise modify an attached file, output the COMPLETE updated file — not just the changed lines.
- Wrap each edited file in a fenced code block whose info string is exactly \`file:<the original filename>\`. Example:\n\`\`\`file:${textFiles[0].name}\n<full updated contents here>\n\`\`\`
- You may add a short explanation before or after the block, but the block itself must contain the entire final file.`
    : ""
}${searchContext ? `\nHere is relevant information from a web search:\n${searchContext}\nUse this information to provide an accurate and up-to-date response. Remember: NO TABLES, use bullet points and natural language instead.` : ""}`;

    if (mode === "ultra") {
      const ultraMessages = formatted as unknown[];
      if (options.ultraCompare) {
        const comparisonPrompt =
          systemMessage +
          "\n\nULTRA FEEDBACK MODE: Solve the user's request independently as a complete final answer. Do not mention this comparison instruction, do not refer to another model, and do not include drafts or meta-commentary.";
        const [qualityAnswer, speedAnswer] = await Promise.all([
          collectOpenRouterAnswer(QUALITY_MODEL, [
            { role: "system", content: comparisonPrompt },
            ...ultraMessages,
          ]),
          collectOpenRouterAnswer(SPEED_MODEL, [
            { role: "system", content: comparisonPrompt },
            ...ultraMessages,
          ]),
        ]);
        options.onUltraComparison?.({
          quality: qualityAnswer || "The Quality AI did not return a response.",
          speed: speedAnswer || "The Speed AI did not return a response.",
        });
        onDone();
        return;
      }
      const ultraPrompt =
        systemMessage +
        "\n\nULTRA ROLE: Return one polished final answer only. Work through the request carefully before responding, prioritize accuracy over speed, and keep the result useful and natural. Do not show drafts, alternatives, or a second opinion.";

      const answer = await collectOpenRouterAnswer(QUALITY_MODEL, [
        { role: "system", content: ultraPrompt },
        ...ultraMessages,
      ]);
      onChunk(answer || "The Ultra model did not return a response.");
      onDone();
      return;
    }

    const requestBody: Record<string, unknown> = {
      model: activeModel,
      messages: [{ role: "system", content: systemMessage }, ...formatted],
      stream: true,
      temperature: 0.5,
    };
    if (mode === "fast") {
      // Nemotron's free route rejects provider-specific reasoning options.
      // Keep the request to portable OpenAI-compatible fields only.
      requestBody.max_tokens = 1024;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401 || response.status === 403) {
        onError("OpenRouter authentication failed. Set a valid VITE_OPENROUTER_API_KEY in .env and restart the dev server.");
        return;
      }
      if (response.status === 429) {
        const currentMode = mode === "fast" ? "Speed" : "Quality";
        const otherMode = mode === "fast" ? "Quality" : "Speed";
        onError(
          `${currentMode} is currently rate-limited by OpenRouter or its provider. Please try again later, or try ${otherMode} mode.`
        );
        return;
      }
      if (response.status === 404) {
        onError("This OpenRouter model is currently unavailable. Please try the other chat mode.");
        return;
      }
      throw new Error(body || `OpenRouter request failed (${response.status}).`);
    }
    if (!response.body) throw new Error("OpenRouter returned an empty response.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const chunk = JSON.parse(line.slice(6));
        const content = chunk.choices?.[0]?.delta?.content;
        if (typeof content !== "string") continue;
        onChunk(content);
      }
      if (done) break;
    }

    onDone();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    if (/unauthorized|401|invalid api key|authentication failed/i.test(message)) {
      onError("OpenRouter authentication failed. Set a valid VITE_OPENROUTER_API_KEY in .env and restart the dev server.");
      return;
    }
    onError(message);
  }
}

// ============================================================================
// IMAGE SERVICE
// ============================================================================

const PIXAZO_API_URL = "https://gateway.pixazo.ai/flux-1-schnell/v1/getData";
const PIXAZO_API_KEY = import.meta.env.VITE_PIXAZO_API_KEY || "";
const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt";

function pollinationsImageUrl(prompt: string, width: number, height: number, seed: number): string {
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: "true",
  });
  return `${POLLINATIONS_IMAGE_URL}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

function dimensionsFor(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "16:9": return { width: 1024, height: 576 };
    case "9:16": return { width: 576, height: 1024 };
    case "4:3": return { width: 1024, height: 768 };
    case "3:4": return { width: 768, height: 1024 };
    case "1:1":
    default: return { width: 1024, height: 1024 };
  }
}

export async function generateImage(
  prompt: string,
  aspect: string = "1:1"
): Promise<{ image: string } | { error: string }> {
  try {
    const { width, height } = dimensionsFor(aspect);
    const seed = Math.floor(Math.random() * 1000000);

    if (PIXAZO_API_KEY) {
      const response = await fetch(PIXAZO_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
        },
        body: JSON.stringify({
          prompt,
          num_steps: 4,
          seed,
          width,
          height,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Normalize response shapes
        let imageResult: string | null = null;
        const asDataUrl = (s: string) =>
          s.startsWith("data:") || s.startsWith("http")
            ? s
            : `data:image/png;base64,${s}`;

        if (typeof data?.image === "string") {
          imageResult = asDataUrl(data.image);
        } else if (Array.isArray(data?.images) && data.images.length > 0) {
          const img = data.images[0];
          if (typeof img === "string") imageResult = asDataUrl(img);
          else if (img?.url) imageResult = img.url;
          else if (img?.base64) imageResult = `data:image/png;base64,${img.base64}`;
        } else if (typeof data?.url === "string") {
          imageResult = data.url;
        } else if (data?.data) {
          const d = Array.isArray(data.data) ? data.data[0] : data.data;
          if (typeof d === "string") imageResult = asDataUrl(d);
          else if (d?.url) imageResult = d.url;
          else if (d?.b64_json) imageResult = `data:image/png;base64,${d.b64_json}`;
        } else if (data?.output) {
          const o = Array.isArray(data.output) ? data.output[0] : data.output;
          if (typeof o === "string") imageResult = asDataUrl(o);
          else if (o?.url) imageResult = o.url;
        }

        if (imageResult) {
          return { image: imageResult };
        }
      }
    }

    return { image: pollinationsImageUrl(prompt, width, height, seed) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image generation failed" };
  }
}
