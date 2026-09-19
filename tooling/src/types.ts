export type Classification = "certified" | "reference";
export type Origin = "first-party" | "third-party";

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Agent Skills frontmatter copied into the generated, user-facing catalog. */
export interface SkillCatalogMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
}

interface CatalogEntryBase {
  name: string;
  classification: Classification;
  maintainers: string[];
  license: string;
  registries: Record<string, string>;
}

export interface CatalogSource {
  repository: string;
  revision: string;
  path: string;
}

export interface FirstPartyCatalogEntry extends CatalogEntryBase {
  origin: "first-party";
  source?: CatalogSource;
}

export interface ThirdPartyCatalogEntry extends CatalogEntryBase {
  origin: "third-party";
  source: CatalogSource;
}

export type CatalogEntry = FirstPartyCatalogEntry | ThirdPartyCatalogEntry;

export interface TriggerCase {
  query: string;
  should_trigger: boolean;
}

export function isClassification(value: unknown): value is Classification {
  return value === "certified" || value === "reference";
}

export const maximumSkillNameLength = 64;

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSkillName(value: string): boolean {
  return value.length <= maximumSkillNameLength && skillNamePattern.test(value);
}
