import { describe, expect, it } from "vitest";
import { stripQuoted } from "@/lib/sources/parse";

describe("stripQuoted", () => {
  it("removes Gmail-style quoted history", () => {
    expect(
      stripQuoted(
        "Hi there, I have done that. Can you confirm the booking please? Many thanks, Lewis On Wed, 4 Nov 2026 at 14:12, Light Bar London <lightbarlondon@partners.collinsbookings.com> wrote: Secure your",
      ),
    ).toBe("Hi there, I have done that. Can you confirm the booking please? Many thanks, Lewis");
  });

  it("removes Outlook-style quoted history and phone signatures", () => {
    expect(stripQuoted("Sounds good. -----Original Message----- From: Ben")).toBe("Sounds good.");
    expect(stripQuoted("Yes, send it over. From: Ben Ashworth Sent: Monday To: me")).toBe("Yes, send it over.");
    expect(stripQuoted("On my way. Sent from my iPhone")).toBe("On my way.");
  });

  it("leaves normal text alone, including a message that starts with 'On'", () => {
    expect(stripQuoted("On Friday we should ship it. Thoughts?")).toBe("On Friday we should ship it. Thoughts?");
    expect(stripQuoted("Could you confirm which sites go first?")).toBe("Could you confirm which sites go first?");
  });
});
