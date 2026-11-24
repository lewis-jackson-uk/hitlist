import type { Person } from "../types";

/** Parse a single RFC 5322 address like `"Zoe Smith" <zoe@x.co>` or `zoe@x.co`. */
export function parseAddress(raw: string | undefined | null): Person {
  if (!raw) return { name: "", email: "" };
  const angle = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) {
    const email = angle[2].trim().toLowerCase();
    return { name: angle[1].trim() || email, email };
  }
  const email = raw.trim().toLowerCase();
  return { name: email, email };
}

/** Pull every email address out of a To or Cc header. */
export function addressesIn(header: string | undefined | null): string[] {
  if (!header) return [];
  return (header.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((e) => e.toLowerCase());
}

const NO_REPLY = /(^|[._-])(no-?reply|do-?not-?reply|notifications?|mailer(-daemon)?|bounce|alerts?|news(letter)?|digest|updates?)([._+-]|@)/i;

/**
 * True for mail sent by systems rather than people: newsletters, receipts, notifications.
 * These never need a reply, so they should never appear in the list.
 */
export function isAutomated(headers: Record<string, string | undefined>, fromEmail: string): boolean {
  if (headers["list-unsubscribe"] || headers["list-id"]) return true;
  const auto = headers["auto-submitted"];
  if (auto && auto.toLowerCase() !== "no") return true;
  const precedence = headers["precedence"]?.toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return true;
  return NO_REPLY.test(fromEmail);
}

/**
 * Cut the quoted history off the end of an email snippet ("On Wed, 4 Nov ... wrote:",
 * "-----Original Message-----", "From: ... Sent: ..."), leaving only what was actually written.
 */
export function stripQuoted(text: string): string {
  const markers = [
    /\s+On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^]{0,120}?wrote:/i,
    /\s+On \d{1,2} [A-Z][a-z]+ \d{4}[^]{0,120}?wrote:/,
    /\s+On [^]{0,120}?<[^>\s]+@[^>\s]+>\s*wrote:/,
    /\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\s+From: [^]{0,200}?Sent: /,
    /\s+Sent from my (iPhone|iPad|Android|Samsung)/i,
  ];
  let cut = text.length;
  for (const re of markers) {
    const m = text.match(re);
    if (m?.index !== undefined && m.index > 0) cut = Math.min(cut, m.index);
  }
  return text.slice(0, cut).trim();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (ENTITIES[c]) return ENTITIES[c];
      if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10));
      return m;
    })
    .trim();
}
