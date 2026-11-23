import { NextResponse } from "next/server";
import { buildBrief, keyContactsFromEnv } from "@/lib/brief";
import { oauthClient } from "@/lib/google";
import { getSession } from "@/lib/session";
import { fetchMeetings } from "@/lib/sources/calendar";
import { fetchWaitingEmails } from "@/lib/sources/gmail";

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

  try {
    const [items, meetings] = await Promise.all([
      fetchWaitingEmails(auth, session.email),
      fetchMeetings(auth, session.email),
    ]);
    const brief = await buildBrief({
      items,
      meetings,
      keyContacts: keyContactsFromEnv(),
      mode: "live",
      account: session.email,
    });
    if (refreshed) await session.save();
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Brief failed:", message);
    const status = /invalid_grant|unauthori[sz]ed|401/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "not_signed_in" : "fetch_failed", message }, { status });
  }
}
