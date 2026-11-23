"use client";

import { useState } from "react";
import type { Brief, RankedItem } from "@/lib/types";
import { WEIGHTS, humanDuration } from "@/lib/scoring";

/** Score to colour: cool slate for low, amber in the middle, crimson at the top. */
function heat(score: number): { bg: string; text: string } {
  const stops: Array<[number, [number, number, number]]> = [
    [0, [157, 180, 200]],
    [45, [232, 163, 61]],
    [80, [215, 38, 61]],
  ];
  const s = Math.max(0, Math.min(100, score));
  let rgb = stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (s <= b) {
      const t = (s - a) / (b - a);
      rgb = ca.map((c, k) => Math.round(c + (cb[k] - c) * t)) as [number, number, number];
      break;
    }
  }
  const bg = `rgb(${rgb.join(",")})`;
  // Darken for text so the number stays readable on white (WCAG AA for large text).
  const text = `rgb(${rgb.map((c) => Math.round(c * 0.72)).join(",")})`;
  return { bg, text };
}

function whenLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const fmt = (o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-GB", { timeZone: "Europe/London", ...o });
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const time = fmt({ hour: "2-digit", minute: "2-digit" });
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() + 86_400_000))) return `Tomorrow ${time}`;
  return `${fmt({ weekday: "short" })} ${time}`;
}

function Row({ r, now, defaultOpen }: { r: RankedItem; now: Date; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const h = heat(r.score);
  const waited = humanDuration(now.getTime() - new Date(r.item.lastMessageAt).getTime());
  const id = `row-${r.item.id}`;
  // The first reason is always the wait, which already has its own column.
  const reasons = r.reasons.slice(1);

  async function copy() {
    if (!r.item.draft) return;
    try {
      await navigator.clipboard.writeText(r.item.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  }

  return (
    <li className="row" style={{ ["--heat" as string]: h.bg, ["--heat-text" as string]: h.text }}>
      <span className="heat" aria-hidden="true" />
      <div>
        <button className="row-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className="score" aria-label={`Priority ${r.score} out of 100`}>{r.score}</span>
          <span>
            <span className="who">{r.item.from.name}</span>
            <span className="subject">{r.item.subject}</span>
            {reasons.length > 0 && <span className="reasons">{reasons.join(", ")}</span>}
          </span>
          <span className="waited">{waited}</span>
        </button>
        {open && (
          <div className="detail" id={id}>
            {r.item.snippet && <p className="quote">{r.item.snippet}</p>}
            {r.item.draft ? (
              <div>
                <p className="draft-label">Suggested reply</p>
                <p className="draft">{r.item.draft}</p>
              </div>
            ) : null}
            <div className="actions">
              {r.item.draft && (
                <button className="btn" onClick={copy}>
                  {copied ? "Copied" : "Copy reply"}
                </button>
              )}
              {r.item.url && (
                <a className="btn ghost" href={r.item.url} target="_blank" rel="noreferrer">
                  Open in Gmail
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export function BriefView({ brief }: { brief: Brief }) {
  const now = new Date(brief.generatedAt);
  return (
    <>
      {brief.prep.length > 0 && (
        <section className="section" aria-labelledby="prep-h">
          <h2 id="prep-h">Before your next meetings</h2>
          <p className="section-sub">The next 48 hours, where something is unprepared or unanswered.</p>
          <ul className="prep">
            {brief.prep.map((p) => (
              <li key={p.meeting.id}>
                <time dateTime={p.meeting.start}>{whenLabel(p.meeting.start, now)}</time>
                <span>
                  <span className="title">{p.meeting.title}</span>
                  <span className="why"> with {p.meeting.attendees.map((a) => a.name.split(" ")[0]).join(", ")}. {p.reasons.join(". ")}.</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="list-h">
        <h2 id="list-h">
          {brief.ranked.length} {brief.ranked.length === 1 ? "person is" : "people are"} waiting on you
        </h2>
        <p className="section-sub">
          Highest priority first. Open any line for the message and a {brief.usedClaude || brief.mode === "demo" ? "reply drafted by Claude" : "link to the thread"}.
        </p>
        {brief.ranked.length === 0 ? (
          <div className="empty">Inbox clear. Nobody in the last two weeks is waiting on a reply from you.</div>
        ) : (
          <ol className="list">
            {brief.ranked.map((r, i) => (
              <Row key={r.item.id} r={r} now={now} defaultOpen={i === 0} />
            ))}
          </ol>
        )}
      </section>

      <details className="how">
        <summary>How the ranking works</summary>
        <p>
          Each conversation where the last message is from someone else gets a score out of 100. Every point comes with a
          reason you can see, so the order is never a black box. Claude reads the top of the list to judge urgency from
          what the message actually says, and drafts a reply. Nothing is ever sent for you.
        </p>
        <table>
          <tbody>
            <tr><td>Time waiting, from under 4 hours to over 4 days</td><td>{WEIGHTS.wait.under4h} to {WEIGHTS.wait.over4d}</td></tr>
            <tr><td>Sender: key contact, someone you have emailed before, or new</td><td>{WEIGHTS.tier.key} / {WEIGHTS.tier.known} / {WEIGHTS.tier.unknown}</td></tr>
            <tr><td>Urgency in the message, judged by Claude: none, a question, a deadline, blocking or due today</td><td>{WEIGHTS.urgency.join(" / ")}</td></tr>
            <tr><td>You are meeting the sender within 24 hours, 3 days or 7 days</td><td>{WEIGHTS.meeting.within24h} / {WEIGHTS.meeting.within72h} / {WEIGHTS.meeting.within7d}</td></tr>
            <tr><td>You are only CC&apos;d</td><td>{WEIGHTS.ccPenalty}</td></tr>
          </tbody>
        </table>
        <p>
          Time waiting counts half for cold emails with nothing urgent in them, so old sales pitches sink. Newsletters,
          receipts and anything with an unsubscribe link are filtered out before scoring.
        </p>
      </details>
    </>
  );
}
