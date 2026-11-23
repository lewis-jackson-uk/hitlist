import { google } from "googleapis";
import { NextResponse } from "next/server";
import { oauthClient } from "@/lib/google";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = await getSession();

  if (!code || !state || state !== session.oauthState) {
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const me = await google.oauth2({ version: "v2", auth: client }).userinfo.get();

  session.oauthState = undefined;
  session.email = me.data.email ?? undefined;
  session.tokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  };
  await session.save();
  return NextResponse.redirect(new URL("/live", req.url));
}
