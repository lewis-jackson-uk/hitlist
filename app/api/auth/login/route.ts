import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, googleConfigured } from "@/lib/google";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/?error=not_configured", req.url));
  }
  const session = await getSession();
  session.oauthState = randomBytes(16).toString("hex");
  await session.save();
  return NextResponse.redirect(authUrl(session.oauthState));
}
