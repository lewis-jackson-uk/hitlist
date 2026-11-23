import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { SLACK_USER_SCOPES, slackConfigured } from "@/lib/sources/slack";

export async function GET(req: Request) {
  const session = await getSession();
  if (!slackConfigured()) return NextResponse.redirect(new URL("/live?slack=not_configured", req.url));
  if (!session.email) return NextResponse.redirect(new URL("/api/auth/login", req.url)); // Gmail first

  session.slackState = randomBytes(16).toString("hex");
  await session.save();
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
  // User scopes only: HitList reads as you and never posts.
  url.searchParams.set("user_scope", SLACK_USER_SCOPES.join(","));
  url.searchParams.set("redirect_uri", process.env.SLACK_REDIRECT_URI!);
  url.searchParams.set("state", session.slackState);
  return NextResponse.redirect(url);
}
