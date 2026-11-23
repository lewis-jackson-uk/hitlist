import { triageFollowUpsWithClaude, triageWithClaude } from "./claude";
import { rankFollowUps } from "./followups";
import { prepFlags, rank } from "./scoring";
import type { Brief, Meeting, WaitingItem } from "./types";

/** How many of the top-ranked items get a Claude read and a draft. Keeps cost to pennies per run. */
const CLAUDE_TOP_N = 15;

export function keyContactsFromEnv(): string[] {
  return (process.env.KEY_CONTACTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * The pipeline: rank with rules, ask Claude to read the top of the list, then
 * re-rank with Claude's urgency. Two passes so Claude only reads what is likely to matter.
 */
export async function buildBrief(opts: {
  items: WaitingItem[];
  /** Sent emails with no reply yet (the "Waiting on them" list) */
  sent?: WaitingItem[];
  meetings: Meeting[];
  keyContacts: string[];
  mode: Brief["mode"];
  account?: string;
  now?: Date;
  useClaude?: boolean;
}): Promise<Brief> {
  const now = opts.now ?? new Date();
  const first = rank(opts.items, opts.meetings, opts.keyContacts, now);

  let items = opts.items;
  let usedClaude = false;
  if (opts.useClaude !== false) {
    const triage = await triageWithClaude(first.slice(0, CLAUDE_TOP_N), now);
    if (triage.size > 0) {
      usedClaude = true;
      items = opts.items.map((i) => {
        const t = triage.get(i.id);
        return t ? { ...i, urgency: t.urgency, draft: t.draft } : i;
      });
    }
  }

  const followUps = await buildFollowUps(opts.sent ?? [], opts.meetings, opts.keyContacts, now, opts.useClaude !== false);

  return {
    generatedAt: now.toISOString(),
    followUps: followUps.ranked,
    mode: opts.mode,
    account: opts.account,
    ranked: usedClaude ? rank(items, opts.meetings, opts.keyContacts, now) : first,
    prep: prepFlags(opts.meetings, items, now, opts.account),
    usedClaude: usedClaude || followUps.usedClaude,
  };
}

/**
 * Same two-pass shape as the main list. With Claude, it decides which sent emails deserve
 * a chase (it sees every candidate, since "thanks!" emails are common). Without Claude,
 * rules keep only emails where you asked a question or made a request.
 */
async function buildFollowUps(
  sent: WaitingItem[],
  meetings: Meeting[],
  keyContacts: string[],
  now: Date,
  useClaude: boolean,
): Promise<{ ranked: ReturnType<typeof rankFollowUps>; usedClaude: boolean }> {
  if (sent.length === 0) return { ranked: [], usedClaude: false };
  if (useClaude) {
    // Score everything first (rules would hide "no question asked" emails Claude might still flag).
    const asAsked = sent.map((i) => ({ ...i, urgency: i.urgency ?? { level: 1 as const, source: "rules" as const } }));
    const candidates = rankFollowUps(asAsked, meetings, keyContacts, now).slice(0, 15);
    const triage = await triageFollowUpsWithClaude(candidates, now);
    if (triage.size > 0) {
      const judged = sent
        .filter((i) => triage.get(i.id)?.needsFollowUp)
        .map((i) => ({ ...i, urgency: triage.get(i.id)!.urgency, draft: triage.get(i.id)!.draft }));
      return { ranked: rankFollowUps(judged, meetings, keyContacts, now), usedClaude: true };
    }
  }
  return { ranked: rankFollowUps(sent, meetings, keyContacts, now), usedClaude: false };
}
