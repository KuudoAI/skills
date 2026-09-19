import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { loadValidatedRepository } from "./validate.js";
import type { CatalogEntry, SkillCatalogMetadata, ThirdPartyCatalogEntry, ValidationIssue } from "./types.js";

const artifactPaths = ["catalog/skills.json", "skills.sh.json", "THIRD_PARTY_NOTICES.md"] as const;
const staleArtifactMessage = "Generated artifact is missing or stale.";
const unsafeArtifactMessage = "Generated artifact must be a regular file and not a symbolic link.";

export interface GeneratedCatalogArtifacts {
  "catalog/skills.json"?: string;
  "THIRD_PARTY_NOTICES.md": string;
  "skills.sh.json"?: string;
}

class RepositoryValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "RepositoryValidationError";
  }
}

/** Generate deterministic skills.sh registry metadata and third-party attribution notices. */
export async function generateCatalogArtifacts(root: string): Promise<GeneratedCatalogArtifacts> {
  const repository = await loadValidatedRepository(root);
  if (repository.issues.length > 0) throw new RepositoryValidationError(repository.issues);
  return renderCatalogArtifacts(repository.catalogEntries, repository.skillMetadata);
}

/** Write generated artifacts only when their committed content is stale. */
export async function writeCatalogArtifacts(root: string): Promise<void> {
  const artifacts = await generateCatalogArtifacts(root);
  const states = await Promise.all(artifactPaths.map(async (path) => ({
    path,
    state: await inspectArtifact(join(root, path)),
  })));
  const unsafe = states.find(({ state }) => state.kind === "unsafe");
  if (unsafe) throw new Error(`${unsafe.path}: ${unsafeArtifactMessage}`);

  for (const { path, state } of states) {
    const target = join(root, path);
    const content = artifacts[path];
    if (content === undefined && state.kind === "file") {
      await unlink(target);
    } else if (content !== undefined) {
      if (state.kind === "missing") {
        await writeArtifactWithoutFollowing(target, content, false);
      } else if (state.kind === "file" && state.content !== content) {
        await writeArtifactWithoutFollowing(target, content, true);
      }
    }
  }
}

/** Report generated artifacts that are missing, unsafe, or do not match deterministic output. */
export async function checkCatalogArtifacts(root: string): Promise<ValidationIssue[]> {
  const repository = await loadValidatedRepository(root);
  if (repository.issues.length > 0) return repository.issues;
  const artifacts = renderCatalogArtifacts(repository.catalogEntries, repository.skillMetadata);
  const results = await Promise.all(artifactPaths.map(async (path) => ({
    path,
    state: await inspectArtifact(join(root, path)),
  })));

  return results.flatMap(({ path, state }) => {
    if (state.kind === "unsafe") return [{ path, message: unsafeArtifactMessage }];
    const content = state.kind === "file" ? state.content : undefined;
    return content === artifacts[path] ? [] : [{ path, message: staleArtifactMessage }];
  });
}

function renderCatalogArtifacts(entries: CatalogEntry[], skillMetadata: SkillCatalogMetadata[]): GeneratedCatalogArtifacts {
  const certified = entries.filter((entry) => entry.classification === "certified").map((entry) => entry.name).sort(compareStrings);
  const firstPartyReferences = entries
    .filter((entry) => entry.classification === "reference" && entry.origin === "first-party")
    .map((entry) => entry.name)
    .sort(compareStrings);
  const community = entries
    .filter((entry) => entry.classification === "reference" && entry.origin === "third-party")
    .map((entry) => entry.name)
    .sort(compareStrings);
  const thirdParty = entries
    .filter((entry): entry is ThirdPartyCatalogEntry => entry.origin === "third-party")
    .sort((left, right) => compareStrings(left.name, right.name));

  const groupings = [
    ...(certified.length === 0 ? [] : [{
      title: "KuudoAI Certified",
      description: "Skills reviewed and certified by KuudoAI.",
      skills: certified,
    }]),
    ...(firstPartyReferences.length === 0 ? [] : [{
      title: "KuudoAI Reference Skills",
      description: "First-party reference implementations maintained by KuudoAI.",
      skills: firstPartyReferences,
    }]),
    ...(community.length === 0 ? [] : [{
      title: "Community",
      description: "Community-contributed skills.",
      skills: community,
    }]),
  ];
  const artifacts: GeneratedCatalogArtifacts = {
    "THIRD_PARTY_NOTICES.md": renderThirdPartyNotices(thirdParty),
  };

  if (entries.length > 0) {
    const metadataByName = new Map(skillMetadata.map((skill) => [skill.name, skill]));
    artifacts["catalog/skills.json"] = `${JSON.stringify({
      catalogVersion: 1,
      skills: entries
        .slice()
        .sort((left, right) => compareStrings(left.name, right.name))
        .map((entry) => ({
          ...(metadataByName.get(entry.name) ?? { name: entry.name, description: "" }),
          status: entry.classification,
          origin: entry.origin,
          maintainers: entry.maintainers,
          registries: entry.registries,
          governanceLicense: entry.license,
          ...(entry.source ? { source: entry.source } : {}),
        })),
    }, null, 2)}\n`;
  }

  if (groupings.length > 0) {
    artifacts["skills.sh.json"] = `${JSON.stringify({
      $schema: "https://skills.sh/schemas/skills.sh.schema.json",
      notGrouped: "bottom",
      groupings,
    }, null, 2)}\n`;
  }

  return artifacts;
}

function renderThirdPartyNotices(entries: ThirdPartyCatalogEntry[]): string {
  if (entries.length === 0) {
    return "# Third-Party Notices\n\nNo third-party skills are included in this repository.\n";
  }

  return `# Third-Party Notices\n\n${entries.map((entry) => [
    `## ${entry.name}`,
    "",
    `- Source repository: ${entry.source.repository}`,
    `- Source path: ${entry.source.path}`,
    `- Revision: ${entry.source.revision}`,
    `- License: ${entry.license}`,
  ].join("\n")).join("\n\n")}\n`;
}

type ArtifactState =
  | { kind: "missing" }
  | { kind: "unsafe" }
  | { kind: "file"; content: string };

async function inspectArtifact(path: string): Promise<ArtifactState> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return { kind: "missing" };
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { kind: "unsafe" };

  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const openedStat = await handle.stat();
      if (!openedStat.isFile()) return { kind: "unsafe" };
      return { kind: "file", content: await handle.readFile("utf8") };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isSymlinkLoop(error) || isMissing(error)) return { kind: "unsafe" };
    throw error;
  }
}

async function writeArtifactWithoutFollowing(path: string, content: string, existed: boolean): Promise<void> {
  const flags = existed
    ? constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW
    : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
  const handle = await open(path, flags, 0o666);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isSymlinkLoop(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ELOOP";
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
