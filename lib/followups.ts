import { humanDuration, nextMeetingWith, senderTier } from "./scoring";
import type { Meeting, RankedItem, Urgency, WaitingItem } from "./types";

/**
 * "Waiting on them": emails you sent that never got a reply. The reverse of the
 * main list. Here `item.from` is the person you're waiting on, and `lastMessageAt`
 * is when you sent your message.
 */

const HOUR = 3_600_000;
/** Give people two days before suggesting a nudge, and stop chasing after three weeks. */
export const NUDGE_AFTER_HOURS = 48;
export const GIVE_UP_DAYS = 21;

export const FOLLOW_UP_WEIGHTS = {
  silence: { under4d: 15, under7d: 25, over7d: 30 },
  tier: { key: 25, known: 12, unknown: 8 },
  importance: [0, 8, 16, 25] as const,
  meetingWithin7d: 10,
} as const;

const ASK =
  /\?|\b(could you|can you|would you|let me know|please (send|confirm|review|share|advise)|thoughts|keen to hear|any update|get back to me|when (are|would) you)\b/i;

/** Without Claude: only chase emails where you actually asked for something. */
export function ruleFollowUp(item: Pick<WaitingItem, "subject" | "snippet">): Urgency {
  return ASK.test(`${item.subject} ${item.snippet}`)
    ? { level: 1, reason: "You asked for a response", source: "rules" }
    : { level: 0, source: "rules" };
}

function shortDay(iso: string, now: Date): string {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  if (key(d) === key(new Date(now.getTime() + 86_400_000))) return "tomorrow";
  if (key(d) === key(now)) return "today";
  return d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" });
}

export function scoreFollowUp(item: WaitingItem, meetings: Meeting[], keyContacts: string[], now: Date): RankedItem {
  const silent = now.getTime() - new Date(item.lastMessageAt).getTime();
  const days = silent / (24 * HOUR);
  const w = FOLLOW_UP_WEIGHTS;
  const reasons = [`No reply for ${humanDuration(silent)}`];
  let score = days < 4 ? w.silence.under4d : days < 7 ? w.silence.under7d : w.silence.over7d;

  const tier = senderTier(item, keyContacts);
  score += w.tier[tier];
  if (tier === "key") reasons.push("Key contact");

  const importance = item.urgency ?? ruleFollowUp(item);
  score += w.importance[importance.level];
  if (importance.reason) reasons.push(importance.reason);

  const meeting = nextMeetingWith(item.from.email, meetings, now);
  if (meeting && new Date(meeting.start).getTime() - now.getTime() <= 7 * 24 * HOUR) {
    score += w.meetingWithin7d;
    reasons.push(`Seeing them ${shortDay(meeting.start, now)}: raise it then`);
  }

  return { item: { ...item, urgency: importance }, score: Math.min(100, Math.round(score)), tier, reasons, meeting };
}

/** Keep only threads old enough to chase, and young enough to still matter. */
export function dueForNudge(item: WaitingItem, now: Date): boolean {
  const silent = now.getTime() - new Date(item.lastMessageAt).getTime();
  return silent >= NUDGE_AFTER_HOURS * HOUR && silent <= GIVE_UP_DAYS * 24 * HOUR;
}

export function rankFollowUps(
  items: WaitingItem[],
  meetings: Meeting[],
  keyContacts: string[],
  now: Date,
): RankedItem[] {
  return items
    .filter((i) => dueForNudge(i, now))
    .map((i) => scoreFollowUp(i, meetings, keyContacts, now))
    .filter((r) => r.item.urgency!.level > 0) // nothing was asked: no chase needed
    .sort((a, b) => b.score - a.score);
}
