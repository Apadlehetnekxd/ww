import { createId } from "@/lib/create-id";
import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteHeader } from "@/components/site-header";
import { ChatModeToggle } from "@/components/chat-mode-toggle";
import { HistoryDrawer } from "@/components/history-drawer";
import { WelcomeHero } from "@/components/welcome-hero";
import {
  Send,
  Sparkles,
  Loader2,
  ArrowDown,
  Trash2,
  Lock,
  ArrowRight,
  X,
  FileText,
  Download,
  Copy,
  Check,
  Pencil,
  Plus,
  Mic,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Zap,
  Eye,
} from "lucide-react";
import { chatHistory, type ChatMsg, type ChatAttachment } from "@/lib/history";
import {
  streamChat,
  type ChatModelMode,
  type UltraComparison,
  ULTRA_COOLDOWN_MS,
  ULTRA_MESSAGES_PER_COOLDOWN,
} from "@/lib/ai-services";
import { GUEST_CHAT_LIMIT, useGuestChatQuota } from "@/lib/guest-chat-quota";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { session?: string } => ({
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Neurix AI Chat — Free conversational AI" },
      {
        name: "description",
        content:
          "Have natural conversations with Neurix AI. Free, fast, and unlimited — free to use.",
      },
    ],
  }),
});

type UltraComparisonState = UltraComparison & { selected?: "quality" | "speed" };
type Msg = ChatMsg & { ultraComparison?: UltraComparisonState };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_BYTES = 512 * 1024; // 512KB

/** Read a File into a ChatAttachment (data URL for images, text for everything else). */
function readAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith("image/");
    const base = {
      id: createId(),
      name: file.name,
      mime: file.type || (isImage ? "image/*" : "text/plain"),
      size: file.size,
    };
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`"${file.name}" is too large (max 5MB).`));
      return;
    }
    if (!isImage && file.size > MAX_TEXT_BYTES) {
      reject(new Error(`"${file.name}" is too large (max 512KB).`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    if (isImage) {
      reader.onload = () =>
        resolve({ ...base, kind: "image", dataUrl: reader.result as string });
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => resolve({ ...base, kind: "text", text: reader.result as string });
      reader.readAsText(file);
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentTray({
  items,
  onRemove,
}: {
  items: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {items.map((a) => (
        <div
          key={a.id}
          className="tf-bubble-ai group relative flex items-center gap-2 rounded-xl border border-border bg-cream/50 pl-1.5 pr-2 py-1.5 max-w-[220px]"
        >
          {a.kind === "image" && a.dataUrl ? (
            <img
              src={a.dataUrl || "/placeholder.svg"}
              alt={a.name}
              className="size-9 rounded-lg object-cover shrink-0"
            />
          ) : (
            <span className="size-9 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
              <FileText className="size-4" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-xs font-medium truncate text-foreground">{a.name}</span>
            <span className="block text-[10px] text-ink-soft">{formatBytes(a.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            className="ml-0.5 size-5 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label={`Remove ${a.name}`}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Read-only attachment previews rendered inside a sent user message. */
function SentAttachments({ items, compact = false }: { items: ChatAttachment[]; compact?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={"flex flex-wrap gap-2 " + (compact ? "mt-2" : "mt-4")}>
      {items.map((a) =>
        a.kind === "image" && a.dataUrl ? (
          <img
            key={a.id}
            src={a.dataUrl || "/placeholder.svg"}
            alt={a.name}
            className={
              "rounded-xl object-cover border border-border " +
              (compact ? "max-h-40" : "max-h-56")
            }
          />
        ) : (
          <div
            key={a.id}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5"
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="text-xs font-medium truncate max-w-[180px]">{a.name}</span>
          </div>
        )
      )}
    </div>
  );
}

/** Editable + downloadable card for a file the assistant rewrote. */
function FileBlock({ filename, content }: { filename: string; content: string }) {
  const [value, setValue] = useState(content);
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const editedRef = useRef(false);

  // While the reply streams in, keep syncing until the user starts editing.
  useEffect(() => {
    if (!editedRef.current) setValue(content);
  }, [content]);

  const download = () => {
    const extension = filename.toLowerCase().split(".").pop();
    const mime =
      extension === "html" || extension === "htm"
        ? "text/html"
        : extension === "css"
          ? "text/css"
          : extension === "json"
            ? "application/json"
            : extension === "xml" || extension === "svg"
              ? "application/xml"
              : "text/plain";
    const blob = new Blob([value], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "edited.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const lineCount = value.split("\n").length;
  const isHtmlPreview = /\.(html?|xhtml|svg)$/i.test(filename);
  const isMarkdownPreview = /\.(md|markdown|mdx)$/i.test(filename);
  const preview = isHtmlPreview ? (
    <iframe
      title={`Preview of ${filename}`}
      sandbox=""
      srcDoc={value}
      className="tf-file-preview-frame"
    />
  ) : isMarkdownPreview ? (
    <div className="tf-file-preview-markdown">
      <MarkdownReply text={value} compact />
    </div>
  ) : (
    <pre className="tf-file-preview-code">
      <code>{value}</code>
    </pre>
  );

  return (
    <div className="tf-bubble-ai not-prose my-4 rounded-2xl border border-foreground bg-background overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-cream/40">
        <span className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 shrink-0" />
          <span className="text-sm font-medium truncate text-foreground">{filename}</span>
          <span className="hidden sm:inline text-[11px] text-ink-soft shrink-0">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPreviewing((current) => !current)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border text-foreground hover:bg-foreground hover:text-background transition-colors text-xs font-medium"
            aria-label={previewing ? "Edit file" : "Preview file"}
          >
            {previewing ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            <span className="hidden sm:inline">{previewing ? "Edit" : "Preview"}</span>
          </button>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border text-foreground hover:bg-foreground hover:text-background transition-colors text-xs font-medium"
            aria-label="Copy file contents"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity text-xs font-medium"
            aria-label="Download file"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </span>
      </div>
      {previewing ? (
        <div className="tf-file-preview" aria-label={`Preview of ${filename}`}>
          {preview}
        </div>
      ) : (
        <div className="relative">
          <span className="pointer-events-none absolute top-2 right-3 z-10 inline-flex items-center gap-1 text-[10px] text-ink-soft">
            <Pencil className="size-3" /> editable
          </span>
          <textarea
            value={value}
            spellCheck={false}
            onChange={(e) => {
              editedRef.current = true;
              setValue(e.target.value);
            }}
            className="w-full resize-y min-h-[8rem] max-h-[28rem] bg-background text-foreground font-mono text-[13px] leading-relaxed p-3 pr-16 focus:outline-none focus:ring-1 focus:ring-highlight/60"
          />
        </div>
      )}
    </div>
  );
}

/** Editorial markdown renderer for assistant replies. */
function MarkdownReply({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={
        "tf-prose text-foreground whitespace-normal break-words max-w-none" +
        (compact ? " tf-prose-compact" : "")
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // Detect our special ```file:<name> blocks and render an editor card.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const child: any = Array.isArray(children) ? children[0] : children;
            const cls: string = child?.props?.className || "";
            const match = /language-file:(.+)/.exec(cls);
            if (match) {
              const filename = match[1].trim();
              const raw = child?.props?.children;
              const content = String(Array.isArray(raw) ? raw.join("") : raw ?? "").replace(
                /\n$/,
                ""
              );
              return <FileBlock filename={filename} content={content} />;
            }
            return <pre className="tf-markdown-code-block">{children}</pre>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function UltraComparisonCard({
  comparison,
  onSelect,
}: {
  comparison: UltraComparisonState;
  onSelect: (choice: "quality" | "speed") => void;
}) {
  const renderCandidate = (
    key: "quality" | "speed",
    label: string,
    text: string,
  ) => {
    const selected = comparison.selected === key;
    return (
      <div className={"tf-ultra-comparison-card" + (selected ? " is-selected" : "")}>
        <div className="tf-ultra-comparison-label">
          <span>{label}</span>
          <span className="tf-ultra-comparison-dot" aria-hidden="true" />
        </div>
        <MarkdownReply text={text} compact />
        <button
          type="button"
          className="tf-ultra-comparison-choice"
          onClick={() => onSelect(key)}
          disabled={Boolean(comparison.selected)}
          aria-pressed={selected}
        >
          {selected ? "Selected" : "Choose this answer"}
        </button>
      </div>
    );
  };

  return (
    <section className="tf-ultra-comparison" aria-label="Ultra answer comparison">
      <div className="tf-ultra-comparison-heading">
        <span className="tf-ultra-comparison-eyebrow">Ultra feedback</span>
        <strong>Which answer is better?</strong>
      </div>
      <div className="tf-ultra-comparison-grid">
        {renderCandidate("quality", "Quality AI", comparison.quality)}
        {renderCandidate("speed", "Speed AI", comparison.speed)}
      </div>
      <p className="tf-ultra-comparison-footer">
        {comparison.selected
          ? "Thanks — your choice was saved on this device."
          : "Choose the response that helped you most."}
      </p>
    </section>
  );
}

function ChatPage() {
  const search = useSearch({ from: "/chat" });
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, loading: authLoading } = useAuth();
  const { consumeTurn, remaining, limitReached: guestLimitReached } = useGuestChatQuota();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => createId());
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [modelMode, setModelMode] = useState<ChatModelMode>(() => {
    if (typeof window === "undefined") return "quality";
    const stored = window.localStorage.getItem("neurix-chat-model-mode");
    return stored === "fast" || stored === "ultra" ? stored : "quality";
  });
  const [ultraCooldownUntil, setUltraCooldownUntil] = useState(0);
  const [ultraCooldownNow, setUltraCooldownNow] = useState(() => Date.now());
  const [ultraMessagesSinceCooldown, setUltraMessagesSinceCooldown] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const dictBaseRef = useRef("");

  useEffect(() => {
    const raw = window.sessionStorage.getItem("neurix-vision-chat-handoff");
    if (!raw) return;
    window.sessionStorage.removeItem("neurix-vision-chat-handoff");
    try {
      const handoff = JSON.parse(raw) as { image?: string; label?: string; question?: string };
      if (!handoff.image) return;
      setInput(handoff.question || `Tell me about this ${handoff.label || "image"}.`);
      setAttachments([{ id: createId(), name: `vision-${Date.now()}.jpg`, mime: "image/jpeg", size: 0, kind: "image", dataUrl: handoff.image }]);
    } catch {
      setError("Could not open the Vision image in chat.");
    }
  }, []);

  // Voice-to-text dictation via the Web Speech API. Appends recognised speech
  // to whatever is already in the composer.
  const toggleDictation = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    // Already listening → stop.
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (!window.isSecureContext) {
      setError("Microphone access is blocked. Allow the microphone in your browser to dictate.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    dictBaseRef.current = input.trim() ? input.trim() + " " : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(dictBaseRef.current + transcript);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access is blocked. Allow it in your browser to dictate.",
        "service-not-allowed": "Microphone access is blocked. Allow it in your browser to dictate.",
        "no-speech": "Didn't catch that — try speaking again.",
        network: "Voice input needs a network connection and couldn't reach the service.",
      };
      if (e?.error && e.error !== "aborted") {
        setError(messages[e.error] ?? `Voice input error: ${e.error}`);
      }
      recognitionRef.current = null;
      setListening(false);
    };
    rec.onstart = () => {
      setListening(true);
      setError(null);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      setError("Couldn't start voice input. Please try again.");
      setListening(false);
    }
  }, [input]);

  // Stop any in-flight recognition when the page unmounts.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const userTurns = messages.filter((m) => m.role === "user").length;
  const limitReached = !user && guestLimitReached;
  const ultraCooldownRemainingMs = Math.max(0, ultraCooldownUntil - ultraCooldownNow);

  const requireUltraAuth = useCallback(() => {
    setError("Ultra mode is available after signing in.");
    navigate({ to: "/auth" });
  }, [navigate]);

  // Hydrate from saved history when ?session=… is in the URL
  useEffect(() => {
    if (!search.session) return;
    const found = chatHistory.list().find((s) => s.id === search.session);
    if (found) {
      setSessionId(found.id);
      setMessages(found.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.session]);

  // Persist messages to localStorage. Strip large text-file bodies to protect
  // the storage quota; keep image previews and file metadata.
  useEffect(() => {
    if (messages.length === 0) return;
    const t = window.setTimeout(() => {
      const persistable = messages.map((m) =>
        m.attachments
          ? {
              ...m,
              attachments: m.attachments.map((a) =>
                a.kind === "text" ? { ...a, text: undefined } : a
              ),
            }
          : m
      );
      chatHistory.upsert(chatHistory.fromMessages(sessionId, persistable));
    }, 250);
    return () => window.clearTimeout(t);
  }, [messages, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    window.localStorage.setItem("neurix-chat-model-mode", modelMode);
  }, [modelMode]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setUltraCooldownUntil(0);
      setUltraMessagesSinceCooldown(0);
      if (modelMode === "ultra") setModelMode("quality");
      return;
    }
    const stored = Number.parseInt(
      window.localStorage.getItem("neurix-ultra-cooldown:" + user.id) ?? "0",
      10
    );
    const messagesStored = Number.parseInt(
      window.localStorage.getItem("neurix-ultra-messages:" + user.id) ?? "0",
      10
    );
    const now = Date.now();
    const cooldownActive = Number.isFinite(stored) && stored > now;
    setUltraCooldownNow(now);
    setUltraCooldownUntil(cooldownActive ? stored : 0);
    setUltraMessagesSinceCooldown(
      cooldownActive && Number.isFinite(messagesStored)
        ? Math.min(ULTRA_MESSAGES_PER_COOLDOWN, Math.max(0, messagesStored))
        : Number.isFinite(messagesStored)
          ? Math.min(ULTRA_MESSAGES_PER_COOLDOWN - 1, Math.max(0, messagesStored))
        : 0
    );
  }, [authLoading, modelMode, user]);

  useEffect(() => {
    if (!ultraCooldownUntil) return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setUltraCooldownNow(current);
      if (current >= ultraCooldownUntil) {
        setUltraCooldownUntil(0);
        setUltraMessagesSinceCooldown(0);
        if (user) window.localStorage.removeItem("neurix-ultra-cooldown:" + user.id);
        if (user) window.localStorage.removeItem("neurix-ultra-messages:" + user.id);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [ultraCooldownUntil, user]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJump(dist > 200);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const send = useCallback(
    async (text: string, atts: ChatAttachment[] = []) => {
      if ((!text.trim() && atts.length === 0) || isLoading) return;
      // Enforce free-tier limit for guests
      if (!user && guestLimitReached) {
        return;
      }
      if (modelMode === "ultra") {
        if (!user) {
          requireUltraAuth();
          return;
        }
        const currentTime = Date.now();
        if (ultraCooldownUntil > currentTime) {
          const cooldownMinutes = Math.ceil((ultraCooldownUntil - currentTime) / 60000);
          setError(
            "Ultra is on cooldown. Try again in " +
              cooldownMinutes +
              (cooldownMinutes === 1 ? " minute." : " minutes.")
          );
          return;
        }
      }
      setError(null);
      const userMsg: Msg = {
        id: createId(),
        role: "user",
        content: text,
        attachments: atts.length ? atts : undefined,
      };
      const assistantId = createId();
      setMessages((p) => [...p, userMsg, { id: assistantId, role: "assistant", content: "" }]);
      setIsLoading(true);

      if (!user) {
        consumeTurn();
      }

      let full = "";
      const shouldCompareUltra =
        modelMode === "ultra" &&
        (ultraMessagesSinceCooldown + 1) % ULTRA_MESSAGES_PER_COOLDOWN === 3;
      
      await streamChat(
        [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        false,
        (chunk) => {
          full += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m))
          );
        },
        () => {
          if (modelMode === "ultra" && user) {
            const nextMessageCount = ultraMessagesSinceCooldown + 1;
            setUltraMessagesSinceCooldown(nextMessageCount);
            window.localStorage.setItem(
              "neurix-ultra-messages:" + user.id,
              String(nextMessageCount)
            );
            if (nextMessageCount >= ULTRA_MESSAGES_PER_COOLDOWN) {
              const nextCooldownUntil = Date.now() + ULTRA_COOLDOWN_MS;
              setUltraCooldownUntil(nextCooldownUntil);
              setUltraCooldownNow(Date.now());
              window.localStorage.setItem(
                "neurix-ultra-cooldown:" + user.id,
                String(nextCooldownUntil)
              );
            }
          }
          setIsLoading(false);
        },
        (error) => {
          setError(error);
          setMessages((p) => p.filter((m) => m.id !== assistantId || m.content));
          setIsLoading(false);
        },
        atts,
        modelMode,
        {
          ultraCompare: shouldCompareUltra,
          onUltraComparison: (comparison) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, ultraComparison: comparison } : m
              )
            );
          },
        }
      );
    },
    [
      consumeTurn,
      guestLimitReached,
      isLoading,
      messages,
      modelMode,
      requireUltraAuth,
      ultraCooldownUntil,
      ultraMessagesSinceCooldown,
      user,
    ]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    send(input, attachments);
    setInput("");
    setAttachments([]);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;
    setError(null);
    const results = await Promise.allSettled(files.map(readAttachment));
    const ok: ChatAttachment[] = [];
    let firstError: string | null = null;
    for (const r of results) {
      if (r.status === "fulfilled") ok.push(r.value);
      else if (!firstError) firstError = r.reason?.message ?? "Could not read a file.";
    }
    if (ok.length) setAttachments((prev) => [...prev, ...ok]);
    if (firstError) setError(firstError);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  };

  const hasMessages = messages.length > 0;

  // First name for the personalised welcome greeting.
  const displayName = (() => {
    if (!user) return null;
    const raw =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      user.email?.split("@")[0] ??
      null;
    if (!raw) return null;
    return raw.trim().split(/\s+/)[0];
  })();

  return (
    <div className="tf-chat-page h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col relative">
      {/* (No ambient orbs — clean canvas) */}
      <SiteHeader />

      <main
        className={
          "relative flex-1 flex flex-col min-h-0" + (!hasMessages ? " justify-center" : "")
        }
      >
        {/* ============================ MOBILE EMPTY STATE ============================ */}
        {!hasMessages && isMobile ? (
          <div className="relative flex flex-col justify-center items-center px-5 py-10">
            <WelcomeHero name={displayName} />
          </div>
        ) : !hasMessages ? (
          /* ============================ DESKTOP EMPTY STATE ============================ */
          <div className="relative flex flex-col items-center justify-center px-6 pt-16 pb-6">
            <WelcomeHero name={displayName} />
          </div>
        ) : isMobile ? (
          /* ============================ MOBILE CONVERSATION ============================ */
          <div ref={scrollRef} className="tf-chat-enter flex-1 overflow-y-auto relative">
            {/* Compact sticky toolbar */}
            <div className="tf-drop-in sticky top-0 z-20 flex justify-end px-4 py-2 bg-background/95">
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  setSessionId(createId());
                  navigate({ to: "/chat", search: {} });
                }}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-ink-soft hover:bg-cream hover:text-foreground transition-colors text-xs"
                aria-label="New chat"
              >
                <Plus className="size-3.5" />
                <span>New chat</span>
              </button>
            </div>

            <div className="px-5 py-5 space-y-7">
              {messages.map((m, idx) => {
                const isLast = idx === messages.length - 1;
                return m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div aria-label="Your message" className="tf-bubble-user max-w-[85%] rounded-2xl bg-cream px-4 py-2.5 text-[15px] leading-relaxed break-words">
                      <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-soft">You</p>
                      {m.content && <span className="whitespace-pre-wrap">{m.content}</span>}
                      {m.attachments && <SentAttachments items={m.attachments} compact />}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} aria-label="Assistant reply" className="flex flex-col items-start">
                    {m.ultraComparison ? (
                      <UltraComparisonCard
                        comparison={m.ultraComparison}
                        onSelect={(choice) =>
                          setMessages((prev) =>
                            prev.map((message) =>
                              message.id === m.id && message.ultraComparison
                                ? {
                                    ...message,
                                    ultraComparison: { ...message.ultraComparison, selected: choice },
                                  }
                                : message
                            )
                          )
                        }
                      />
                    ) : !m.content && isLoading ? (
                      <div role="status" className="tf-bubble-ai py-2 flex items-center gap-2.5 text-foreground">
                        <span className="flex items-center gap-1">
                          <span className="tf-think-dot" />
                          <span className="tf-think-dot" />
                          <span className="tf-think-dot" />
                        </span>
                        <span className="text-[14px] text-ink-soft">Thinking…</span>
                      </div>
                    ) : (
                      <div className="tf-bubble-ai w-full min-w-0 py-1">
                        <MarkdownReply text={m.content} compact />
                        {isLoading && isLast && (
                          <span className="tf-caret inline-block w-[0.5ch] h-[1em] align-[-0.15em] ml-0.5 bg-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {error && (
                <div role="alert" className="tf-bubble-ai text-sm rounded-xl border border-border text-ink-soft px-4 py-3">
                  {error}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>
        ) : (
          /* ============================ DESKTOP CONVERSATION ============================ */
          <div ref={scrollRef} className="tf-chat-enter flex-1 overflow-y-auto relative">
            {/* Sticky chat toolbar — clear / new chat */}
            <div className="sticky top-0 z-20 flex justify-end px-4 sm:px-6 lg:px-10 py-2 bg-background/95">
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  setSessionId(createId());
                  navigate({ to: "/chat", search: {} });
                }}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-ink-soft hover:bg-cream hover:text-foreground transition-colors text-xs"
                aria-label="New chat"
              >
                <Plus className="size-3.5" />
                <span>New chat</span>
              </button>
            </div>
            <div className="max-w-3xl mx-auto px-5 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-8">
              {messages.map((m, idx) =>
                m.role === "user" ? (
                  <article
                    key={m.id}
                    className="tf-bubble-user mx-auto w-full max-w-4xl text-left"
                    aria-label="Your message"
                  >
                    <p className="mb-2 text-xs font-medium tracking-wide text-ink-soft">You</p>
                    {m.content && (
                      <p className="tf-display text-2xl sm:text-3xl md:text-5xl text-foreground leading-[1.1] text-left whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                    )}
                    {m.attachments && <SentAttachments items={m.attachments} />}
                    <div className="mt-8 border-t border-border" aria-hidden="true" />
                  </article>
                ) : (
                  <article
                    key={m.id}
                    className="tf-bubble-ai min-w-0"
                    aria-label="Assistant reply"
                  >
                    {m.ultraComparison ? (
                      <UltraComparisonCard
                        comparison={m.ultraComparison}
                        onSelect={(choice) =>
                          setMessages((prev) =>
                            prev.map((message) =>
                              message.id === m.id && message.ultraComparison
                                ? {
                                    ...message,
                                    ultraComparison: { ...message.ultraComparison, selected: choice },
                                  }
                                : message
                            )
                          )
                        }
                      />
                    ) : !m.content && isLoading ? (
                      <div role="status" className="flex items-center gap-2.5 py-2 text-ink-soft">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="text-sm">Thinking…</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <MarkdownReply text={m.content} />
                        {isLoading && idx === messages.length - 1 && (
                          <span className="tf-caret inline-block w-[0.55ch] h-[1em] align-[-0.15em] ml-1 bg-foreground" />
                        )}
                      </div>
                    )}
                  </article>
                )
              )}
              {error && (
                <div role="alert" className="text-sm rounded-xl border border-border text-ink-soft px-5 py-4">
                  {error}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>
        )}

        {/* Jump-to-bottom */}
        {showJump && hasMessages && (
          <button
            onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="absolute right-4 bottom-24 sm:right-6 sm:bottom-32 size-10 sm:size-11 rounded-full border border-foreground bg-background tf-invert-hover flex items-center justify-center shadow-md"
            aria-label="Scroll to latest"
          >
            <ArrowDown className="size-4" />
          </button>
        )}

        {/* Composer */}
        <div
          key={hasMessages ? "docked" : "centered"}
          className={
            "relative pt-3 sm:pt-4" +
            (hasMessages
              ? " tf-composer-dock bg-gradient-to-t from-background via-background/95 to-background/0 backdrop-blur-xl"
              : "")
          }
        >
          {/* Free-tier counter for guests */}
          {!user && !limitReached && userTurns > 0 && (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 -mb-2">
              <div className="text-xs text-ink-soft py-1">
                {remaining} free {remaining === 1 ? "message" : "messages"} left
              </div>
            </div>
          )}

          {limitReached ? (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-5">
              <div className="rounded-2xl border border-foreground bg-cream/60 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex items-center gap-3 sm:flex-1">
                  <div className="size-11 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
                    <Lock className="size-5" />
                  </div>
                  <div>
                    <div className="tf-display text-lg sm:text-xl leading-tight">
                      You've used your {GUEST_CHAT_LIMIT} free messages
                    </div>
                    <p className="text-sm text-ink-soft mt-1">
                      Sign in (it's free) to keep chatting without limits.
                    </p>
                  </div>
                </div>
                <Link
                  to="/auth"
                  className="tf-cta inline-flex items-center justify-center gap-2 px-6 h-12 rounded-full bg-foreground text-background text-sm font-medium shrink-0"
                >
                  Sign in to continue
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          ) : isMobile ? (
            /* ============================ MOBILE COMPOSER ============================ */
            <form
              onSubmit={onSubmit}
              className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="px-1">
                <AttachmentTray items={attachments} onRemove={removeAttachment} />
              </div>
              <div className={"tf-composer-field " + (modelMode === "quality" ? "tf-composer-field-quality " : "") + "flex items-center gap-1 rounded-full border border-border bg-cream/60 pl-2 pr-1.5 py-1.5"}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full text-foreground/70 size-9 shrink-0 active:text-foreground transition-colors"
                  aria-label="Attach file"
                >
                  <Plus className="size-5" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  placeholder="Ask anything…"
                  className="flex-1 resize-none bg-transparent border-0 py-1.5 text-foreground placeholder:text-foreground/50 focus:outline-none text-base leading-relaxed max-h-32"
                />
                <ChatModeToggle
                  mode={modelMode}
                  onChange={setModelMode}
                  disabled={isLoading}
                  openDown={!hasMessages}
                  isAuthenticated={Boolean(user)}
                  onRequireAuth={requireUltraAuth}
                  ultraCooldownRemainingMs={ultraCooldownRemainingMs}
                  ultraMessagesUntilCooldown={Math.max(0, ULTRA_MESSAGES_PER_COOLDOWN - ultraMessagesSinceCooldown)}
                />
                <button
                  type="button"
                  onClick={toggleDictation}
                  disabled={isLoading}
                  className={
                    "inline-flex items-center justify-center rounded-full size-9 shrink-0 transition-colors " +
                    (listening
                      ? "bg-highlight text-foreground tf-live-dot"
                      : "text-foreground/70 active:text-foreground")
                  }
                  aria-label={listening ? "Stop dictation" : "Voice input"}
                  aria-pressed={listening}
                >
                  <Mic className="size-5" />
                </button>
                {(input.trim() || attachments.length > 0 || isLoading) && (
                  <button
                    type="submit"
                    disabled={(!input.trim() && attachments.length === 0) || isLoading}
                    className="inline-flex items-center justify-center rounded-full bg-foreground text-background size-9 shrink-0 disabled:opacity-30 transition-all duration-200 active:scale-90"
                    aria-label="Send"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4 transition-transform" />
                    )}
                  </button>
                )}
              </div>
            </form>
          ) : (
            /* ============================ DESKTOP COMPOSER ============================ */
            <form
              onSubmit={onSubmit}
              className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 py-3 sm:py-5"
            >
              <AttachmentTray items={attachments} onRemove={removeAttachment} />
              <div className={"tf-composer-field " + (modelMode === "quality" ? "tf-composer-field-quality " : "") + "flex items-center gap-2 rounded-full bg-cream/60 border border-border pl-3 pr-2.5 py-2"}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full text-foreground/70 hover:text-foreground size-9 shrink-0 transition-colors"
                  aria-label="Attach file"
                >
                  <Plus className="size-5" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  placeholder="Ask anything…"
                  className="flex-1 resize-none bg-transparent border-0 py-1.5 text-foreground placeholder:text-foreground/50 focus:outline-none text-base leading-relaxed max-h-40"
                />
                {hasMessages && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    className="hidden sm:inline-flex items-center justify-center rounded-full text-foreground/70 hover:text-foreground size-9 shrink-0 transition-colors"
                    aria-label="Clear conversation"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <ChatModeToggle
                  mode={modelMode}
                  onChange={setModelMode}
                  disabled={isLoading}
                  openDown={!hasMessages}
                  isAuthenticated={Boolean(user)}
                  onRequireAuth={requireUltraAuth}
                  ultraCooldownRemainingMs={ultraCooldownRemainingMs}
                  ultraMessagesUntilCooldown={Math.max(0, ULTRA_MESSAGES_PER_COOLDOWN - ultraMessagesSinceCooldown)}
                />
                <button
                  type="button"
                  onClick={toggleDictation}
                  disabled={isLoading}
                  className={
                    "inline-flex items-center justify-center rounded-full size-9 shrink-0 transition-colors " +
                    (listening
                      ? "bg-highlight text-foreground tf-live-dot"
                      : "text-foreground/70 hover:text-foreground")
                  }
                  aria-label={listening ? "Stop dictation" : "Voice input"}
                  aria-pressed={listening}
                >
                  <Mic className="size-5" />
                </button>
                {(input.trim() || attachments.length > 0 || isLoading) && (
                  <button
                    type="submit"
                    disabled={(!input.trim() && attachments.length === 0) || isLoading}
                    className="inline-flex items-center justify-center rounded-full bg-foreground text-background size-9 shrink-0 disabled:opacity-30 transition-all duration-200"
                    aria-label="Send"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Shared hidden file input for both composers */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.csv,.json,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.cs,.php,.html,.css,.scss,.xml,.yml,.yaml,.toml,.ini,.log,.sh"
            className="hidden"
            onChange={onPickFiles}
          />
        </div>
        <HistoryDrawer kind="chat" />
      </main>
    </div>
  );
}
