# Owed

**Who's waiting on you, ranked.**

Owed reads your Gmail and Google Calendar and produces one list: every conversation where someone is waiting on a reply from you, ordered by who they are, how long they've waited, what they're asking for, and whether you're about to see them. Claude reads the top of the list to judge urgency from what each message actually says, and drafts a reply you can copy. Nothing is ever sent for you.

Built in a day with Claude Code, to answer a simple question every founder has at 8am: *who am I letting down right now?*

## Why

Inboxes sort by time. Founders need to sort by consequence. A board member who emailed three days ago and who you're seeing on Thursday matters more than a sales pitch from this morning, but Gmail shows them the other way round. The information needed to rank properly is already split across your inbox and your calendar; Owed joins it up.

## What it does

- **Finds what you owe.** Every inbox thread from the last 14 days where the latest message is from a real person, not you. Newsletters, receipts, notifications and anything with an unsubscribe header are filtered out.
- **Cross-references your calendar.** If you're meeting someone soon and they have an unanswered email, that thread jumps up the list. This is the part a reminder app can't do.
- **Flags meetings that need prep.** Anything in the next 48 hours with no agenda, or with attendees still waiting on you.
- **Explains every score.** Each point awarded comes with a reason ("Key contact, Board pack due Tuesday, Meeting Thursday 14:00"). The ranking is never a black box.
- **Drafts replies with Claude.** Short, British English, no invented facts: anything specific is left as a `[placeholder]` for you to fill in.

## How the score works

Out of 100. All weights live in [`lib/scoring.ts`](lib/scoring.ts).

| Signal | Points |
|---|---|
| Time waiting (under 4h to over 4 days) | 4 to 35 |
| Sender: key contact / emailed before / new | 25 / 12 / 4 |
| Urgency, judged by Claude: none / question / deadline / blocking or today | 0 / 6 / 14 / 30 |
| Meeting with sender within 24h / 3 days / 7 days | 20 / 12 / 5 |
| You're only CC'd | -8 |

Time waiting counts half for cold emails with nothing urgent in them, so old sales pitches sink rather than rise.

The pipeline runs in two passes: rank everything with cheap rules, send only the top 15 to Claude in one batched call, then re-rank with Claude's urgency. This keeps a live run to pennies.

## Design decisions

- **Read-only.** Scopes are `gmail.readonly` and `calendar.readonly`. Owed can't send, delete or change anything.
- **No database.** OAuth tokens live in an encrypted, httpOnly cookie. Email content is fetched, ranked and discarded on each request.
- **Human in the loop.** Claude drafts; you send. Email content is treated as untrusted input in the prompt, and Claude has no tool that acts on your account.
- **Graceful without Claude.** With no API key, urgency falls back to rules (deadlines, "today", decisions, questions) and the app still works.
- **Public demo mode.** Reviewers can't connect their own inbox to a stranger's app, so the home page runs the real ranking engine on a realistic sample inbox.

## Roadmap

- **Slack:** clean API, DMs and mentions fit the same "waiting on you" model.
- **WhatsApp:** deliberately left out of v1. There's no official API for personal accounts, and the unofficial libraries that scrape WhatsApp Web break its terms and risk a ban. Options are the WhatsApp Business Cloud API for a business number, or an aggregator.
- **Snooze and done**, so items you've decided to ignore stop appearing.
- **Morning digest** by email at 8am.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
npm test                     # scoring engine tests
```

The demo works with no configuration at all. To connect your own Gmail:

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services > Library:** enable the **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen:** choose External, fill in the app name and your email, add the scopes `gmail.readonly` and `calendar.readonly`, and add your own Gmail address under **Test users**. Leave the app in Testing mode; no Google verification is needed for test users.
4. **Credentials > Create credentials > OAuth client ID:** type Web application. Add `http://localhost:3000/api/auth/callback` as an authorised redirect URI (and your Vercel URL's equivalent once deployed).
5. Put the client ID and secret in `.env.local`, set `SESSION_SECRET` (`openssl rand -base64 32`), and optionally `ANTHROPIC_API_KEY` and `KEY_CONTACTS`.

## Deploy (free)

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) (Hobby plan is free).
3. Add the environment variables from `.env.example`, with `GOOGLE_REDIRECT_URI` set to `https://<your-app>.vercel.app/api/auth/callback`, and add that same URI in Google Cloud.
4. Optionally set `NEXT_PUBLIC_REPO_URL` so the footer links to the source.

## Stack

Next.js 15 (App Router), TypeScript, Google APIs, Anthropic SDK (Claude, tool use for structured output), iron-session, Vitest.

## Build log

Built with Claude Code in a single session. Every commit carries a `Co-Authored-By: Claude` trailer.

- **Scoped the problem.** Started from "what does a founder actually need at 8am", not "what can I build with an API". Chose Gmail plus Calendar for v1 because the cross-referencing is where the value is; parked WhatsApp after checking it couldn't be done within WhatsApp's terms.
- **Scoring engine first, with tests,** so the ranking logic could be checked before any UI existed.
- **Caught a ranking flaw from the demo output.** The first version ranked a developer saying "staging is down, I'm blocked until you decide" sixth, below a five-day-old accountant chase, and let an old sales pitch outrank a genuine invite just by being older. Changed urgency to a non-linear scale and halved the waiting-time weight for cold, non-urgent emails, then added tests that pin both judgements down.
- **Kept a human in the loop** by design: read-only scopes, drafts only, untrusted-input handling in the prompt.
