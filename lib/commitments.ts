import type { RankedItem } from "./types";

/**
 * "Hit tomorrow": you push an item to tomorrow, and in return it comes back
 * with extra priority, because you made a commitment. Push it again and the
 * bonus grows, so repeated delays get harder to ignore.
 */
export const COMMITMENT_BONUS = 10;

export interface Commitment {
  /** London calendar day (YYYY-MM-DD) the item comes back on */
  until: string;
  /** How many times it has been pushed */
  pushes: number;
}

export type Commitments = Record<string, Commitment>;

export function londonDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** The London calendar day after `now`. Uses midday to stay clear of clock changes. */
export function tomorrowKey(now: Date): string {
  const [y, m, day] = londonDayKey(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1, 12)).toISOString().slice(0, 10);
}

export function commitToTomorrow(all: Commitments, id: string, now: Date): Commitments {
  const prev = all[id];
  return { ...all, [id]: { until: tomorrowKey(now), pushes: (prev?.pushes ?? 0) + 1 } };
}

/** Undo a push made today. If it had been pushed before, it keeps that earlier history. */
export function bringBack(all: Commitments, id: string, now: Date): Commitments {
  const prev = all[id];
  if (!prev) return all;
  const next = { ...all };
  if (prev.pushes <= 1) delete next[id];
  else next[id] = { until: londonDayKey(now), pushes: prev.pushes - 1 };
  return next;
}

/**
 * Split the ranked list into what's due today and what you've pushed to tomorrow,
 * adding the commitment bonus to anything that has come back.
 */
export function applyCommitments(
  ranked: RankedItem[],
  all: Commitments,
  now: Date,
): { today: RankedItem[]; later: RankedItem[] } {
  const today = londonDayKey(now);
  const due: RankedItem[] = [];
  const later: RankedItem[] = [];

  for (const r of ranked) {
    const c = all[r.item.id];
    if (!c) {
      due.push(r);
    } else if (c.until > today) {
      later.push(r);
    } else {
      const reason = c.pushes === 1 ? "You committed to this yesterday" : `Pushed ${c.pushes} times`;
      due.push({
        ...r,
        score: Math.min(100, r.score + COMMITMENT_BONUS * c.pushes),
        reasons: [r.reasons[0], reason, ...r.reasons.slice(1)],
      });
    }
  }

  due.sort((a, b) => b.score - a.score || a.item.lastMessageAt.localeCompare(b.item.lastMessageAt));
  return { today: due, later };
}

/** Drop commitments for threads that are no longer waiting on you (you replied, or they aged out). */
export function prune(all: Commitments, liveIds: string[]): Commitments {
  const live = new Set(liveIds);
  return Object.fromEntries(Object.entries(all).filter(([id]) => live.has(id)));
}
