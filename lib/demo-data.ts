import type { Meeting, WaitingItem } from "./types";

/**
 * A realistic founder inbox and Slack for the public demo, so reviewers can see HitList work
 * without connecting an account. All people and companies are fictional.
 * Times are relative to "now", so the demo always looks current.
 * Urgency reasons and drafts here were written by Claude using the same prompt as live mode.
 */
export const DEMO_ACCOUNT = "you@yourstartup.co";
export const DEMO_KEY_CONTACTS = ["northlight.vc", "halcyonhotels.co.uk", "zoe.marsh@gmail.com"];

const H = 3_600_000;

function ago(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * H).toISOString();
}

/** A wall-clock time in London, `days` from today. */
function londonAt(now: Date, days: number, hour: number, minute = 0): string {
  const day = new Date(now.getTime() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT" or "GMT+1"
  const hoursAhead = Number(offset?.replace("GMT", "") || 0);
  return new Date(guess.getTime() - hoursAhead * H).toISOString();
}

export function demoData(now: Date): { items: WaitingItem[]; meetings: Meeting[] } {
  const priya = { name: "Priya Shah", email: "priya@halcyonhotels.co.uk" };
  const tom = { name: "Tom Reid", email: "tom@northlight.vc" };
  const zoe = { name: "Zoe Marsh", email: "zoe.marsh@gmail.com" };
  const marta = { name: "Marta Nowak", email: "marta@nowak.dev" };

  const meetings: Meeting[] = [
    {
      id: "m-standup",
      title: "Dev check-in",
      start: new Date(now.getTime() + 3 * H).toISOString(),
      attendees: [marta],
      hasAgenda: true,
    },
    {
      id: "m-halcyon",
      title: "Halcyon pilot review",
      start: londonAt(now, 1, 10),
      attendees: [priya, { name: "Ben Ashworth", email: "ben@halcyonhotels.co.uk" }],
      hasAgenda: false,
    },
    {
      id: "m-board",
      title: "Q4 board meeting",
      start: londonAt(now, 3, 14),
      attendees: [tom, zoe],
      hasAgenda: true,
    },
    {
      id: "m-coffee",
      title: "Coffee with Callum",
      start: londonAt(now, 5, 8, 30),
      attendees: [{ name: "Callum Grant", email: "callum.grant@outlook.com" }],
      hasAgenda: false,
    },
  ];

  const items: WaitingItem[] = [
    {
      id: "d-halcyon",
      channel: "gmail",
      from: priya,
      subject: "Pilot go-live: rota import sign-off",
      snippet:
        "Hi, our ops team is ready to switch the three London sites over on Monday. Can you confirm the rota import mapping is final? Without your sign-off we'll have to push go-live a week.",
      lastMessageAt: ago(now, 50),
      messageCount: 4,
      knownContact: true,
      isDirect: true,
      urgency: { level: 3, reason: "Monday go-live blocked on your sign-off", source: "claude" },
      draft:
        "Hi Priya, thanks for chasing. The rota import mapping is final from our side, so you're clear to go live on Monday. I'll bring a one-page summary of the mapping to tomorrow's review so Ben has it too. Shout if anything looks off before then.",
    },
    {
      id: "d-staging",
      channel: "slack",
      from: marta,
      subject: "Migration failed halfway on staging. I can roll back or push a fix…",
      location: "DM",
      snippet:
        "Migration failed halfway on staging. I can roll back or push a fix, but need you to pick before I touch prod. Which do you want?",
      lastMessageAt: ago(now, 3),
      messageCount: 2,
      knownContact: true,
      isDirect: true,
      urgency: { level: 3, reason: "Developer blocked until you choose", source: "claude" },
      draft: "Roll back first so staging is stable, then push the fix once it's tested. Hold prod until our check-in this afternoon.",
    },
    {
      id: "d-launch",
      channel: "slack",
      from: { name: "Sam Patel", email: "sam@yourstartup.co" },
      subject: "Mentioned you in #product",
      location: "#product",
      snippet:
        "@you onboarding copy is ready. Do we ship it now or wait for Priya's feedback from the pilot? Need your call before I merge.",
      lastMessageAt: ago(now, 5),
      messageCount: 1,
      knownContact: true,
      isDirect: true,
      urgency: { level: 3, reason: "Release blocked on your call", source: "claude" },
      draft: "Ship it now. If Priya has edits after the pilot review we'll fold them into the next release.",
    },
    {
      id: "d-board",
      channel: "gmail",
      from: tom,
      subject: "Board pack for Thursday?",
      snippet:
        "Could you get the board pack over by Tuesday evening so Zoe and I have time to read it? Mainly keen to see pilot numbers and runway.",
      lastMessageAt: ago(now, 74),
      messageCount: 1,
      knownContact: true,
      isDirect: true,
      urgency: { level: 2, reason: "Board pack due Tuesday evening", source: "claude" },
      draft:
        "Hi Tom, yes, you'll have the pack by Tuesday evening. It'll lead with the Halcyon pilot numbers and an updated runway view. If there's anything else you want covered, let me know by [day] and I'll fold it in.",
    },
    {
      id: "d-legal",
      channel: "gmail",
      from: { name: "Daniel Price", email: "daniel@pricelegal.co.uk" },
      subject: "Updated SaaS terms: comments by Friday",
      snippet:
        "Attached is the revised customer agreement with the liability cap changes we discussed. Comments by Friday please, otherwise I'll treat this version as final.",
      lastMessageAt: ago(now, 26),
      messageCount: 3,
      knownContact: true,
      isDirect: true,
      urgency: { level: 2, reason: "Becomes final Friday without comments", source: "claude" },
      draft:
        "Thanks Daniel. I'll review the revised agreement and send any comments by Friday. If I have nothing to add, I'll confirm so you can treat this version as final.",
    },
    {
      id: "d-intro",
      channel: "gmail",
      from: { name: "Callum Grant", email: "callum.grant@outlook.com" },
      subject: "Intro: Sophie at Brightside Retail",
      snippet:
        "Sophie runs people ops for 40 stores and is struggling with seasonal hiring. Told her you'd be in touch. Over to you!",
      lastMessageAt: ago(now, 190),
      messageCount: 1,
      knownContact: true,
      isDirect: true,
      urgency: { level: 1, reason: "Warm intro going cold after a week", source: "claude" },
      draft:
        "Thanks Callum, much appreciated (moving you to BCC). Sophie, great to meet you. Seasonal hiring across 40 stores is exactly the problem we work on. Would a 20-minute call next week suit? I'm free [day/time options].",
    },
    {
      id: "d-vat",
      channel: "gmail",
      from: { name: "Mo Siddiqui", email: "mo@ledgerline.co.uk" },
      subject: "VAT return: two receipts missing",
      snippet:
        "Nearly there on the quarter. Just missing receipts for the two AWS invoices in October. Can you send them over before the end of the month?",
      lastMessageAt: ago(now, 140),
      messageCount: 2,
      knownContact: true,
      isDirect: true,
      urgency: { level: 2, reason: "Receipts needed before month end", source: "claude" },
      draft:
        "Hi Mo, sorry for the delay. I'll send both October AWS receipts over by [day]. Let me know if anything else is outstanding for the quarter.",
    },
    {
      id: "d-candidate",
      channel: "gmail",
      from: { name: "Hannah Okafor", email: "hannah.okafor@gmail.com" },
      subject: "Following up: Operations Lead role",
      snippet:
        "Really enjoyed our chat last week. I wanted to check on timelines, as I have another process moving to final round. Is there anything else you need from me?",
      lastMessageAt: ago(now, 98),
      messageCount: 3,
      knownContact: true,
      isDirect: true,
      urgency: { level: 2, reason: "Strong candidate has a competing offer", source: "claude" },
      draft:
        "Hi Hannah, thanks for the nudge and for being upfront about the other process. We'd like to move you to the next stage. Could you do [day/time] for a final conversation? I'll confirm timelines on that call.",
    },
    {
      id: "d-zoe",
      channel: "gmail",
      from: zoe,
      subject: "Re: Hiring plan for Q1",
      snippet: "Looks sensible. Do you want me to make an intro to the recruiter I mentioned, or hold until after the board?",
      lastMessageAt: ago(now, 30),
      messageCount: 5,
      knownContact: true,
      isDirect: true,
      urgency: { level: 1, reason: "Offer of a recruiter intro", source: "claude" },
      draft:
        "Thanks Zoe. Hold until after the board on Thursday, then I'd love the intro once the Q1 plan is signed off.",
    },
    {
      id: "d-brand",
      channel: "gmail",
      from: { name: "Jess Lin", email: "jess@studiolin.design" },
      subject: "Re: Brand refresh feedback",
      snippet: "Round two of the logo options attached. Happy to go with whichever the team prefers.",
      lastMessageAt: ago(now, 20),
      messageCount: 6,
      knownContact: true,
      isDirect: false,
      urgency: { level: 0, reason: "Waiting on the team's choice", source: "claude" },
      draft: "Thanks Jess, these are great. I'll let the team weigh in first and we'll come back with one choice by [day].",
    },
    {
      id: "d-podcast",
      channel: "gmail",
      from: { name: "Ella Brooks", email: "ella@thehiringshow.fm" },
      subject: "Podcast invite: hospitality hiring episode",
      snippet: "We'd love to have you on to talk about hiring in hospitality. Recording slots open in January if you're interested?",
      lastMessageAt: ago(now, 52),
      messageCount: 1,
      knownContact: false,
      isDirect: true,
      urgency: { level: 1, reason: "Optional invite, no deadline", source: "claude" },
      draft: "Hi Ella, thanks for thinking of me. I'd be glad to join. Could you send over the January slots and I'll pick one?",
    },
    {
      id: "d-cold",
      channel: "gmail",
      from: { name: "Alex Moreno", email: "alex@growthly.io" },
      subject: "Quick question about your outbound",
      snippet: "Saw you're hiring. We help startups 3x outbound pipeline in 30 days. Worth a quick call?",
      lastMessageAt: ago(now, 96),
      messageCount: 1,
      knownContact: false,
      isDirect: true,
      urgency: { level: 0, reason: "Sales pitch, safe to ignore", source: "claude" },
      draft: "Hi Alex, thanks for reaching out. Not a priority for us right now, but I'll get in touch if that changes.",
    },
  ];

  return { items, meetings };
}
