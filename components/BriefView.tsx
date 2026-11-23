"use client";

import { useEffect, useState, type FormEvent } from "react";
import { COMMITMENT_BONUS, applyCommitments, bringBack, commitToTomorrow, prune, type Commitments } from "@/lib/commitments";
import {
  FOLLOW_UP_DAYS,
  applyDelegations,
  delegate,
  handoverUrl,
  isValidEmail,
  markHandled,
  pruneDelegations,
  takeBack,
  type Delegations,
} from "@/lib/delegation";
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

function DelegateForm({
  r,
  account,
  recent,
  onDelegate,
  onCancel,
}: {
  r: RankedItem;
  account?: string;
  recent: string[];
  onDelegate: (to: string, note: string) => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(recent[0] ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const formId = `delegate-${r.item.id}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(to)) {
      setError("Enter an email address, like sam@yourteam.co");
      return;
    }
    window.open(handoverUrl(r.item, to, note, account), "_blank", "noopener");
    onDelegate(to, note);
  }

  return (
    <form className="delegate" onSubmit={submit} noValidate>
      <label htmlFor={`${formId}-to`}>Delegate to</label>
      <input
        id={`${formId}-to`}
        type="email"
        list={`${formId}-recent`}
        value={to}
        onChange={(e) => { setTo(e.target.value); setError(""); }}
        placeholder="sam@yourteam.co"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${formId}-err` : undefined}
        autoFocus
      />
      <datalist id={`${formId}-recent`}>
        {recent.map((e) => <option key={e} value={e} />)}
      </datalist>
      <label htmlFor={`${formId}-note`}>Note (optional)</label>
      <input
        id={`${formId}-note`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="She's expecting a yes by Monday."
      />
      {error && <p className="field-error" id={`${formId}-err`}>{error}</p>}
      <p className="hint">Opens a Gmail draft with the context filled in. You press send.</p>
      <div className="actions">
        <button className="btn" type="submit">Draft handover email</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Row({
  r,
  now,
  defaultOpen,
  account,
  recentDelegates,
  onHitTomorrow,
  onDelegate,
}: {
  r: RankedItem;
  now: Date;
  defaultOpen: boolean;
  account?: string;
  recentDelegates: string[];
  onHitTomorrow: () => void;
  onDelegate: (to: string, note: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [delegating, setDelegating] = useState(false);
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
            <span className="via">{r.item.channel === "slack" ? "Slack" : "Email"}</span>
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
                  {r.item.channel === "slack" ? "Open in Slack" : "Open in Gmail"}
                </a>
              )}
              <button className="btn ghost" onClick={onHitTomorrow}>
                Hit tomorrow
              </button>
              {!delegating && (
                <button className="btn ghost" onClick={() => setDelegating(true)}>
                  Delegate
                </button>
              )}
            </div>
            {delegating && (
              <DelegateForm
                r={r}
                account={account}
                recent={recentDelegates}
                onDelegate={onDelegate}
                onCancel={() => setDelegating(false)}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Commitments, delegations and recent delegates live in this browser only (HitList has no database).
 * Keyed per account so a demo visit never mixes with your real inbox.
 */
function useStored<T>(name: string, brief: Brief, seed: T, clean: (v: T) => T) {
  const key = `hitlist:${name}:${brief.mode}:${brief.account ?? ""}`;
  const [all, setAll] = useState<T>(seed);

  useEffect(() => {
    let stored: Partial<T> = {};
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      /* storage unavailable or corrupted; start fresh */
    }
    setAll(clean(Array.isArray(seed) ? ((Array.isArray(stored) ? stored : seed) as T) : ({ ...seed, ...stored } as T)));
    // seed and clean are static per page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, brief.ranked]);

  function update(next: T) {
    setAll(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* private browsing: still works for this visit */
    }
  }
  return [all, update] as const;
}

export function BriefView({
  brief,
  seed = {},
  seedDelegations = {},
}: {
  brief: Brief;
  seed?: Commitments;
  seedDelegations?: Delegations;
}) {
  const now = new Date(brief.generatedAt);
  const ids = brief.ranked.map((r) => r.item.id);
  const [commitments, setCommitments] = useStored<Commitments>("commitments", brief, seed, (c) => prune(c, ids));
  const [delegations, setDelegations] = useStored<Delegations>("delegations", brief, seedDelegations, (d) =>
    pruneDelegations(d, ids),
  );
  const [recent, setRecent] = useStored<string[]>(
    "delegates",
    brief,
    [...new Set(Object.values(seedDelegations).map((d) => d.to))],
    (r) => r.slice(0, 8),
  );
  // Live mode opens drafts in your account; the demo has no real account to point at.
  const account = brief.mode === "live" ? brief.account : undefined;

  const { active, delegated } = applyDelegations(brief.ranked, delegations, now);
  const { today, later } = applyCommitments(active, commitments, now);

  function handOver(r: RankedItem, to: string, note: string) {
    setDelegations(delegate(delegations, r.item, to, note, now));
    const email = to.trim().toLowerCase();
    setRecent([email, ...recent.filter((e) => e !== email)].slice(0, 8));
  }
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
          {today.length} {today.length === 1 ? "person is" : "people are"} waiting on you
        </h2>
        {brief.warnings?.map((w) => (
          <p className="banner error" key={w}>{w}</p>
        ))}
        <p className="section-sub">
          Highest priority first. Open any line for the message and a {brief.usedClaude || brief.mode === "demo" ? "reply drafted by Claude" : "link to the thread"}.
        </p>
        {today.length === 0 ? (
          <div className="empty">
            {later.length > 0
              ? "Nothing left for today. Everything else is on tomorrow's list."
              : "Inbox clear. Nobody in the last two weeks is waiting on a reply from you."}
          </div>
        ) : (
          <ol className="list">
            {today.map((r, i) => (
              <Row
                key={r.item.id}
                r={r}
                now={now}
                defaultOpen={i === 0}
                account={account}
                recentDelegates={recent}
                onHitTomorrow={() => setCommitments(commitToTomorrow(commitments, r.item.id, now))}
                onDelegate={(to, note) => handOver(r, to, note)}
              />
            ))}
          </ol>
        )}
      </section>

      {later.length > 0 && (
        <section className="section" aria-labelledby="later-h">
          <h2 id="later-h">Hitting tomorrow</h2>
          <p className="section-sub">
            Each one comes back tomorrow with 10 extra points for every time you&apos;ve pushed it.
          </p>
          <ul className="later">
            {later.map((r) => (
              <li key={r.item.id}>
                <span>
                  <span className="who">{r.item.from.name}</span>
                  <span className="subject">{r.item.subject}</span>
                </span>
                <button className="btn ghost" onClick={() => setCommitments(bringBack(commitments, r.item.id, now))}>
                  Move back to today
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {delegated.length > 0 && (
        <section className="section" aria-labelledby="delegated-h">
          <h2 id="delegated-h">Delegated</h2>
          <p className="section-sub">
            Each one comes back to your list after {FOLLOW_UP_DAYS} days so you can check it was handled. If the sender
            writes again, it comes straight back.
          </p>
          <ul className="later">
            {delegated.map(({ r, d, daysAgo }) => (
              <li key={r.item.id}>
                <span>
                  <span className="who">{r.item.from.name}</span>
                  <span className="subject">{r.item.subject}</span>
                  <span className="with">
                    With {d.to} {daysAgo === 0 ? "since today" : `for ${daysAgo} day${daysAgo === 1 ? "" : "s"}`}
                  </span>
                </span>
                <span className="actions">
                  <button className="btn ghost" onClick={() => setDelegations(markHandled(delegations, r.item.id))}>
                    Mark handled
                  </button>
                  <button className="btn ghost" onClick={() => setDelegations(takeBack(delegations, r.item.id))}>
                    Take back
                  </button>
                  <a className="btn ghost" href={handoverUrl(r.item, d.to, d.note ?? "", account)} target="_blank" rel="noreferrer">
                    Redraft email
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            <tr><td>You pushed it to today with Hit tomorrow, per push</td><td>+{COMMITMENT_BONUS}</td></tr>
          </tbody>
        </table>
        <p>
          Time waiting counts half for cold emails with nothing urgent in them, so old sales pitches sink. Newsletters,
          receipts and anything with an unsubscribe link are filtered out before scoring. Delegated items leave the
          list and come back after {FOLLOW_UP_DAYS} days for a check-in.
        </p>
      </details>
    </>
  );
}
