import type { Urgency, WaitingItem } from "./types";

/**
 * Rule-based urgency, used when no Claude API key is set and as a fallback
 * if a Claude call fails. Deliberately conservative: it should never invent urgency.
 */
const TODAY = /\b(urgent|asap|today|tonight|eod|end of (the )?day|this morning|this afternoon|right away)\b/i;
const DEADLINE =
  /\b(by|before|until|deadline)\s+(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?|tomorrow|end of (the )?week|eow|\d{1,2}(st|nd|rd|th)?)\b/i;
const ACTION = /\b(sign|approve|approval|decision|decide|confirm|sign[- ]off|go ahead|green light)\b/i;

export function ruleUrgency(item: Pick<WaitingItem, "subject" | "snippet">): Urgency {
  const text = `${item.subject} ${item.snippet}`;
  let level = 0;
  let reason: string | undefined;

  if (text.includes("?")) {
    level = 1;
    reason = "Asks you a question";
  }
  if (ACTION.test(text)) {
    level = Math.max(level, 1);
    reason = "Needs a decision or sign-off from you";
  }
  if (DEADLINE.test(text)) {
    level = 2;
    reason = "Mentions a deadline";
  }
  if (TODAY.test(text)) {
    level = 3;
    reason = "Flagged as urgent or due today";
  }
  if (level === 2 && ACTION.test(text)) level = 3;

  return { level: level as Urgency["level"], reason, source: "rules" };
}
