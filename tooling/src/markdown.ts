import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

export interface MarkdownReference {
  url: string;
  sourcePath: string;
}

interface MarkdownNode {
  type: string;
  url?: unknown;
}

/** Collect filesystem references from Markdown links and images. */
export function collectMarkdownReferences(markdown: string, sourcePath: string): MarkdownReference[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const references: MarkdownReference[] = [];

  visit(tree, ["link", "image", "definition"], (node) => {
    const url = (node as MarkdownNode).url;
    if (typeof url === "string" && isLocalReference(url)) {
      references.push({ url, sourcePath });
    }
  });

  return references;
}

function isLocalReference(url: string): boolean {
  return !/^(?:https?:|mailto:|data:)/i.test(url) && !url.startsWith("#");
}
