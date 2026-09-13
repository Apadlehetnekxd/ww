// Persistent chat and image history, stored in localStorage.
// Each tool gets its own key. Capped to keep storage small.

import { useEffect, useState, useCallback } from "react";
import { getHistoryOwnerId } from "./history-auth";

export type ChatAttachment = {
  id: string;
  name: string;
  mime: string;
  kind: "image" | "text";
  size: number;
  /** Data URL — kept for images (preview + model input). */
  dataUrl?: string;
  /** Extracted text — kept for text/code files (model input only). */
  text?: string;
};
export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};
export type ImageItem = { id: string; image: string; prompt: string; aspect: string };

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
};
export type ImageSession = {
  id: string;
  title: string;
  updatedAt: number;
  images: ImageItem[];
};

export type HistoryKind = "chat" | "image";

const KEYS: Record<HistoryKind, string> = {
  chat: "neurix:history:chat:v1",
  image: "neurix:history:image:v1",
};

const MAX_SESSIONS = 30;

function keyFor(kind: HistoryKind) {
  const ownerId = getHistoryOwnerId();
  if (!ownerId) return null;
  return `${KEYS[kind]}:${ownerId}`;
}

function read<T>(key: string | null): T[] {
  if (!key) return [];
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string | null, items: T[]) {
  if (!key) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_SESSIONS)));
    // notify same-tab listeners
    window.dispatchEvent(new CustomEvent("neurix:history-change", { detail: { key } }));
  } catch {
    /* quota / private mode — ignore */
  }
}

function deriveTitle(text: string, fallback = "Untitled") {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return fallback;
  return t.length > 64 ? t.slice(0, 64) + "…" : t;
}

// === Chat ===
export const chatHistory = {
  list(): ChatSession[] {
    return read<ChatSession>(keyFor("chat")).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  upsert(session: ChatSession) {
    const key = keyFor("chat");
    const all = read<ChatSession>(key).filter((s) => s.id !== session.id);
    all.unshift(session);
    write(key, all);
  },
  remove(id: string) {
    const key = keyFor("chat");
    write(key, read<ChatSession>(key).filter((s) => s.id !== id));
  },
  clear() {
    write(keyFor("chat"), []);
  },
  fromMessages(id: string, messages: ChatMsg[]): ChatSession {
    const firstUser = messages.find((m) => m.role === "user");
    return {
      id,
      title: deriveTitle(firstUser?.content ?? "", "New chat"),
      updatedAt: Date.now(),
      messages,
    };
  },
};

// === Image ===
export const imageHistory = {
  list(): ImageSession[] {
    return read<ImageSession>(keyFor("image")).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  upsert(session: ImageSession) {
    const key = keyFor("image");
    const all = read<ImageSession>(key).filter((s) => s.id !== session.id);
    all.unshift(session);
    write(key, all);
  },
  remove(id: string) {
    const key = keyFor("image");
    write(key, read<ImageSession>(key).filter((s) => s.id !== id));
  },
  clear() {
    write(keyFor("image"), []);
  },
  fromImages(id: string, images: ImageItem[]): ImageSession {
    return {
      id,
      title: deriveTitle(images[0]?.prompt ?? "", "Image batch"),
      updatedAt: Date.now(),
      images,
    };
  },
};

// React hook to subscribe to a kind of history
export function useHistory<K extends HistoryKind>(
  kind: K
): K extends "chat"
  ? ChatSession[]
  : ImageSession[] {
  const get = useCallback(() => {
    if (kind === "chat") return chatHistory.list() as never;
    return imageHistory.list() as never;
  }, [kind]);

  const [items, setItems] = useState(get);

  useEffect(() => {
    setItems(get());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      const prefix = KEYS[kind];
      if (!detail?.key || detail.key === prefix || detail.key.startsWith(prefix + ":")) {
        setItems(get());
      }
    };
    const onStorage = (e: StorageEvent) => {
      const prefix = KEYS[kind];
      if (e.key === prefix || e.key?.startsWith(prefix + ":")) setItems(get());
    };
    window.addEventListener("neurix:history-change", onChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("neurix:history-change", onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [kind, get]);

  return items as never;
}
