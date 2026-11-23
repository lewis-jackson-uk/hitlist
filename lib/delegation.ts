import { londonDayKey } from "./commitments";
import type { RankedItem, WaitingItem } from "./types";

/**
 * Delegation without a database: the handover is a normal email, so it lands on
 * the delegate's own HitList as something they owe a reply. On your side,
 * HitList parks the item and brings it back after a couple of days to check it was handled.
 */
export const FOLLOW_UP_DAYS = 2;

export interface Delegation {
  to: string;
  note?: string;
  /** When you delegated (ISO) */
  at: string;
  /** Messages in the thread when you delegated. If the sender writes again, the delegation no longer applies. */
  messageCount: number;
  /** You confirmed it was dealt with */
  handled?: boolean;
}

export type Delegations = Record<string, Delegation>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL.test(s.trim());
}

export function delegate(all: Delegations, item: WaitingItem, to: string, note: string, now: Date): Delegations {
  return {
    ...all,
    [item.id]: { to: to.trim().toLowerCase(), note: note.trim() || undefined, at: now.toISOString(), messageCount: item.messageCount },
  };
}

export function takeBack(all: Delegations, id: string): Delegations {
  const next = { ...all };
  delete next[id];
  return next;
}

export function markHandled(all: Delegations, id: string): Delegations {
  const d = all[id];
  return d ? { ...all, [id]: { ...d, handled: true } } : all;
}

function daysBetween(fromIso: string, now: Date): number {
  return Math.round((Date.parse(londonDayKey(now)) - Date.parse(londonDayKey(new Date(fromIso)))) / 86_400_000);
}

export interface DelegatedRow {
  r: RankedItem;
  d: Delegation;
  daysAgo: number;
}

/**
 * Split the list: delegated items park in their own section, then come back to today
 * with a check-in reason once FOLLOW_UP_DAYS have passed. Handled items disappear.
 * A newer message from the sender cancels the delegation, so nothing new gets hidden.
 */
export function applyDelegations(
  ranked: RankedItem[],
  all: Delegations,
  now: Date,
): { active: RankedItem[]; delegated: DelegatedRow[] } {
  const active: RankedItem[] = [];
  const delegated: DelegatedRow[] = [];

  for (const r of ranked) {
    const d = all[r.item.id];
    if (!d || r.item.messageCount > d.messageCount) {
      active.push(r);
      continue;
    }
    if (d.handled) continue;
    const daysAgo = daysBetween(d.at, now);
    if (daysAgo >= FOLLOW_UP_DAYS) {
      const who = d.to.split("@")[0];
      active.push({ ...r, reasons: [r.reasons[0], `Delegated to ${who} ${daysAgo} days ago: check it's handled`] });
    } else {
      delegated.push({ r, d, daysAgo });
    }
  }
  return { active, delegated };
}

/** Delegations for threads no longer waiting on you are dropped, so storage stays small. */
export function pruneDelegations(all: Delegations, liveIds: string[]): Delegations {
  const live = new Set(liveIds);
  return Object.fromEntries(Object.entries(all).filter(([id]) => live.has(id)));
}

/** The handover email. Plain text, no em dashes, written to be sent as is. */
export function handoverBody(item: WaitingItem, note: string): string {
  const received = new Date(item.lastMessageAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
  return [
    "Hi,",
    "",
    `Could you pick this up for me?${note.trim() ? ` ${note.trim()}` : ""}`,
    "",
    `From: ${item.from.name} <${item.from.email}>`,
    `Subject: ${item.subject}`,
    `Received: ${received}`,
    "",
    `"${item.snippet}"`,
    "",
    `Please reply to ${item.from.name.split(" ")[0]} directly and copy me in. Let me know if you need the full thread.`,
    "",
    "Thanks",
  ].join("\n");
}

/**
 * A Gmail compose link with the handover pre-filled. Opening a draft needs no extra
 * permissions, so HitList stays read-only; you press send.
 */
export function handoverUrl(item: WaitingItem, to: string, note: string, account?: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to.trim(),
    su: `Can you take this? ${item.subject}`,
    body: handoverBody(item, note),
  });
  if (account) params.set("authuser", account);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
