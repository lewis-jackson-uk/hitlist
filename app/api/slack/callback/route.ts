import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = await getSession();
  const fail = (reason: string) => NextResponse.redirect(new URL(`/live?slack=${reason}`, req.url));

  if (url.searchParams.get("error")) return fail("cancelled");
  if (!code || !state || state !== session.slackState) return fail("failed");

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: process.env.SLACK_REDIRECT_URI!,
    }),
  });
  const body = await res.json();
  const token: string | undefined = body.authed_user?.access_token;
  if (!body.ok || !token) {
    console.error("Slack OAuth failed:", body.error);
    return fail("failed");
  }

  const who = await fetch("https://slack.com/api/auth.test", { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
    r.json(),
  );
  if (!who.ok) return fail("failed");

  session.slackState = undefined;
  session.slack = {
    token,
    userId: body.authed_user.id,
    teamId: body.team?.id ?? who.team_id,
    teamName: body.team?.name ?? who.team,
    teamUrl: who.url,
  };
  await session.save();
  return NextResponse.redirect(new URL("/live", req.url));
}
