import { describe, expect, it } from "vitest";
import { cleanSlackText, fetchWaitingSlack, type SlackCall } from "@/lib/sources/slack";

const ME = "UME";
const now = new Date("2026-11-23T12:00:00Z");
const ts = (hoursAgo: number, n = 0) => `${Math.floor(now.getTime() / 1000) - hoursAgo * 3600}.00010${n}`;

const users: Record<string, any> = {
  UMARTA: { real_name: "Marta Nowak", profile: { email: "marta@nowak.dev" } },
  USAM: { real_name: "Sam Patel", profile: { email: "Sam@YourStartup.co" } },
  UBOT: { real_name: "Deploy Bot", is_bot: true, profile: {} },
  UME: { real_name: "Me", profile: { email: "me@startup.co" } },
};

/** A small fake workspace. */
function fakeSlack(overrides: Partial<Record<string, any>> = {}): SlackCall {
  const data: Record<string, any> = {
    "users.conversations": {
      channels: [
        { id: "D1", is_im: true, user: "UMARTA" }, // Marta wrote last: waiting
        { id: "D2", is_im: true, user: "USAM" }, // I replied last: not waiting
        { id: "D3", is_im: true, user: "UBOT" }, // bot: ignored
      ],
    },
    "conversations.history:D1": {
      messages: [
        { ts: ts(2), user: "UMARTA", text: "Staging is down. Roll back or fix forward, <@UME>?" },
        { ts: ts(3), user: "UMARTA", text: "Deploy started" },
        { ts: ts(5), user: ME, text: "Go for it" },
      ],
    },
    "conversations.history:D2": {
      messages: [
        { ts: ts(1), user: ME, text: "Thanks!" },
        { ts: ts(2), user: "USAM", text: "Done" },
      ],
    },
    "search.messages": {
      messages: {
        matches: [
          {
            ts: ts(4),
            user: "USAM",
            text: "<@UME> ship the onboarding copy today? <https://docs.co/x|draft here>",
            permalink: "https://team.slack.com/archives/C1/p123",
            channel: { id: "C1", name: "product" },
          },
          {
            ts: ts(6, 1),
            user: "USAM",
            text: "<@UME> answered already",
            permalink: `https://team.slack.com/archives/C2/p456?thread_ts=${ts(7)}`,
            channel: { id: "C2", name: "ops" },
          },
        ],
      },
    },
    "conversations.replies:C1": { messages: [{ ts: ts(4), user: "USAM" }] },
    "conversations.history:C1": { messages: [{ ts: ts(3), user: "USAM", text: "?" }] },
    "conversations.replies:C2": { messages: [{ ts: ts(7), user: "USAM" }, { ts: ts(5), user: ME, text: "On it" }] },
    ...overrides,
  };
  return async (method, params = {}) => {
    if (method === "users.info") return { user: users[String(params.user)] ?? { real_name: "?" } };
    const key = params.channel ? `${method}:${params.channel}` : method;
    if (!(key in data)) throw new Error(`unexpected call ${key}`);
    return data[key];
  };
}

describe("fetchWaitingSlack", () => {
  it("finds DMs and mentions you owe a reply to, and skips the rest", async () => {
    const items = await fetchWaitingSlack(fakeSlack(), { userId: ME, teamUrl: "https://team.slack.com/" }, now);
    expect(items.map((i) => i.id).sort()).toEqual([`slack:C1:${ts(4)}`, "slack:D1"]);
  });

  it("builds a DM item from the newest unanswered message", async () => {
    const [dm] = (await fetchWaitingSlack(fakeSlack(), { userId: ME, teamUrl: "https://team.slack.com/" }, now)).filter(
      (i) => i.id === "slack:D1",
    );
    expect(dm.from).toEqual({ name: "Marta Nowak", email: "marta@nowak.dev" });
    expect(dm.snippet).toBe("Staging is down. Roll back or fix forward, @Me?");
    expect(dm.subject).toBe("Staging is down. Roll back or fix forward, @Me?");
    expect(dm.messageCount).toBe(2); // two messages since my last reply
    expect(dm.url).toBe(`https://team.slack.com/archives/D1/p${ts(2).replace(".", "")}`);
  });

  it("labels channel mentions and lowercases emails so the calendar boost matches", async () => {
    const items = await fetchWaitingSlack(fakeSlack(), { userId: ME, teamUrl: "https://team.slack.com/" }, now);
    const mention = items.find((i) => i.id.startsWith("slack:C1"))!;
    expect(mention.subject).toBe("Mentioned you in #product");
    expect(mention.from.email).toBe("sam@yourstartup.co");
    expect(mention.snippet).toBe("@Me ship the onboarding copy today? draft here");
  });

  it("drops a mention once you reply straight after it in the channel", async () => {
    const call = fakeSlack({
      "conversations.history:C1": { messages: [{ ts: ts(3), user: ME, text: "Yes, ship it" }] },
    });
    const items = await fetchWaitingSlack(call, { userId: ME, teamUrl: "https://team.slack.com/" }, now);
    expect(items.some((i) => i.id.startsWith("slack:C1"))).toBe(false);
  });

  it("still returns DMs if search is unavailable", async () => {
    const call = fakeSlack();
    const failingSearch: SlackCall = async (m, p) => {
      if (m === "search.messages") throw new Error("missing_scope");
      return call(m, p);
    };
    const items = await fetchWaitingSlack(failingSearch, { userId: ME, teamUrl: "https://team.slack.com/" }, now);
    expect(items.map((i) => i.id)).toEqual(["slack:D1"]);
  });
});

describe("cleanSlackText", () => {
  it("makes Slack markup readable", () => {
    const names = new Map([["U1", "Zoe"]]);
    expect(cleanSlackText("<@U1> see <#C9|general> &amp; <!here> <https://a.co|this>", names)).toBe(
      "@Zoe see #general & @here this",
    );
  });
});
