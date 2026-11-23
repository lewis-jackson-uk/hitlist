import type { RankedItem } from "./types";

/**
 * "No reply needed": clears an item you've decided not to answer (a "thanks",
 * an FYI). It remembers how many messages the conversation had, so if the other
 * person writes again, it comes straight back.
 */
export type Dismissals = Record<string, { messageCount: number; at: string }>;

export function dismiss(all: Dismissals, r: RankedItem, now: Date): Dismissals {
  return { ...all, [r.item.id]: { messageCount: r.item.messageCount, at: now.toISOString() } };
}

export function restore(all: Dismissals, id: string): Dismissals {
  const next = { ...all };
  delete next[id];
  return next;
}

export function applyDismissals(
  ranked: RankedItem[],
  all: Dismissals,
): { kept: RankedItem[]; dismissed: RankedItem[] } {
  const kept: RankedItem[] = [];
  const dismissed: RankedItem[] = [];
  for (const r of ranked) {
    const d = all[r.item.id];
    if (d && r.item.messageCount <= d.messageCount) dismissed.push(r);
    else kept.push(r);
  }
  return { kept, dismissed };
}

/** Forget dismissals for conversations that have left the list entirely. */
export function pruneDismissals(all: Dismissals, liveIds: string[]): Dismissals {
  const live = new Set(liveIds);
  return Object.fromEntries(Object.entries(all).filter(([id]) => live.has(id)));
}
