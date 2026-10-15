import { describe, expect, it } from "vitest";
import { adfToText, type AdfNode } from "./adf";

const doc = (...content: AdfNode[]): AdfNode => ({ type: "doc", content });
const p = (...content: AdfNode[]): AdfNode => ({ type: "paragraph", content });
const t = (text: string, marks?: AdfNode["marks"]): AdfNode => ({ type: "text", text, marks });
const li = (...content: AdfNode[]): AdfNode => ({ type: "listItem", content });

describe("adfToText", () => {
  it("handles empty and legacy string descriptions", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
    expect(adfToText("  plain  ")).toBe("plain");
    expect(adfToText(doc())).toBe("");
  });

  it("separates paragraphs and keeps hard breaks", () => {
    expect(adfToText(doc(p(t("One"), { type: "hardBreak" }, t("two")), p(t("Three"))))).toBe("One\ntwo\n\nThree");
  });

  it("renders headings with their level", () => {
    expect(adfToText(doc({ type: "heading", attrs: { level: 2 }, content: [t("Goal")] }))).toBe("## Goal");
  });

  it("renders bullet, ordered and nested lists", () => {
    const nested: AdfNode = { type: "bulletList", content: [li(p(t("inner")))] };
    const text = adfToText(
      doc(
        { type: "bulletList", content: [li(p(t("a")), nested), li(p(t("b")))] },
        { type: "orderedList", attrs: { order: 3 }, content: [li(p(t("x"))), li(p(t("y")))] },
      ),
    );
    expect(text).toBe("- a\n  - inner\n- b\n\n3. x\n4. y");
  });

  it("fences code blocks with their language", () => {
    expect(adfToText(doc({ type: "codeBlock", attrs: { language: "ts" }, content: [t("const a = 1;\nf(a);")] }))).toBe(
      "```ts\nconst a = 1;\nf(a);\n```",
    );
  });

  it("appends link targets, and shows mentions and cards", () => {
    const text = adfToText(
      doc(
        p(t("See "), t("docs", [{ type: "link", attrs: { href: "https://x.dev/d" } }]), t(" by "), { type: "mention", attrs: { text: "@Asha" } }),
        p({ type: "inlineCard", attrs: { url: "https://x.dev/card" } }),
      ),
    );
    expect(text).toBe("See docs (https://x.dev/d) by @Asha\n\nhttps://x.dev/card");
  });

  it("does not repeat a link whose text is the URL", () => {
    expect(adfToText(doc(p(t("https://a.b", [{ type: "link", attrs: { href: "https://a.b" } }]))))).toBe("https://a.b");
  });

  it("falls back to child content for unknown nodes and skips media", () => {
    expect(adfToText(doc({ type: "mysteryBlock", content: [p(t("kept"))] }, { type: "mediaSingle", content: [] }))).toBe(
      "kept\n\n[attachment]",
    );
  });

  it("quotes blockquotes and flattens tables", () => {
    const cell = (s: string): AdfNode => ({ type: "tableCell", content: [p(t(s))] });
    expect(
      adfToText(
        doc(
          { type: "blockquote", content: [p(t("quoted"))] },
          { type: "table", content: [{ type: "tableRow", content: [cell("a"), cell("b")] }] },
        ),
      ),
    ).toBe("> quoted\n\na | b");
  });
});
