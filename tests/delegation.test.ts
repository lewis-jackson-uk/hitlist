import { describe, expect, it } from "vitest";
import {
  applyDelegations,
  delegate,
  handoverBody,
  handoverUrl,
  isValidEmail,
  markHandled,
  pruneDelegations,
  takeBack,
} from "@/lib/delegation";
import type { RankedItem } from "@/lib/types";

const now = new Date("2026-11-23T11:00:00Z");

function ranked(id: string, messageCount = 2): RankedItem {
  return {
    item: {
      id,
      channel: "gmail",
      from: { name: "Priya Shah", email: "priya@halcyon.co" },
      subject: "Pilot go-live",
      snippet: "Can you confirm the mapping?",
      lastMessageAt: "2026-11-22T10:00:00Z",
      messageCount,
      knownContact: true,
      isDirect: true,
    },
    score: 80,
    tier: "key",
    reasons: ["Waiting 1 day", "Key contact"],
  };
}

describe("delegation", () => {
  it("parks a delegated item in its own section", () => {
    const d = delegate({}, ranked("a").item, "Sam@Team.co ", "", now);
    const { active, delegated } = applyDelegations([ranked("a"), ranked("b")], d, now);
    expect(active.map((r) => r.item.id)).toEqual(["b"]);
    expect(delegated[0].d.to).toBe("sam@team.co");
  });

  it("brings it back after 2 days with a check-in reason", () => {
    const d = delegate({}, ranked("a").item, "sam@team.co", "", now);
    const later = new Date("2026-11-25T09:00:00Z");
    const { active, delegated } = applyDelegations([ranked("a")], d, later);
    expect(delegated).toHaveLength(0);
    expect(active[0].reasons).toContain("Delegated to sam 2 days ago: check it's handled");
  });

  it("removes handled items and restores taken-back ones", () => {
    const d = delegate({}, ranked("a").item, "sam@team.co", "", now);
    expect(applyDelegations([ranked("a")], markHandled(d, "a"), now).active).toHaveLength(0);
    expect(applyDelegations([ranked("a")], takeBack(d, "a"), now).active).toHaveLength(1);
  });

  it("cancels itself when the sender writes again, so nothing new is hidden", () => {
    const d = markHandled(delegate({}, ranked("a").item, "sam@team.co", "", now), "a");
    const { active } = applyDelegations([ranked("a", 3)], d, now);
    expect(active).toHaveLength(1);
  });

  it("forgets delegations for threads that are no longer waiting", () => {
    const d = delegate(delegate({}, ranked("a").item, "x@y.co", "", now), ranked("gone").item, "x@y.co", "", now);
    expect(Object.keys(pruneDelegations(d, ["a"]))).toEqual(["a"]);
  });
});

describe("handover email", () => {
  it("includes the context the delegate needs and your note", () => {
    const body = handoverBody(ranked("a").item, "She's expecting a yes.");
    expect(body).toContain("Could you pick this up for me? She's expecting a yes.");
    expect(body).toContain("From: Priya Shah <priya@halcyon.co>");
    expect(body).toContain("Please reply to Priya directly and copy me in.");
    expect(body).not.toContain("—");
  });

  it("opens a Gmail draft addressed to the delegate", () => {
    const url = new URL(handoverUrl(ranked("a").item, "sam@team.co", "", "me@startup.co"));
    expect(url.hostname).toBe("mail.google.com");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("sam@team.co");
    expect(url.searchParams.get("su")).toBe("Can you take this? Pilot go-live");
    expect(url.searchParams.get("authuser")).toBe("me@startup.co");
  });

  it("validates addresses", () => {
    expect(isValidEmail("sam@team.co")).toBe(true);
    expect(isValidEmail("sam")).toBe(false);
    expect(isValidEmail("sam@team")).toBe(false);
  });
});
