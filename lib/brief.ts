import { triageWithClaude } from "./claude";
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

  return {
    generatedAt: now.toISOString(),
    mode: opts.mode,
    account: opts.account,
    ranked: usedClaude ? rank(items, opts.meetings, opts.keyContacts, now) : first,
    prep: prepFlags(opts.meetings, items, now, opts.account),
    usedClaude,
  };
}
