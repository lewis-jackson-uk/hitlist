import { describe, expect, it } from "vitest";
import { applyCommitments, bringBack, commitToTomorrow, prune, tomorrowKey } from "@/lib/commitments";
import type { RankedItem } from "@/lib/types";

const now = new Date("2026-11-23T11:00:00Z");

function ranked(id: string, score: number): RankedItem {
  return {
    item: {
      id,
      channel: "gmail",
      from: { name: id, email: `${id}@x.co` },
      subject: id,
      snippet: "",
      lastMessageAt: "2026-11-22T10:00:00Z",
      messageCount: 1,
      knownContact: true,
      isDirect: true,
    },
    score,
    tier: "known",
    reasons: ["Waiting 1 day"],
  };
}

describe("tomorrowKey", () => {
  it("is the next London calendar day, including across months and the clocks changing", () => {
    expect(tomorrowKey(now)).toBe("2026-11-24");
    expect(tomorrowKey(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
    // 23:30 UTC on 24 October is already 00:30 BST on 25 October in London
    expect(tomorrowKey(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-26");
  });
});

describe("hit tomorrow", () => {
  it("moves a pushed item out of today", () => {
    const c = commitToTomorrow({}, "a", now);
    const { today, later } = applyCommitments([ranked("a", 50), ranked("b", 40)], c, now);
    expect(today.map((r) => r.item.id)).toEqual(["b"]);
    expect(later.map((r) => r.item.id)).toEqual(["a"]);
  });

  it("brings it back tomorrow with 10 extra points and a reason", () => {
    const c = commitToTomorrow({}, "a", now);
    const tomorrow = new Date("2026-11-24T09:00:00Z");
    const { today } = applyCommitments([ranked("a", 35), ranked("b", 40)], c, tomorrow);
    expect(today[0].item.id).toBe("a");
    expect(today[0].score).toBe(45);
    expect(today[0].reasons).toContain("You committed to this yesterday");
  });

  it("adds 10 more for every repeat push", () => {
    let c = commitToTomorrow({}, "a", now);
    const day2 = new Date("2026-11-24T09:00:00Z");
    c = commitToTomorrow(c, "a", day2);
    const day3 = new Date("2026-11-25T09:00:00Z");
    const { today } = applyCommitments([ranked("a", 35)], c, day3);
    expect(today[0].score).toBe(55);
    expect(today[0].reasons).toContain("Pushed 2 times");
  });

  it("never pushes the score past 100", () => {
    const c = { a: { until: "2026-11-23", pushes: 5 } };
    expect(applyCommitments([ranked("a", 90)], c, now).today[0].score).toBe(100);
  });

  it("can be undone the same day", () => {
    const c = bringBack(commitToTomorrow({}, "a", now), "a", now);
    expect(c).toEqual({});
  });

  it("forgets commitments for threads you've since replied to", () => {
    const c = commitToTomorrow(commitToTomorrow({}, "a", now), "gone", now);
    expect(Object.keys(prune(c, ["a"]))).toEqual(["a"]);
  });
});
