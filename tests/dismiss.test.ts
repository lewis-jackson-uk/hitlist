import { describe, expect, it } from "vitest";
import { applyDismissals, dismiss, pruneDismissals, restore } from "@/lib/dismiss";
import type { RankedItem } from "@/lib/types";

const now = new Date("2026-11-23T11:00:00Z");

function ranked(id: string, messageCount = 2): RankedItem {
  return {
    item: {
      id,
      channel: "gmail",
      from: { name: id, email: `${id}@x.co` },
      subject: "Thanks!",
      snippet: "Cheers, all good",
      lastMessageAt: "2026-11-22T10:00:00Z",
      messageCount,
      knownContact: true,
      isDirect: true,
    },
    score: 30,
    tier: "known",
    reasons: ["Waiting 1 day"],
  };
}

describe("no reply needed", () => {
  it("clears a dismissed item and lists it separately for undo", () => {
    const d = dismiss({}, ranked("a"), now);
    const { kept, dismissed } = applyDismissals([ranked("a"), ranked("b")], d);
    expect(kept.map((r) => r.item.id)).toEqual(["b"]);
    expect(dismissed.map((r) => r.item.id)).toEqual(["a"]);
  });

  it("brings it back if they write again", () => {
    const d = dismiss({}, ranked("a", 2), now);
    expect(applyDismissals([ranked("a", 3)], d).kept).toHaveLength(1);
  });

  it("can be restored", () => {
    expect(applyDismissals([ranked("a")], restore(dismiss({}, ranked("a"), now), "a")).kept).toHaveLength(1);
  });

  it("forgets conversations that have left the list", () => {
    const d = dismiss(dismiss({}, ranked("a"), now), ranked("gone"), now);
    expect(Object.keys(pruneDismissals(d, ["a"]))).toEqual(["a"]);
  });
});
