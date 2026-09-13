import { useEffect, useState } from "react";
import { ULTRA_COOLDOWN_MS, ULTRA_MESSAGES_PER_COOLDOWN } from "@/lib/ai-services";

const EVENT = "neurix:ultra-usage";
export type UltraUsage = { used: number; until: number };

export function normalizeUltraUsage(used: number, until: number, now = Date.now()): UltraUsage {
  if (Number.isFinite(until) && until > 0 && until <= now) return { used: 0, until: 0 };
  return {
    used: Number.isFinite(used) ? Math.min(ULTRA_MESSAGES_PER_COOLDOWN, Math.max(0, Math.floor(used))) : 0,
    until: Number.isFinite(until) && until > now ? until : 0,
  };
}

export function readUltraUsage(userId: string | null): UltraUsage {
  if (!userId) return { used: 0, until: 0 };
  try {
    return normalizeUltraUsage(Number(localStorage.getItem("neurix-ultra-messages:" + userId)), Number(localStorage.getItem("neurix-ultra-cooldown:" + userId)));
  } catch { return { used: 0, until: 0 }; }
}

export function recordUltraSuccess(userId: string): UltraUsage {
  const current = readUltraUsage(userId);
  if (current.until > Date.now()) return current;
  const used = current.used + 1;
  const next = { used, until: used >= ULTRA_MESSAGES_PER_COOLDOWN ? Date.now() + ULTRA_COOLDOWN_MS : 0 };
  try {
    localStorage.setItem("neurix-ultra-messages:" + userId, String(next.used));
    localStorage.setItem("neurix-ultra-cooldown:" + userId, String(next.until));
  } catch { /* Keep the current tab usable when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function useUltraAllowance(userId: string | null) {
  const [usage, setUsage] = useState(() => readUltraUsage(userId));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const sync = () => { setUsage(readUltraUsage(userId)); setNow(Date.now()); };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    const timer = window.setInterval(sync, 1000);
    return () => { clearInterval(timer); window.removeEventListener("storage", sync); window.removeEventListener(EVENT, sync); };
  }, [userId]);
  return { ...usage, remaining: usage.until > now ? 0 : Math.max(0, ULTRA_MESSAGES_PER_COOLDOWN - usage.used), cooldownMs: Math.max(0, usage.until - now) };
}
