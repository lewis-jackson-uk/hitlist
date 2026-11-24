import { describe, expect, it } from "vitest";
import { describeClaudeError } from "@/lib/claude";

describe("describeClaudeError", () => {
  it("explains common failures in plain English", () => {
    expect(describeClaudeError(Object.assign(new Error("invalid x-api-key"), { status: 401 }))).toContain("API key was rejected");
    expect(describeClaudeError(Object.assign(new Error("Your credit balance is too low"), { status: 400 }))).toContain("no credit");
    expect(describeClaudeError(Object.assign(new Error("model not found"), { status: 404 }))).toContain("model wasn't found");
  });

  it("never echoes an API key", () => {
    expect(describeClaudeError(new Error("bad key sk-ant-api03-abcDEF_123"))).not.toContain("sk-ant-api03");
  });
});

import { extractResults } from "@/lib/claude";

describe("extractResults", () => {
  it("reads a tool call", () => {
    expect(extractResults([{ type: "tool_use", input: { results: [{ id: "a" }] } }])).toEqual([{ id: "a" }]);
  });
  it("falls back to JSON in text, with or without a code fence", () => {
    expect(extractResults([{ type: "text", text: 'Here you go:\n```json\n{"results":[{"id":"b"}]}\n```' }])).toEqual([{ id: "b" }]);
    expect(extractResults([{ type: "text", text: '[{"id":"c"}]' }])).toEqual([{ id: "c" }]);
  });
  it("returns nothing for unusable replies", () => {
    expect(extractResults([{ type: "text", text: "Sorry, I can't help with that." }])).toEqual([]);
  });
});
