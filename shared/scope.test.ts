import { describe, expect, it } from "vitest";
import { actualTotalSeconds, standupMarkdown } from "./scope";

describe("standupMarkdown", () => {
  it("is empty with no items", () => {
    expect(standupMarkdown("AB-1", [])).toBe("");
  });

  it("groups by category in a fixed order and flattens whitespace", () => {
    const md = standupMarkdown("AB-1", [
      { note: "Null  avatar\ncrashes", category: "bug" },
      { note: "Empty list state", category: "edge_case" },
      { note: "Rename helpers", category: "refactor" },
      { note: "Timezone at midnight", category: "edge_case" },
    ]);
    expect(md).toBe(
      [
        "Follow-ups from AB-1:",
        "",
        "**Refactor/Polish**",
        "- Rename helpers",
        "",
        "**Edge case**",
        "- Empty list state",
        "- Timezone at midnight",
        "",
        "**Bug/Tech debt**",
        "- Null avatar crashes",
      ].join("\n"),
    );
  });
});

describe("actualTotalSeconds", () => {
  it("sums every slice", () => {
    expect(actualTotalSeconds([{ elapsedSeconds: 600.4 }, { elapsedSeconds: 1200 }])).toBe(1800);
  });
});
