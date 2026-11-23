import { google } from "googleapis";
import type { GoogleAuth as OAuth2Client } from "../google";
import type { Meeting } from "../types";

const HORIZON_DAYS = 7;

/** Timed meetings with other people in the next week, excluding ones you have declined. */
export async function fetchMeetings(auth: OAuth2Client, selfEmail: string): Promise<Meeting[]> {
  const calendar = google.calendar({ version: "v3", auth });
  const self = selfEmail.toLowerCase();
  const now = new Date();
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  const meetings: Meeting[] = [];
  for (const ev of res.data.items ?? []) {
    if (!ev.start?.dateTime || ev.status === "cancelled") continue; // all-day events are not meetings
    const attendees = ev.attendees ?? [];
    const me = attendees.find((a) => a.self || a.email?.toLowerCase() === self);
    if (me?.responseStatus === "declined") continue;
    const others = attendees.filter((a) => !a.resource && !a.self && a.email && a.email.toLowerCase() !== self);
    if (others.length === 0) continue;

    meetings.push({
      id: ev.id!,
      title: ev.summary?.trim() || "(untitled meeting)",
      start: new Date(ev.start.dateTime).toISOString(),
      attendees: others.map((a) => ({ name: a.displayName || a.email!, email: a.email!.toLowerCase() })),
      hasAgenda: Boolean(ev.description?.trim()) || (ev.attachments ?? []).length > 0,
      url: ev.htmlLink ?? undefined,
    });
  }
  return meetings;
}
