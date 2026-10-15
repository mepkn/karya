import { describe, expect, it } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { ticketBadge, type InboxTicket } from "./status";

const base: InboxTicket = {
  _id: "t1" as Id<"tickets">,
  jiraKey: "K-1",
  summary: "s",
  karyaStatus: "in_progress",
  archivedFromJira: false,
  bufferShieldSeconds: 3600,
  bufferUsedSeconds: 0,
};

describe("ticketBadge", () => {
  it("is on track with an untouched shield", () => expect(ticketBadge(base).label).toBe("In flight – on track"));
  it("drains once buffer is used", () => expect(ticketBadge({ ...base, bufferUsedSeconds: 900 }).tone).toBe("wrap"));
  it("is at risk when the shield is empty", () => expect(ticketBadge({ ...base, bufferUsedSeconds: 3600 }).label).toBe("At risk"));
  it("maps estimated to ready", () => expect(ticketBadge({ ...base, karyaStatus: "estimated" }).label).toBe("Ready to slice"));
});
