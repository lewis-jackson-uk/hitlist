import type { Meeting, PrepFlag, RankedItem, SenderTier, WaitingItem } from "./types";
import { ruleUrgency } from "./urgency-rules";

const HOUR = 3_600_000;

/**
 * Score weights, out of 100. Kept in one place so the ranking is easy to explain
 * and easy to tune. Every point awarded produces a human-readable reason.
 */
export const WEIGHTS = {
  wait: { under4h: 4, under1d: 12, under2d: 20, under4d: 28, over4d: 35 },
  tier: { key: 25, known: 12, unknown: 4 } satisfies Record<SenderTier, number>,
  /** Non-linear: something blocking or due today should jump the queue, a mild question should not. */
  urgency: [0, 6, 14, 30] as const,
  /** Cold emails with nothing urgent in them shouldn't climb the list just by being old. */
  coldWaitFactor: 0.5,
  meeting: { within24h: 20, within72h: 12, within7d: 5 },
  ccPenalty: -8,
} as const;

export function senderTier(item: WaitingItem, keyContacts: string[]): SenderTier {
  const email = item.from.email.toLowerCase();
  const domain = email.split("@")[1] ?? "";
  const isKey = keyContacts.some((k) => {
    const key = k.trim().toLowerCase();
    if (!key) return false;
    return key.includes("@") ? key === email : key === domain;
  });
  if (isKey) return "key";
  return item.knownContact ? "known" : "unknown";
}

export function humanDuration(ms: number): string {
  const h = Math.floor(ms / HOUR);
  if (h < 1) return "under an hour";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function waitPoints(ms: number): number {
  const h = ms / HOUR;
  const w = WEIGHTS.wait;
  if (h < 4) return w.under4h;
  if (h < 24) return w.under1d;
  if (h < 48) return w.under2d;
  if (h < 96) return w.under4d;
  return w.over4d;
}

function formatMeetingTime(startIso: string, now: Date): string {
  const start = new Date(startIso);
  const time = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const dayDiff = Math.round((londonDay(start) - londonDay(now)) / (24 * HOUR));
  if (dayDiff === 0) return `today ${time}`;
  if (dayDiff === 1) return `tomorrow ${time}`;
  const day = start.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" });
  return `${day} ${time}`;
}

/** Midnight (as a UTC timestamp) of the calendar day this instant falls on in London. */
function londonDay(d: Date): number {
  return Date.parse(d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }));
}

/** The soonest future meeting that includes this sender. */
export function nextMeetingWith(email: string, meetings: Meeting[], now: Date): Meeting | undefined {
  const e = email.toLowerCase();
  return meetings
    .filter((m) => new Date(m.start).getTime() > now.getTime())
    .filter((m) => m.attendees.some((a) => a.email.toLowerCase() === e))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

export function scoreItem(
  item: WaitingItem,
  meetings: Meeting[],
  keyContacts: string[],
  now: Date,
): RankedItem {
  const reasons: string[] = [];
  let score = 0;

  const tier = senderTier(item, keyContacts);
  const urgency = item.urgency ?? ruleUrgency(item);
  const cold = tier === "unknown" && urgency.level === 0;

  const waited = Math.max(0, now.getTime() - new Date(item.lastMessageAt).getTime());
  score += waitPoints(waited) * (cold ? WEIGHTS.coldWaitFactor : 1);
  reasons.push(`Waiting ${humanDuration(waited)}`);

  score += WEIGHTS.tier[tier];
  if (tier === "key") reasons.push("Key contact");
  else if (tier === "unknown") reasons.push("First contact");

  score += WEIGHTS.urgency[urgency.level];
  if (urgency.level > 0 && urgency.reason) reasons.push(urgency.reason);
  else if (urgency.level === 0 && urgency.source === "claude" && urgency.reason) reasons.push(urgency.reason);

  const meeting = nextMeetingWith(item.from.email, meetings, now);
  if (meeting) {
    const until = new Date(meeting.start).getTime() - now.getTime();
    const m = WEIGHTS.meeting;
    score += until <= 24 * HOUR ? m.within24h : until <= 72 * HOUR ? m.within72h : until <= 168 * HOUR ? m.within7d : 0;
    if (until <= 168 * HOUR) reasons.push(`Meeting ${formatMeetingTime(meeting.start, now)}: ${meeting.title}`);
  }

  if (!item.isDirect) {
    score += WEIGHTS.ccPenalty;
    reasons.push("You're only CC'd");
  }

  return {
    item: { ...item, urgency },
    score: Math.max(0, Math.min(100, Math.round(score))),
    tier,
    reasons,
    meeting,
  };
}

export function rank(
  items: WaitingItem[],
  meetings: Meeting[],
  keyContacts: string[],
  now: Date = new Date(),
): RankedItem[] {
  return items
    .map((i) => scoreItem(i, meetings, keyContacts, now))
    .sort((a, b) => b.score - a.score || a.item.lastMessageAt.localeCompare(b.item.lastMessageAt));
}

/**
 * Meetings in the next 48 hours that need attention before you walk in:
 * no agenda, or attendees still waiting on a reply from you.
 */
export function prepFlags(meetings: Meeting[], items: WaitingItem[], now: Date, selfEmail?: string): PrepFlag[] {
  const horizon = now.getTime() + 48 * HOUR;
  const self = selfEmail?.toLowerCase();
  return meetings
    .filter((m) => {
      const t = new Date(m.start).getTime();
      return t > now.getTime() && t <= horizon;
    })
    .map((meeting) => {
      const others = meeting.attendees.filter((a) => a.email.toLowerCase() !== self);
      const emails = new Set(others.map((a) => a.email.toLowerCase()));
      const openThreads = items.filter((i) => emails.has(i.from.email.toLowerCase())).length;
      const reasons: string[] = [];
      if (!meeting.hasAgenda && others.length > 0) reasons.push("No agenda");
      if (openThreads > 0)
        reasons.push(`${openThreads} unanswered thread${openThreads === 1 ? "" : "s"} from attendees`);
      return { meeting, reasons, openThreads };
    })
    .filter((p) => p.reasons.length > 0)
    .sort((a, b) => a.meeting.start.localeCompare(b.meeting.start));
}
