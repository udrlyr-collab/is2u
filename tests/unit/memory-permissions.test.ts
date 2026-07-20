import { describe, expect, it } from "vitest";
import { canEditMemory, canRemoveMissionFromTimeline } from "@is2u/core/permissions";

describe("memory management permissions", () => {
  it("allows the recipient or completer to remove a mission from the timeline", () => {
    expect(canRemoveMissionFromTimeline({ currentUserId: "recipient", recipientId: "recipient" })).toBe(true);
    expect(canRemoveMissionFromTimeline({ currentUserId: "completer", recipientId: "recipient", memoryCreatedBy: "completer" })).toBe(true);
  });

  it("does not allow the partner to remove or edit someone else's memory", () => {
    expect(canRemoveMissionFromTimeline({ currentUserId: "partner", recipientId: "recipient", memoryCreatedBy: "recipient" })).toBe(false);
    expect(canEditMemory({ currentUserId: "partner", memoryCreatedBy: "recipient" })).toBe(false);
    expect(canEditMemory({ currentUserId: "recipient", memoryCreatedBy: "recipient" })).toBe(true);
  });
});
