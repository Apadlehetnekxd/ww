import { useCallback, useEffect, useState } from "react";

export const GUEST_CHAT_LIMIT = 5;

type GuestChatQuota = {
  used: number;
  locked: boolean;
  updatedAt: number;
};

const STORAGE_KEY = "neurix:guest-chat-quota:v1";
const CHANGE_EVENT = "neurix:guest-chat-quota-change";

function defaultQuota(): GuestChatQuota {
  return {
    used: 0,
    locked: false,
    updatedAt: 0,
  };
}

function normalizeQuota(quota: Partial<GuestChatQuota> | null | undefined): GuestChatQuota {
  const used = typeof quota?.used === 'number' && Number.isFinite(quota.used) ? Math.max(0, Math.floor(quota.used)) : 0;
  const locked = Boolean(quota?.locked) || used >= GUEST_CHAT_LIMIT;
  return {
    used: Math.min(used, GUEST_CHAT_LIMIT),
    locked,
    updatedAt: Number.isFinite(quota?.updatedAt) ? Number(quota!.updatedAt) : Date.now(),
  };
}

function readQuota(): GuestChatQuota {
  if (typeof window === "undefined") return defaultQuota();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultQuota();
    return normalizeQuota(JSON.parse(raw) as Partial<GuestChatQuota>);
  } catch {
    return defaultQuota();
  }
}

function writeQuota(quota: GuestChatQuota) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quota));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* storage can fail in private mode or if quota is full */
  }
}

export function consumeGuestChatTurn(): GuestChatQuota {
  const current = readQuota();
  const next = normalizeQuota({
    used: current.used + 1,
    locked: current.locked || current.used + 1 >= GUEST_CHAT_LIMIT,
    updatedAt: Date.now(),
  });
  writeQuota(next);
  return next;
}

export function useGuestChatQuota() {
  const [quota, setQuota] = useState<GuestChatQuota>(() => readQuota());

  useEffect(() => {
    setQuota(readQuota());

    const onChange = () => setQuota(readQuota());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setQuota(readQuota());
    };

    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const consumeTurn = useCallback(() => {
    const next = consumeGuestChatTurn();
    setQuota(next);
    return next;
  }, []);

  return {
    quota,
    consumeTurn,
    remaining: Math.max(GUEST_CHAT_LIMIT - quota.used, 0),
    limitReached: quota.locked,
  };
}
