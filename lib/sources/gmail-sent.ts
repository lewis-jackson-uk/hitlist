import { google } from "googleapis";
import { mapLimit, type GoogleAuth } from "../google";
import { GIVE_UP_DAYS } from "../followups";
import type { Person, WaitingItem } from "../types";
import { addressesIn, decodeEntities, parseAddress } from "./parse";

const MAX_THREADS = 40;

/** The first real recipient in a To header, with their display name if there is one. */
export function firstRecipient(to: string | undefined, self: string): Person | null {
  if (!to) return null;
  const email = addressesIn(to).find((e) => e !== self);
  if (!email) return null;
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = to.match(new RegExp(`"?([^",<]+?)"?\\s*<${escaped}>`, "i"));
  return { name: named?.[1]?.trim() || email, email };
}

/**
 * Sent threads where your message is still the last one, between 2 and 21 days old.
 * Whether each one actually needs chasing is decided afterwards (by Claude, or by rules).
 */
export async function fetchAwaitingReplies(auth: GoogleAuth, selfEmail: string, now = new Date()): Promise<WaitingItem[]> {
  const gmail = google.gmail({ version: "v1", auth });
  const self = selfEmail.toLowerCase();
  const list = await gmail.users.threads.list({
    userId: "me",
    q: `in:sent newer_than:${GIVE_UP_DAYS}d -in:chats`,
    maxResults: MAX_THREADS,
  });
  const ids = (list.data.threads ?? []).map((t) => t.id!).filter(Boolean);

  const threads = await mapLimit(ids, 8, async (id) =>
    (await gmail.users.threads.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "To", "Subject"] })).data,
  );

  const out: WaitingItem[] = [];
  for (const t of threads) {
    const msgs = t.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last || last.labelIds?.includes("DRAFT")) continue;
    const h = Object.fromEntries((last.payload?.headers ?? []).map((x) => [x.name?.toLowerCase(), x.value ?? ""]));
    if (parseAddress(h["from"]).email !== self) continue; // they've replied, or it's not yours
    const to = firstRecipient(h["to"], self);
    if (!to) continue; // sent only to yourself

    out.push({
      id: `fu:${t.id}`,
      channel: "gmail",
      url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(self)}#all/${t.id}`,
      from: to,
      subject: h["subject"]?.trim() || "(no subject)",
      snippet: decodeEntities(last.snippet ?? ""),
      lastMessageAt: new Date(Number(last.internalDate ?? now.getTime())).toISOString(),
      messageCount: msgs.length,
      knownContact: msgs.some((m) => {
        const from = (m.payload?.headers ?? []).find((x) => x.name?.toLowerCase() === "from")?.value;
        return parseAddress(from).email === to.email;
      }),
      isDirect: true,
    });
  }
  return out;
}
