let currentHistoryOwnerId: string | null = null;

export function setHistoryOwnerId(ownerId: string | null) {
  currentHistoryOwnerId = ownerId;
}

export function getHistoryOwnerId() {
  return currentHistoryOwnerId;
}
