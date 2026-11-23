import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface HitListSession {
  email?: string;
  /** OAuth CSRF state, set during login */
  oauthState?: string;
  tokens?: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  };
}

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters. See .env.example.");
  }
  return {
    password,
    cookieName: "hitlist_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

/** Tokens live only in an encrypted, httpOnly cookie. HitList has no database and stores no email content. */
export async function getSession() {
  return getIronSession<HitListSession>(await cookies(), options());
}
