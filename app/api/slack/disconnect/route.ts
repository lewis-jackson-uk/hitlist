import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (session.slack) {
    // Revoke the token at Slack too, not just forget it.
    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.slack.token}` },
    }).catch(() => undefined);
  }
  session.slack = undefined;
  await session.save();
  return NextResponse.redirect(new URL("/live", req.url), { status: 303 });
}
