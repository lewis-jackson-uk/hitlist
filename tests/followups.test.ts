import { describe, expect, it } from "vitest";
import { buildBrief } from "@/lib/brief";
import { dueForNudge, rankFollowUps, ruleFollowUp, scoreFollowUp } from "@/lib/followups";
import { firstRecipient } from "@/lib/sources/gmail-sent";
import type { Meeting, WaitingItem } from "@/lib/types";

const now = new Date("2026-11-23T11:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

function sent(over: Partial<WaitingItem> = {}): WaitingItem {
  return {
    id: "fu:1",
    channel: "gmail",
    from: { name: "Ben Ashworth", email: "ben@halcyon.co" },
    subject: "Rollout proposal",
    snippet: "Could you confirm which sites go first?",
    lastMessageAt: daysAgo(4),
    messageCount: 3,
    knownContact: true,
    isDirect: true,
    ...over,
  };
}

describe("which sent emails to chase", () => {
  it("waits two days before nudging and gives up after three weeks", () => {
    expect(dueForNudge(sent({ lastMessageAt: daysAgo(1) }), now)).toBe(false);
    expect(dueForNudge(sent({ lastMessageAt: daysAgo(3) }), now)).toBe(true);
    expect(dueForNudge(sent({ lastMessageAt: daysAgo(25) }), now)).toBe(false);
  });

  it("without Claude, only chases emails where you asked for something", () => {
    expect(ruleFollowUp({ subject: "Proposal", snippet: "Let me know your thoughts" }).level).toBe(1);
    expect(ruleFollowUp({ subject: "Re: lunch", snippet: "Thanks, see you then" }).level).toBe(0);
    const ranked = rankFollowUps(
      [sent(), sent({ id: "fu:2", subject: "Re: drinks", snippet: "Brilliant, thanks again" })],
      [],
      [],
      now,
    );
    expect(ranked.map((r) => r.item.id)).toEqual(["fu:1"]);
  });
});

describe("follow-up scoring", () => {
  it("explains itself, and suggests raising it at an upcoming meeting", () => {
    const meeting: Meeting = {
      id: "m",
      title: "Pilot review",
      start: new Date(now.getTime() + 22 * 3_600_000).toISOString(),
      attendees: [{ name: "Ben", email: "ben@halcyon.co" }],
      hasAgenda: false,
    };
    const r = scoreFollowUp(sent(), [meeting], ["halcyon.co"], now);
    expect(r.reasons[0]).toBe("No reply for 4 days");
    expect(r.reasons).toContain("Key contact");
    expect(r.reasons).toContain("Seeing them tomorrow: raise it then");
    expect(r.score).toBe(25 + 25 + 8 + 10);
  });

  it("ranks longer silence higher, all else equal", () => {
    const [first] = rankFollowUps([sent({ id: "a", lastMessageAt: daysAgo(3) }), sent({ id: "b", lastMessageAt: daysAgo(9) })], [], [], now);
    expect(first.item.id).toBe("b");
  });
});

describe("brief without Claude", () => {
  it("includes follow-ups from rules", async () => {
    const brief = await buildBrief({ items: [], sent: [sent()], meetings: [], keyContacts: [], mode: "demo", now, useClaude: false });
    expect(brief.followUps?.map((r) => r.item.id)).toEqual(["fu:1"]);
  });
});

describe("firstRecipient", () => {
  it("finds the first person you wrote to, with their name", () => {
    expect(firstRecipient('"Ben Ashworth" <ben@h.co>, Me <me@x.co>', "me@x.co")).toEqual({ name: "Ben Ashworth", email: "ben@h.co" });
    expect(firstRecipient("me@x.co, ravi@w.co", "me@x.co")).toEqual({ name: "ravi@w.co", email: "ravi@w.co" });
    expect(firstRecipient("me@x.co", "me@x.co")).toBeNull();
  });
});
