# HitList

**Who you need to hit up next.**

HitList reads your Gmail, Slack and Google Calendar and produces one list: every conversation where someone is waiting on a reply from you, ordered by who they are, how long they've waited, what they're asking for, and whether you're about to see them. Claude reads the top of the list to judge urgency from what each message actually says, and drafts a reply you can copy. Nothing is ever sent for you.

Built in a day with Claude Code, to answer a simple question every founder has at 8am: *who am I letting down right now?*

## Why

Inboxes sort by time. Founders need to sort by consequence. A board member who emailed three days ago and who you're seeing on Thursday matters more than a sales pitch from this morning, but Gmail shows them the other way round. The information needed to rank properly is already split across your inbox and your calendar; HitList joins it up.

## What it does

- **Finds what you owe.** Every inbox thread from the last 14 days where the latest message is from a real person, not you. Newsletters, receipts, notifications and anything with an unsubscribe header are filtered out.
- **Includes Slack.** DMs and group DMs where someone spoke after you, and @mentions in channels you haven't replied to. Slack profiles carry email addresses, so the calendar boost works across channels: a Slack DM from someone you're meeting tomorrow ranks like an email from them would. Claude drafts Slack replies short and chat-style.
- **Cross-references your calendar.** If you're meeting someone soon and they have an unanswered email, that thread jumps up the list. This is the part a reminder app can't do.
- **Flags meetings that need prep.** Anything in the next 48 hours with no agenda, or with attendees still waiting on you.
- **Explains every score.** Each point awarded comes with a reason ("Key contact, Board pack due Tuesday, Meeting Thursday 14:00"). The ranking is never a black box.
- **Waiting on them.** The reverse list: emails you sent that still have no reply after two days. Claude decides which ones actually need chasing ("thanks, see you then" doesn't) and drafts a nudge that's specific rather than "just checking in". If you're meeting them soon, it suggests raising it there instead. Without Claude, only emails where you asked a question or made a request are kept.
- **No reply needed.** One click clears a "thanks!" or an FYI. If they write again, it comes straight back. Cleared items can be restored.
- **Hit tomorrow.** Not doing it today? Push it to tomorrow and it moves off today's list. It comes back the next day with 10 extra points, because you made a commitment, and another 10 for every further push, so repeated delays get harder to ignore. Commitments are saved in your browser.
- **Delegate.** Hand an item to a colleague: HitList opens a Gmail draft to them with the sender, subject, message and your note, asking them to reply directly and copy you in. Because the handover is an ordinary email, it lands on *their* HitList automatically, with no shared database needed. On your side the item moves to a Delegated section and comes back after 2 days with "check it's handled". Mark handled clears it; if the sender writes again, it comes straight back.
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
| Pushed with Hit tomorrow, per push | +10 |

**Waiting on them** uses the same idea in reverse: silence (15 / 25 / 30 for under 4 days, under 7, over 7), who they are (key 25, known 12, new 8), how much it matters as judged by Claude (0 / 8 / 16 / 25), and +10 if you're seeing them within a week.

Time waiting counts half for cold emails with nothing urgent in them, so old sales pitches sink rather than rise.

The pipeline runs in two passes: rank everything with cheap rules, send only the top 15 to Claude in one batched call, then re-rank with Claude's urgency. This keeps a live run to pennies.

## Design decisions

- **Read-only.** Scopes are `gmail.readonly` and `calendar.readonly`, and Slack uses read-only user scopes with no bot. HitList can't send, post, delete or change anything. Disconnecting Slack revokes the token at Slack, not just in HitList.
- **No database.** OAuth tokens live in an encrypted, httpOnly cookie. Email content is fetched, ranked and discarded on each request.
- **Human in the loop.** Claude drafts; you send. Email content is treated as untrusted input in the prompt, and Claude has no tool that acts on your account.
- **Graceful without Claude.** With no API key, urgency falls back to rules (deadlines, "today", decisions, questions) and the app still works.
- **Public demo mode.** Reviewers can't connect their own inbox to a stranger's app, so the home page runs the real ranking engine on a realistic sample inbox.

## Roadmap

- **WhatsApp:** deliberately left out of v1. There's no official API for personal accounts, and the unofficial libraries that scrape WhatsApp Web break its terms and risk a ban. Options are the WhatsApp Business Cloud API for a business number, or an aggregator.
- **Waiting on them for Slack**, for messages you sent that went unanswered.
- **Sync commitments and delegations across devices** (currently saved per browser).
- **True forwarding** with the full thread and attachments, which needs Gmail's compose permission rather than read-only.
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

### Add Slack (optional, about 10 minutes)

Slack is added after Gmail. Slack requires HTTPS for sign-in, so do this against your deployed Vercel URL.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) > **Create New App** > From scratch. Pick your own workspace.
2. **OAuth & Permissions:**
   - Add the redirect URL `https://<your-app>.vercel.app/api/slack/callback`.
   - Under **User Token Scopes** (not Bot), add: `im:read`, `im:history`, `mpim:read`, `mpim:history`, `channels:history`, `groups:history`, `users:read`, `users:read.email`, `search:read`.
3. **Basic Information:** copy the Client ID and Client Secret into Vercel as `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`, set `SLACK_REDIRECT_URI` to the URL above, and redeploy.
4. Open `/live` and click **Connect Slack**.

Because the app is built for and installed in your own workspace, it keeps Slack's normal rate limits. Slack's 2025 limits on message history apply to apps distributed to other workspaces outside the Slack Marketplace, so a multi-workspace version would need Marketplace approval or a cache.

## Deploy (free)

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) (Hobby plan is free).
3. Add the environment variables from `.env.example`, with `GOOGLE_REDIRECT_URI` set to `https://<your-app>.vercel.app/api/auth/callback`, and add that same URI in Google Cloud.
4. Optionally set `NEXT_PUBLIC_REPO_URL` so the footer links to the source.

## Stack

Next.js 15 (App Router), TypeScript, Google APIs, Slack Web API, Anthropic SDK (Claude, tool use for structured output), iron-session, Vitest.

## Build log

Built with Claude Code in a single session. Every commit carries a `Co-Authored-By: Claude` trailer.

- **Scoped the problem.** Started from "what does a founder actually need at 8am", not "what can I build with an API". Chose Gmail plus Calendar for v1 because the cross-referencing is where the value is; parked WhatsApp after checking it couldn't be done within WhatsApp's terms.
- **Scoring engine first, with tests,** so the ranking logic could be checked before any UI existed.
- **Caught a ranking flaw from the demo output.** The first version ranked a developer saying "staging is down, I'm blocked until you decide" sixth, below a five-day-old accountant chase, and let an old sales pitch outrank a genuine invite just by being older. Changed urgency to a non-linear scale and halved the waiting-time weight for cold, non-urgent emails, then added tests that pin both judgements down.
- **Kept a human in the loop** by design: read-only scopes, drafts only, untrusted-input handling in the prompt.
