import { isMap, isScalar, parseDocument } from "yaml";

export interface ParsedSkillDocument {
  frontmatter: Record<string, unknown> | null;
  body: string;
  issues: string[];
}

/** Parse a leading YAML frontmatter block without treating later `---` lines as metadata. */
export function parseSkillDocument(content: string): ParsedSkillDocument {
  const lines = content.split(/(?<=\n)/);
  if (lines.length === 0 || !isDelimiter(lines[0])) {
    return { frontmatter: null, body: content, issues: ["SKILL.md must begin with YAML frontmatter delimited by ---."] };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && isDelimiter(line));
  if (closingIndex === -1) {
    return { frontmatter: null, body: "", issues: ["YAML frontmatter is missing its closing --- delimiter."] };
  }

  const yamlSource = lines.slice(1, closingIndex).join("");
  const body = lines.slice(closingIndex + 1).join("");

  try {
    const document = parseDocument(yamlSource, { uniqueKeys: true, prettyErrors: false });
    if (document.errors.length > 0) {
      return {
        frontmatter: null,
        body,
        issues: document.errors.map((error) => `Invalid YAML frontmatter: ${error.message}`),
      };
    }

    const value: unknown = document.toJS();
    if (!isRecord(value)) {
      return { frontmatter: null, body, issues: ["YAML frontmatter must be a mapping."] };
    }

    const issues = hasNonStringMetadataKey(document.contents)
      ? ["metadata keys must be strings."]
      : [];
    return { frontmatter: value, body, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { frontmatter: null, body, issues: [`Invalid YAML frontmatter: ${message}`] };
  }
}

function hasNonStringMetadataKey(root: unknown): boolean {
  if (!isMap(root)) return false;
  const metadata = root.items.find((pair) => (
    isScalar(pair.key) && pair.key.value === "metadata"
  ));
  if (!metadata || !isMap(metadata.value)) return false;
  return metadata.value.items.some((pair) => !isScalar(pair.key) || typeof pair.key.value !== "string");
}

function isDelimiter(line: string | undefined): boolean {
  return line?.replace(/\r?\n$/, "") === "---";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
