import { NextResponse } from "next/server";
import { buildBrief, keyContactsFromEnv } from "@/lib/brief";
import { oauthClient } from "@/lib/google";
import { getSession } from "@/lib/session";
import { fetchMeetings } from "@/lib/sources/calendar";
import { fetchWaitingEmails } from "@/lib/sources/gmail";
import { fetchAwaitingReplies } from "@/lib/sources/gmail-sent";
import { SlackError, fetchWaitingSlack, slackClient, slackConfigured } from "@/lib/sources/slack";
import type { WaitingItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session.tokens || !session.email) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const auth = oauthClient();
  auth.setCredentials(session.tokens);
  // Google refreshes expired access tokens automatically; persist the new one.
  let refreshed = false;
  auth.on("tokens", (t) => {
    session.tokens = { ...session.tokens, ...t, refresh_token: t.refresh_token ?? session.tokens?.refresh_token };
    refreshed = true;
  });

  const warnings: string[] = [];
  let sessionChanged = false;

  // Slack is an add-on: if it fails, you still get your email and calendar.
  async function slackItems(): Promise<WaitingItem[]> {
    if (!session.slack) return [];
    try {
      return await fetchWaitingSlack(slackClient(session.slack.token), session.slack);
    } catch (err) {
      if (err instanceof SlackError && ["invalid_auth", "token_revoked", "account_inactive"].includes(err.code)) {
        session.slack = undefined;
        sessionChanged = true;
        warnings.push("Slack was disconnected. Connect it again to include Slack messages.");
      } else {
        console.error("Slack failed:", err);
        warnings.push("Couldn't read Slack this time, so this list is email only. Try refreshing.");
      }
      return [];
    }
  }

  try {
    const [emails, slack, sent, meetings] = await Promise.all([
      fetchWaitingEmails(auth, session.email),
      slackItems(),
      fetchAwaitingReplies(auth, session.email).catch((err) => {
        console.error("Sent mail failed:", err);
        warnings.push("Couldn't check your sent mail this time, so Waiting on them is empty. Try refreshing.");
        return [];
      }),
      fetchMeetings(auth, session.email),
    ]);
    const brief = await buildBrief({
      items: [...emails, ...slack],
      sent,
      meetings,
      keyContacts: keyContactsFromEnv(),
      mode: "live",
      account: session.email,
    });
    brief.sources = { gmail: true, slack: Boolean(session.slack), slackAvailable: slackConfigured() };
    brief.warnings = warnings;
    if (refreshed || sessionChanged) await session.save();
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Brief failed:", message);
    const status = /invalid_grant|unauthori[sz]ed|401/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "not_signed_in" : "fetch_failed", message }, { status });
  }
}
