import { describe, expect, it } from "vitest";
import { humanDuration, prepFlags, rank, scoreItem, senderTier } from "@/lib/scoring";
import { ruleUrgency } from "@/lib/urgency-rules";
import type { Meeting, WaitingItem } from "@/lib/types";

const now = new Date("2026-11-23T11:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

function item(over: Partial<WaitingItem> = {}): WaitingItem {
  return {
    id: "t1",
    channel: "gmail",
    from: { name: "Zoe", email: "zoe@board.co" },
    subject: "Catch up",
    snippet: "Hope all is well",
    lastMessageAt: hoursAgo(30),
    messageCount: 1,
    knownContact: true,
    isDirect: true,
    ...over,
  };
}

function meeting(over: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    title: "Board sync",
    start: hoursAhead(20),
    attendees: [{ name: "Zoe", email: "zoe@board.co" }],
    hasAgenda: true,
    ...over,
  };
}

describe("senderTier", () => {
  it("matches key contacts by full email or by domain", () => {
    expect(senderTier(item(), ["zoe@board.co"])).toBe("key");
    expect(senderTier(item(), ["board.co"])).toBe("key");
    expect(senderTier(item(), ["other.co"])).toBe("known");
    expect(senderTier(item({ knownContact: false }), [])).toBe("unknown");
  });

  it("does not treat a domain as matching a different domain that contains it", () => {
    expect(senderTier(item({ from: { name: "X", email: "x@notboard.co" } }), ["board.co"])).not.toBe("key");
  });
});

describe("ruleUrgency", () => {
  it("is zero for plain updates", () => {
    expect(ruleUrgency({ subject: "Newsletter", snippet: "Here is our monthly update" }).level).toBe(0);
  });
  it("spots questions, deadlines and same-day asks", () => {
    expect(ruleUrgency({ subject: "Quick one", snippet: "Are you free next week?" }).level).toBe(1);
    expect(ruleUrgency({ subject: "Contract", snippet: "Can you send it back by Friday" }).level).toBe(2);
    expect(ruleUrgency({ subject: "URGENT", snippet: "need this today" }).level).toBe(3);
  });
  it("treats a decision with a deadline as top urgency", () => {
    expect(ruleUrgency({ subject: "Offer", snippet: "Please approve by Thursday" }).level).toBe(3);
  });
});

describe("scoreItem", () => {
  it("ranks an older wait above a newer one, all else equal", () => {
    const fresh = scoreItem(item({ lastMessageAt: hoursAgo(2) }), [], [], now);
    const stale = scoreItem(item({ lastMessageAt: hoursAgo(120) }), [], [], now);
    expect(stale.score).toBeGreaterThan(fresh.score);
    expect(stale.reasons[0]).toBe("Waiting 5 days");
  });

  it("boosts a thread when you are meeting the sender soon, and says why", () => {
    const without = scoreItem(item(), [], [], now);
    const withMeeting = scoreItem(item(), [meeting()], [], now);
    expect(withMeeting.score - without.score).toBe(20);
    expect(withMeeting.reasons.some((r) => r.startsWith("Meeting tomorrow") || r.startsWith("Meeting today"))).toBe(true);
    expect(withMeeting.meeting?.id).toBe("m1");
  });

  it("ignores past meetings", () => {
    const r = scoreItem(item(), [meeting({ start: hoursAgo(3) })], [], now);
    expect(r.meeting).toBeUndefined();
  });

  it("penalises CC-only threads", () => {
    const direct = scoreItem(item(), [], [], now);
    const cc = scoreItem(item({ isDirect: false }), [], [], now);
    expect(direct.score - cc.score).toBe(8);
    expect(cc.reasons).toContain("You're only CC'd");
  });

  it("prefers Claude's urgency over rules when present", () => {
    const r = scoreItem(
      item({ snippet: "no question here", urgency: { level: 3, reason: "Investor needs answer today", source: "claude" } }),
      [],
      [],
      now,
    );
    expect(r.reasons).toContain("Investor needs answer today");
  });

  it("keeps scores within 0 to 100", () => {
    const max = scoreItem(
      item({ lastMessageAt: hoursAgo(500), snippet: "URGENT approve today?" }),
      [meeting({ start: hoursAhead(1) })],
      ["board.co"],
      now,
    );
    expect(max.score).toBeLessThanOrEqual(100);
  });
});

describe("rank", () => {
  it("puts a key contact you are meeting tomorrow above an unknown cold email", () => {
    const ranked = rank(
      [
        item({ id: "cold", from: { name: "Vendor", email: "sales@vendor.io" }, knownContact: false, lastMessageAt: hoursAgo(100) }),
        item({ id: "zoe", lastMessageAt: hoursAgo(26) }),
      ],
      [meeting()],
      ["board.co"],
      now,
    );
    expect(ranked.map((r) => r.item.id)).toEqual(["zoe", "cold"]);
  });
});

describe("ranking judgement", () => {
  it("puts a fresh blocker above an old routine request", () => {
    const ranked = rank(
      [
        item({ id: "old", from: { name: "Mo", email: "mo@accounts.co" }, lastMessageAt: hoursAgo(130), urgency: { level: 2, reason: "Due month end", source: "claude" } }),
        item({ id: "blocker", lastMessageAt: hoursAgo(3), urgency: { level: 3, reason: "Blocked on you", source: "claude" } }),
      ],
      [meeting({ attendees: [{ name: "Zoe", email: "zoe@board.co" }], start: hoursAhead(4) })],
      [],
      now,
    );
    expect(ranked[0].item.id).toBe("blocker");
  });

  it("sinks old cold pitches below a recent genuine first-contact question", () => {
    const ranked = rank(
      [
        item({ id: "pitch", from: { name: "A", email: "a@sales.io" }, knownContact: false, lastMessageAt: hoursAgo(96), urgency: { level: 0, source: "claude" } }),
        item({ id: "invite", from: { name: "E", email: "e@show.fm" }, knownContact: false, lastMessageAt: hoursAgo(50), urgency: { level: 1, reason: "Invite", source: "claude" } }),
      ],
      [],
      [],
      now,
    );
    expect(ranked.map((r) => r.item.id)).toEqual(["invite", "pitch"]);
  });
});

describe("prepFlags", () => {
  it("flags meetings in the next 48h with no agenda or open threads from attendees", () => {
    const flags = prepFlags(
      [
        meeting({ id: "a", hasAgenda: false }),
        meeting({ id: "b", start: hoursAhead(30), attendees: [{ name: "Sam", email: "sam@x.co" }] }),
        meeting({ id: "c", start: hoursAhead(100), hasAgenda: false }),
      ],
      [item()],
      now,
    );
    expect(flags.map((f) => f.meeting.id)).toEqual(["a"]);
    expect(flags[0].reasons).toEqual(["No agenda", "1 unanswered thread from attendees"]);
  });
});

describe("humanDuration", () => {
  it("reads naturally", () => {
    expect(humanDuration(30 * 60_000)).toBe("under an hour");
    expect(humanDuration(3_600_000)).toBe("1 hour");
    expect(humanDuration(49 * 3_600_000)).toBe("2 days");
  });
});
