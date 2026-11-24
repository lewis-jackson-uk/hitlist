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
