import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Clock,
  MessageSquare,
  Image as ImageIcon,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  useHistory,
  chatHistory,
  imageHistory,
  type HistoryKind,
  type ChatSession,
  type ImageSession,
} from "@/lib/history";

const MIN_W = 320;
const SNAP_THRESHOLD = 80;
const HANDLE_RESERVE = 64; // always leave room so the handle stays clickable
const getMaxW = () =>
  typeof window !== "undefined"
    ? Math.max(MIN_W, window.innerWidth - HANDLE_RESERVE)
    : 1920;

type Tab = HistoryKind;

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "AI Chat", icon: MessageSquare },
  { id: "image", label: "Image Gen", icon: ImageIcon },
];

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function HistoryDrawer({
  kind,
  className,
}: {
  kind: HistoryKind;
  className?: string;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(kind);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(560);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const chats = useHistory("chat");
  const images = useHistory("image");

  const activeItems = useMemo(() => {
    if (tab === "chat") return chats;
    return images;
  }, [tab, chats, images]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = open ? width : 0;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [open, width]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = startX.current - e.clientX;
      const newW = Math.max(0, Math.min(getMaxW(), startW.current + dx));
      if (newW < SNAP_THRESHOLD) {
        setOpen(false);
        setWidth(MIN_W);
      } else {
        setOpen(true);
        setWidth(Math.max(MIN_W, newW));
      }
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Keep hook order stable while the saved sign-in session is restored.
  if (!user) {
    return null;
  }

  const handleOpen = (id: string, target: Tab) => {
    const route = target === "chat" ? "/chat" : "/image";
    navigate({ to: route, search: { session: id } });
    setOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (tab === "chat") chatHistory.remove(id);
    else imageHistory.remove(id);
  };

  const handleClearAll = () => {
    if (!confirm("Delete all history for this AI? This cannot be undone.")) return;
    if (tab === "chat") chatHistory.clear();
    else imageHistory.clear();
  };

  return (
    <div
      className={cn(
        "hidden lg:flex absolute right-0 top-0 bottom-0 z-30 flex-row",
        className
      )}
    >
      {/* Handle tab */}
      <div
        onPointerDown={onPointerDown}
        onClick={() => {
          if (!dragging.current) {
            if (open) {
              setOpen(false);
            } else {
              setOpen(true);
              setWidth(getMaxW());
            }
          }
        }}
        className="relative z-40 flex items-center cursor-ew-resize select-none group"
      >
        <div className="flex flex-col items-center gap-1.5 px-1 py-4 rounded-l-md border border-r-0 border-border bg-background hover:bg-cream transition-colors shadow-sm">
          {open ? (
            <ChevronRight className="size-3 text-ink-soft group-hover:text-foreground" />
          ) : (
            <ChevronLeft className="size-3 text-ink-soft group-hover:text-foreground" />
          )}
          <span
            className="text-[9px] font-mono uppercase tracking-[0.2em] text-ink-soft group-hover:text-foreground"
            style={{ writingMode: "vertical-rl" }}
          >
            History
          </span>
          <Clock className="size-3 text-ink-soft group-hover:text-foreground" />
        </div>
      </div>

      {/* Panel */}
      <div
        className="border-l border-border bg-background overflow-hidden transition-[width] duration-300 ease-out"
        style={{ width: open ? width : 0 }}
      >
        <div className="flex flex-col h-full" style={{ width }}>
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 sm:px-8 lg:px-10 pt-8 sm:pt-12 pb-8">
              {/* Heading */}
              <div className="mb-8 sm:mb-12">
                <div className="tf-eyebrow !tracking-[0.18em] mb-3 sm:mb-4 inline-flex items-center gap-2">
                  <Clock className="size-3.5" />
                  <span>History · Saved on this device</span>
                </div>
                <h1 className="tf-display text-foreground text-[clamp(2.5rem,8vw,7rem)] leading-[0.95]">
                  <span className="block">Your</span>
                  <span className="block">
                    past<span className="text-highlight">.</span>
                  </span>
                </h1>
                <p className="mt-4 sm:mt-6 max-w-xl text-base sm:text-lg text-ink-soft">
                  Every chat and generated image is kept right here, in your
                  browser, ready when you return.
                </p>
              </div>

              {/* Tabs */}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-6 sm:mb-8 pb-4 border-b border-border">
                <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-background/60">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 sm:px-4 h-8 sm:h-9 rounded-full text-xs sm:text-sm font-medium transition-all",
                          active
                            ? "bg-foreground text-background shadow-sm"
                            : "text-ink-soft hover:text-foreground"
                        )}
                      >
                        <Icon className="size-3.5 sm:size-4" />
                        <span>{t.label}</span>
                        <span
                          className={cn(
                            "ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-mono",
                            active
                              ? "bg-background/20 text-background"
                              : "bg-cream text-ink-soft"
                          )}
                        >
                          {t.id === "chat" ? chats.length : images.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="inline-flex items-center gap-1.5 px-3 h-8 sm:h-9 rounded-full border border-border hover:border-foreground text-ink-soft hover:text-foreground transition-colors text-xs"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Clear all</span>
                  </button>
                )}
              </div>

              {/* Items */}
              {activeItems.length === 0 ? (
                <EmptyState tab={tab} onGo={(to) => navigate({ to })} />
              ) : (
                <ul
                  className={cn(
                    "grid gap-4 sm:gap-5",
                    width > 900
                      ? "grid-cols-2 xl:grid-cols-3"
                      : width > 600
                        ? "grid-cols-2"
                        : "grid-cols-1"
                  )}
                >
                  {tab === "chat" &&
                    (activeItems as ChatSession[]).map((s, i) => (
                      <HistoryCard
                        key={s.id}
                        index={i}
                        title={s.title}
                        meta={`${s.messages.length} ${s.messages.length === 1 ? "message" : "messages"} · ${formatRelative(s.updatedAt)}`}
                        preview={
                          s.messages
                            .slice(-2)
                            .map(
                              (m) =>
                                `${m.role === "user" ? "You" : "Neurix"}: ${m.content.slice(0, 120)}`
                            )
                            .join("\n") || "Empty conversation"
                        }
                        onOpen={() => handleOpen(s.id, "chat")}
                        onDelete={(e) => handleDelete(e, s.id)}
                        icon={MessageSquare}
                      />
                    ))}

                  {tab === "image" &&
                    (activeItems as ImageSession[]).map((s, i) => (
                      <ImageHistoryCard
                        key={s.id}
                        index={i}
                        session={s}
                        onOpen={() => handleOpen(s.id, "image")}
                        onDelete={(e) => handleDelete(e, s.id)}
                      />
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  tab,
  onGo,
}: {
  tab: Tab;
  onGo: (to: "/chat" | "/image") => void;
}) {
  const cfg = {
    chat: {
      icon: MessageSquare,
      title: "No conversations yet",
      cta: "Start chatting",
      to: "/chat" as const,
    },
    image: {
      icon: ImageIcon,
      title: "No images yet",
      cta: "Generate an image",
      to: "/image" as const,
    },
  }[tab];
  const Icon = cfg.icon;
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 sm:py-24">
      <div className="size-16 rounded-full border border-border bg-background/60 backdrop-blur flex items-center justify-center mb-5">
        <Icon className="size-7 text-ink-soft" />
      </div>
      <h3 className="tf-display text-2xl sm:text-3xl mb-2">{cfg.title}</h3>
      <p className="text-sm text-ink-soft max-w-sm mb-6">
        Anything you create on this device shows up here automatically.
      </p>
      <button
        type="button"
        onClick={() => onGo(cfg.to)}
        className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-foreground text-background text-sm font-medium tf-cta"
      >
        <Sparkles className="size-4" /> {cfg.cta}
      </button>
    </div>
  );
}

function HistoryCard({
  index,
  title,
  meta,
  preview,
  onOpen,
  onDelete,
  icon: Icon,
}: {
  index: number;
  title: string;
  meta: string;
  preview: string;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  icon: typeof MessageSquare;
}) {
  return (
    <li
      className="group relative"
      style={{ animationDelay: `${Math.min(index * 60, 480)}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "relative w-full text-left rounded-2xl border border-border bg-background/70 backdrop-blur-xl overflow-hidden",
          "p-5 sm:p-6 transition-all duration-300",
          "hover:border-foreground hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-25px_oklch(0_0_0/0.35)]"
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <span className="inline-flex items-center justify-center size-9 rounded-full border border-border shrink-0 transition-colors group-hover:bg-foreground group-hover:text-background">
            <Icon className="size-4" />
          </span>
          <ArrowUpRight className="size-5 text-ink-soft group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </div>
        <h3 className="tf-display text-lg sm:text-xl leading-tight mb-2 line-clamp-2">
          {title}
        </h3>
        <p className="tf-eyebrow !tracking-[0.16em] !text-ink-soft mb-3">{meta}</p>
        <p
          className="text-sm text-foreground/75 line-clamp-3 whitespace-pre-line"
        >
          {preview}
        </p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-3 right-3 size-7 rounded-full border border-border bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 hover:bg-foreground hover:text-background hover:border-foreground transition-all flex items-center justify-center"
        aria-label="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function ImageHistoryCard({
  index,
  session,
  onOpen,
  onDelete,
}: {
  index: number;
  session: ImageSession;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const thumbs = session.images.slice(0, 4);
  return (
    <li
      className="group relative"
      style={{ animationDelay: `${Math.min(index * 60, 480)}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left rounded-2xl border border-border bg-background/70 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:border-foreground hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-25px_oklch(0_0_0/0.35)]"
      >
        <div className="grid grid-cols-2 gap-px bg-border aspect-[4/3]">
          {thumbs.length > 0 ? (
            thumbs.map((img, i) => (
              <div
                key={img.id}
                className={cn(
                  "relative bg-cream overflow-hidden",
                  thumbs.length === 1 && "col-span-2 row-span-2",
                  thumbs.length === 2 && "col-span-1 row-span-2",
                  thumbs.length === 3 && i === 0 && "col-span-2"
                )}
              >
                <img
                  src={img.image}
                  alt={img.prompt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            ))
          ) : (
            <div className="col-span-2 row-span-2 flex items-center justify-center bg-cream text-ink-soft">
              <ImageIcon className="size-8" />
            </div>
          )}
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="tf-display text-lg sm:text-xl leading-tight line-clamp-2 flex-1">
              {session.title}
            </h3>
            <ArrowUpRight className="size-5 text-ink-soft group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </div>
          <p className="tf-eyebrow !tracking-[0.16em] !text-ink-soft">
            {session.images.length}{" "}
            {session.images.length === 1 ? "image" : "images"} ·{" "}
            {formatRelative(session.updatedAt)}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-3 right-3 size-7 rounded-full border border-border bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 hover:bg-foreground hover:text-background hover:border-foreground transition-all flex items-center justify-center"
        aria-label="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
