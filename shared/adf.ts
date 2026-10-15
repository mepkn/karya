/** A node of Atlassian Document Format, loosely typed: Jira sends many node kinds. */
export type AdfNode = {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
};

/** Plain text from a Jira ADF description (or a legacy string), for display and AI input. */
export function adfToText(doc: unknown): string {
  if (doc == null) return "";
  if (typeof doc === "string") return doc.trim();
  const blocks = renderBlocks(asNodes((doc as AdfNode).content ?? [doc]), "");
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function asNodes(v: unknown): AdfNode[] {
  return Array.isArray(v) ? (v.filter((n) => n && typeof n === "object") as AdfNode[]) : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function inline(nodes: AdfNode[]): string {
  return nodes.map(inlineNode).join("");
}

function inlineNode(n: AdfNode): string {
  switch (n.type) {
    case "text": {
      const text = n.text ?? "";
      const href = str(n.marks?.find((m) => m.type === "link")?.attrs?.href);
      return href && href !== text ? `${text} (${href})` : text;
    }
    case "hardBreak":
      return "\n";
    case "mention":
      return str(n.attrs?.text) || "@someone";
    case "emoji":
      return str(n.attrs?.text) || str(n.attrs?.shortName);
    case "inlineCard":
    case "blockCard":
      return str(n.attrs?.url);
    case "date": {
      const ts = Number(n.attrs?.timestamp);
      return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "";
    }
    case "status":
      return `[${str(n.attrs?.text)}]`;
    default:
      return n.content ? inline(asNodes(n.content)) : (n.text ?? "");
  }
}

function renderBlocks(nodes: AdfNode[], indent: string): string[] {
  return nodes.map((n) => renderBlock(n, indent)).filter((s) => s.trim() !== "");
}

function renderBlock(n: AdfNode, indent: string): string {
  const content = asNodes(n.content);
  switch (n.type) {
    case "paragraph":
      return indent + inline(content).replace(/\n/g, `\n${indent}`);
    case "heading":
      return `${indent}${"#".repeat(Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6))} ${inline(content)}`;
    case "bulletList":
    case "orderedList":
      return renderList(n, indent);
    case "codeBlock":
      return `${indent}\`\`\`${str(n.attrs?.language)}\n${inline(content)}\n${indent}\`\`\``;
    case "blockquote":
      return renderBlocks(content, indent)
        .join("\n\n")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "rule":
      return `${indent}---`;
    case "panel":
    case "expand":
    case "nestedExpand": {
      const title = str(n.attrs?.title);
      const body = renderBlocks(content, indent).join("\n\n");
      return title ? `${indent}${title}\n${body}` : body;
    }
    case "table":
      return content
        .map((row) =>
          asNodes(row.content)
            .map((cell) => renderBlocks(asNodes(cell.content), "").join(" ").replace(/\n/g, " "))
            .join(" | "),
        )
        .map((l) => indent + l)
        .join("\n");
    case "mediaSingle":
    case "mediaGroup":
    case "media":
      return `${indent}[attachment]`;
    case "text":
    case "hardBreak":
    case "mention":
    case "emoji":
    case "inlineCard":
    case "date":
    case "status":
      return indent + inlineNode(n);
    default:
      return content.length ? renderBlocks(content, indent).join("\n\n") : (n.text ?? "");
  }
}

function renderList(list: AdfNode, indent: string): string {
  const ordered = list.type === "orderedList";
  const start = Number(list.attrs?.order) || 1;
  return asNodes(list.content)
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : "- ";
      const pad = " ".repeat(marker.length);
      const parts = asNodes(item.content).map((child) =>
        child.type === "bulletList" || child.type === "orderedList"
          ? renderList(child, indent + pad)
          : renderBlock(child, "").replace(/\n/g, `\n${indent}${pad}`),
      );
      const [first = "", ...rest] = parts;
      return [indent + marker + first, ...rest.map((p) => (p.startsWith(indent + pad) ? p : indent + pad + p))].join("\n");
    })
    .join("\n");
}
