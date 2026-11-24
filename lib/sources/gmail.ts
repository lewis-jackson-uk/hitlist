import { google, type gmail_v1 } from "googleapis";
import type { GoogleAuth as OAuth2Client } from "../google";
import { mapLimit } from "../google";
import type { WaitingItem } from "../types";
import { addressesIn, decodeEntities, isAutomated, parseAddress, stripQuoted } from "./parse";

const LOOKBACK_DAYS = 14;
const MAX_THREADS = 60;

/** Primary inbox only: skip the tabs Gmail already knows are not people. */
const QUERY = `in:inbox newer_than:${LOOKBACK_DAYS}d -category:promotions -category:social -category:updates -category:forums`;

function headerMap(msg: gmail_v1.Schema$Message): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const h of msg.payload?.headers ?? []) {
    if (h.name) map[h.name.toLowerCase()] = h.value ?? undefined;
  }
  return map;
}

/**
 * Every inbox thread from the last two weeks where the latest message is from a
 * real person who is not you. That is the definition of "waiting on you".
 */
export async function fetchWaitingEmails(auth: OAuth2Client, selfEmail: string): Promise<WaitingItem[]> {
  const gmail = google.gmail({ version: "v1", auth });
  const self = selfEmail.toLowerCase();

  const list = await gmail.users.threads.list({ userId: "me", q: QUERY, maxResults: MAX_THREADS });
  const ids = (list.data.threads ?? []).map((t) => t.id!).filter(Boolean);

  const threads = await mapLimit(ids, 8, async (id) => {
    const res = await gmail.users.threads.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date", "List-Unsubscribe", "List-Id", "Auto-Submitted", "Precedence"],
    });
    return res.data;
  });

  const candidates: Array<WaitingItem & { _selfInThread: boolean }> = [];
  for (const thread of threads) {
    const messages = thread.messages ?? [];
    const last = messages[messages.length - 1];
    if (!last) continue;
    const h = headerMap(last);
    const from = parseAddress(h["from"]);
    if (!from.email || from.email === self) continue; // you sent the last message, nothing owed
    if (isAutomated(h, from.email)) continue;
    if (last.labelIds?.includes("DRAFT")) continue;

    const selfInThread = messages.some((m) => parseAddress(headerMap(m)["from"]).email === self);
    candidates.push({
      id: thread.id!,
      channel: "gmail",
      url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(self)}#all/${thread.id}`,
      from,
      subject: h["subject"]?.trim() || "(no subject)",
      snippet: stripQuoted(decodeEntities(last.snippet ?? "")),
      lastMessageAt: new Date(Number(last.internalDate ?? Date.now())).toISOString(),
      messageCount: messages.length,
      knownContact: selfInThread,
      isDirect: addressesIn(h["to"]).includes(self),
      _selfInThread: selfInThread,
    });
  }

  // For new threads, check whether you have ever emailed this person. One cheap query per unique sender.
  const unknownSenders = [...new Set(candidates.filter((c) => !c._selfInThread).map((c) => c.from.email))];
  const known = new Set<string>();
  await mapLimit(unknownSenders, 8, async (email) => {
    const res = await gmail.users.messages.list({ userId: "me", q: `in:sent to:${email}`, maxResults: 1 });
    if ((res.data.messages ?? []).length > 0) known.add(email);
  });

  return candidates.map(({ _selfInThread, ...item }) => ({
    ...item,
    knownContact: item.knownContact || known.has(item.from.email),
  }));
}
