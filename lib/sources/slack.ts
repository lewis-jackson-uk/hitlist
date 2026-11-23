import { mapLimit } from "../google";
import type { Person, WaitingItem } from "../types";

/**
 * Slack, read-only, through a user token from an app installed in your own workspace.
 * "Waiting on you" means:
 *   - a DM or group DM where someone else spoke after you last did
 *   - an @mention in a channel that you haven't replied to in its thread
 */

export const SLACK_USER_SCOPES = [
  "im:read",
  "im:history",
  "mpim:read",
  "mpim:history",
  "channels:history",
  "groups:history",
  "users:read",
  "users:read.email",
  "search:read",
];

const LOOKBACK_DAYS = 14;
/** Caps keep a run well inside Slack's limits for internal apps (Tier 3, about 50 calls a minute). */
const MAX_DMS = 40;
const MAX_MENTIONS = 12;

export type SlackCall = (method: string, params?: Record<string, string | number | boolean>) => Promise<any>;

export class SlackError extends Error {
  constructor(public code: string) {
    super(`Slack API error: ${code}`);
  }
}

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET && process.env.SLACK_REDIRECT_URI);
}

/** A real Slack Web API client with one polite retry when rate limited. */
export function slackClient(token: string): SlackCall {
  return async function call(method, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 429 && attempt === 0) {
        const wait = Math.min(10, Number(res.headers.get("retry-after") ?? 3));
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await res.json();
      if (!body.ok) throw new SlackError(body.error ?? `http_${res.status}`);
      return body;
    }
    throw new SlackError("ratelimited");
  };
}

interface SlackMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
}

/** Ordinary messages from people: no bots, joins, topic changes and so on. */
function isHuman(m: SlackMessage): boolean {
  return Boolean(m.user) && !m.bot_id && (!m.subtype || m.subtype === "thread_broadcast");
}

const tsToIso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

function permalink(teamUrl: string, channel: string, ts: string, threadTs?: string): string {
  const base = `${teamUrl.replace(/\/?$/, "/")}archives/${channel}/p${ts.replace(".", "")}`;
  return threadTs && threadTs !== ts ? `${base}?thread_ts=${threadTs}&cid=${channel}` : base;
}

/** Turn Slack's markup into readable text: <@U1> to @Name, <url|label> to label, and so on. */
export function cleanSlackText(text: string, names: Map<string, string>): string {
  return text
    .replace(/<@([UW][A-Z0-9]+)(\|[^>]+)?>/g, (_, id: string) => `@${names.get(id) ?? "someone"}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, n = 280): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Look up people once each; Slack profiles carry the email that links them to your calendar. */
function peopleDirectory(call: SlackCall) {
  const cache = new Map<string, Promise<Person & { bot: boolean }>>();
  return {
    get(id: string) {
      if (!cache.has(id)) {
        cache.set(
          id,
          call("users.info", { user: id })
            .then(({ user }) => ({
              name: user.profile?.real_name || user.real_name || user.profile?.display_name || user.name || id,
              email: (user.profile?.email ?? "").toLowerCase(),
              bot: Boolean(user.is_bot) || id === "USLACKBOT",
            }))
            .catch(() => ({ name: id, email: "", bot: false })),
        );
      }
      return cache.get(id)!;
    },
    async names(text: string): Promise<Map<string, string>> {
      const ids = [...new Set([...text.matchAll(/<@([UW][A-Z0-9]+)/g)].map((m) => m[1]))];
      const out = new Map<string, string>();
      for (const id of ids) out.set(id, (await this.get(id)).name);
      return out;
    },
  };
}

export async function fetchWaitingSlack(
  call: SlackCall,
  self: { userId: string; teamUrl: string },
  now: Date = new Date(),
): Promise<WaitingItem[]> {
  const people = peopleDirectory(call);
  const oldest = String(Math.floor(now.getTime() / 1000) - LOOKBACK_DAYS * 86_400);
  const [dms, mentions] = await Promise.all([
    fetchDms(call, people, self, oldest),
    fetchMentions(call, people, self, oldest),
  ]);
  return [...dms, ...mentions];
}

async function fetchDms(
  call: SlackCall,
  people: ReturnType<typeof peopleDirectory>,
  self: { userId: string; teamUrl: string },
  oldest: string,
): Promise<WaitingItem[]> {
  const convos = await call("users.conversations", { types: "im,mpim", exclude_archived: true, limit: 200 });
  const channels: Array<{ id: string; is_im?: boolean; user?: string; name?: string }> = convos.channels ?? [];

  const results = await mapLimit(channels.slice(0, MAX_DMS), 4, async (ch): Promise<WaitingItem | null> => {
    if (ch.is_im && ch.user && (await people.get(ch.user)).bot) return null;
    let history: { messages?: SlackMessage[] };
    try {
      history = await call("conversations.history", { channel: ch.id, oldest, limit: 15 });
    } catch {
      return null;
    }
    const msgs = (history.messages ?? []).filter(isHuman); // newest first
    const lastMine = msgs.findIndex((m) => m.user === self.userId);
    const owed = (lastMine === -1 ? msgs : msgs.slice(0, lastMine)).filter((m) => m.user !== self.userId);
    if (owed.length === 0) return null;

    const latest = owed[0];
    const from = await people.get(latest.user!);
    if (from.bot) return null;
    const names = await people.names(latest.text ?? "");
    const text = cleanSlackText(latest.text ?? "", names);
    const isGroup = !ch.is_im;
    const others = isGroup ? new Set(owed.map((m) => m.user!)).size : 1;

    return {
      id: `slack:${ch.id}`,
      channel: "slack",
      url: permalink(self.teamUrl, ch.id, latest.ts),
      from: { name: from.name, email: from.email },
      // A DM has no subject line, so lead with what they said.
      subject: `${isGroup ? `Group DM${others > 1 ? ` (${others} people)` : ""}: ` : ""}${clip(text, 72)}`,
      location: isGroup ? "Group DM" : "DM",
      snippet: clip(text),
      lastMessageAt: tsToIso(latest.ts),
      // Grows when they write again, so delegations and "Hit tomorrow" notice new messages.
      messageCount: owed.length,
      knownContact: true, // a workspace colleague, not a cold email
      isDirect: true,
    };
  });
  return results.filter((r): r is WaitingItem => r !== null);
}

interface SearchMatch {
  ts: string;
  user?: string;
  text?: string;
  permalink?: string;
  channel?: { id: string; name?: string; is_im?: boolean; is_mpim?: boolean };
}

async function fetchMentions(
  call: SlackCall,
  people: ReturnType<typeof peopleDirectory>,
  self: { userId: string; teamUrl: string },
  oldest: string,
): Promise<WaitingItem[]> {
  const after = new Date((Number(oldest) - 86_400) * 1000).toISOString().slice(0, 10);
  let matches: SearchMatch[] = [];
  try {
    const res = await call("search.messages", {
      query: `<@${self.userId}> after:${after}`,
      sort: "timestamp",
      sort_dir: "desc",
      count: 40,
    });
    matches = res.messages?.matches ?? [];
  } catch {
    return [];
  }

  // One item per thread: keep the newest mention of you in each.
  const byThread = new Map<string, SearchMatch & { root: string }>();
  for (const m of matches) {
    if (!m.channel?.id || m.channel.is_im || m.channel.is_mpim) continue; // DMs are covered above
    if (!m.user || m.user === self.userId) continue;
    if (Number(m.ts) < Number(oldest)) continue;
    const root = m.permalink ? new URL(m.permalink).searchParams.get("thread_ts") ?? m.ts : m.ts;
    const key = `${m.channel.id}:${root}`;
    const prev = byThread.get(key);
    if (!prev || Number(m.ts) > Number(prev.ts)) byThread.set(key, { ...m, root });
  }

  const candidates = [...byThread.values()].sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, MAX_MENTIONS);
  const results = await mapLimit(candidates, 3, async (m): Promise<WaitingItem | null> => {
    const channelId = m.channel!.id;
    // Did you reply after being mentioned, in the thread or straight after in the channel?
    let after: SlackMessage[] = [];
    try {
      const thread = await call("conversations.replies", { channel: channelId, ts: m.root, limit: 50 });
      after = (thread.messages ?? []).filter((x: SlackMessage) => Number(x.ts) > Number(m.ts));
      if (m.root === m.ts) {
        const hist = await call("conversations.history", { channel: channelId, oldest: m.ts, limit: 15 });
        after = after.concat(hist.messages ?? []);
      }
    } catch {
      /* not a member or no access: assume it's still waiting */
    }
    if (after.some((x) => x.user === self.userId)) return null;

    const from = await people.get(m.user!);
    if (from.bot) return null;
    const names = await people.names(m.text ?? "");
    const others = after.filter((x) => isHuman(x) && x.user !== self.userId).length;
    const where = m.channel!.name ? `#${m.channel!.name}` : "a channel";

    return {
      id: `slack:${channelId}:${m.root}`,
      channel: "slack",
      url: m.permalink ?? permalink(self.teamUrl, channelId, m.ts, m.root),
      from: { name: from.name, email: from.email },
      subject: `Mentioned you in ${where}`,
      location: where,
      snippet: clip(cleanSlackText(m.text ?? "", names)),
      lastMessageAt: tsToIso(m.ts),
      messageCount: 1 + others,
      knownContact: true,
      isDirect: true,
    };
  });
  return results.filter((r): r is WaitingItem => r !== null);
}
