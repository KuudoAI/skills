import { constants } from "node:fs";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import { collectMarkdownReferences } from "./markdown.js";
import { parseSkillDocument } from "./frontmatter.js";
import { isClassification, isSkillName, maximumSkillNameLength } from "./types.js";
import type { CatalogEntry, Classification, SkillCatalogMetadata, TriggerCase, ValidationIssue } from "./types.js";

const standardFrontmatterFields = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const scaffoldSentinel = "Author the skill instructions before requesting certification.";
const unsafeContainerMessage = "Repository container must be a real directory and not a symbolic link.";
const unsafeGovernanceRecordMessage = "Governance record must be a regular file and not a symbolic link.";
const amazonAdsAccountRecoveryGuidance = `## Account-context recovery

If Amazon account scope, identifier type, marketplace mapping, or account relationships become unclear, consult \`amazon-ads-accounts\` when it is available. Resume this skill after resolving the ambiguity. If it is unavailable, use equivalent read-only discovery and ask the user when multiple valid choices remain. Never guess or interchange identifier types.`;

/** Find skill directories that are direct children of the repository's skills directory. */
export async function discoverSkillDirectories(root: string): Promise<string[]> {
  const skillsDirectory = join(root, "skills");
  let entries: Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>;

  if (!(await isRealDirectory(skillsDirectory))) return [];

  try {
    entries = await readdir(skillsDirectory, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const directories = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => join("skills", entry.name));

  return directories.sort();
}

/** Validate one portable skill directory and produce deterministic, user-facing diagnostics. */
export async function validateSkillDirectory(root: string, skillDirectory: string): Promise<ValidationIssue[]> {
  const skillPath = resolve(root, skillDirectory);
  const skillFile = join(skillPath, "SKILL.md");
  const displayPath = join(skillDirectory, "SKILL.md");
  let content: string;

  try {
    const directoryStat = await lstat(skillPath);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      return [{ path: skillDirectory, message: "Skill directory must be a real directory and not a symbolic link." }];
    }
    const skillStat = await lstat(skillFile);
    if (skillStat.isSymbolicLink() || !skillStat.isFile()) {
      return [{ path: displayPath, message: "SKILL.md must be a regular file and not a symbolic link." }];
    }
    content = await readFileWithoutFollowing(skillFile);
  } catch (error) {
    if (isMissing(error)) {
      return sortIssues([{ path: displayPath, message: "SKILL.md does not exist." }]);
    }
    throw error;
  }

  const parsed = parseSkillDocument(content);
  const issues: ValidationIssue[] = parsed.issues.map((message) => ({ path: displayPath, message }));

  if (parsed.frontmatter !== null) {
    validateFrontmatter(parsed.frontmatter, skillDirectory, displayPath, issues);
  }

  if (parsed.body.trim().length === 0) {
    issues.push({ path: displayPath, message: "SKILL.md must contain a Markdown body." });
  }

  if (parsed.body.includes(scaffoldSentinel)) {
    issues.push({ path: displayPath, message: "Skill instructions still contain the scaffold placeholder." });
  }

  if (parsed.frontmatter !== null && parsed.frontmatter.description === starterDescription(parsed.frontmatter.name)) {
    issues.push({ path: displayPath, message: "Skill description still contains the scaffold placeholder." });
  }

  if (lineCount(content) > 500) {
    issues.push({ path: displayPath, message: "SKILL.md must not exceed 500 lines." });
  }

  if (parsed.frontmatter !== null) {
    await validateReferences(root, skillPath, displayPath, parsed.body, issues);
  }

  await validateSkillTreeSymlinks(skillPath, skillPath, skillDirectory, issues);

  return sortIssues(issues);
}

/** Validate all portable skills and repository-only catalog and evaluation governance records. */
export async function validateRepository(root: string): Promise<ValidationIssue[]> {
  return (await loadValidatedRepository(root)).issues;
}

export interface ValidatedRepository {
  catalogEntries: CatalogEntry[];
  skillMetadata: SkillCatalogMetadata[];
  issues: ValidationIssue[];
}

/** Load governance records once and expose catalog entries only after schema validation. */
export async function loadValidatedRepository(root: string): Promise<ValidatedRepository> {
  const issues: ValidationIssue[] = [];
  const [hasSkills, hasCatalog, hasEvaluations, validators] = await Promise.all([
    validateRepositoryContainer(root, "skills", issues),
    validateRepositoryContainer(root, "catalog", issues),
    validateRepositoryContainer(root, "evals", issues),
    loadGovernanceValidators(),
  ]);
  const hasCatalogEntries = hasCatalog
    ? await validateRepositoryContainer(root, join("catalog", "entries"), issues)
    : false;
  const [skillDirectories, catalogFiles, evaluationFiles] = await Promise.all([
    hasSkills ? discoverSkillDirectories(root) : Promise.resolve([]),
    hasCatalogEntries ? discoverCatalogFiles(root, issues) : Promise.resolve([]),
    hasEvaluations ? discoverEvaluationFiles(root, issues) : Promise.resolve([]),
  ]);
  issues.push(...(await Promise.all(skillDirectories.map((directory) => validateSkillDirectory(root, directory)))).flat());
  const catalogRecords = await readCatalogRecords(root, catalogFiles, validators.catalog, issues);
  const evaluations = await readEvaluationRecords(root, evaluationFiles, validators.triggerCases, issues);

  validateCatalogRelationships(skillDirectories, catalogRecords, issues);
  validateEvaluationRelationships(catalogRecords, evaluations, issues);
  await validateAmazonAdsAccountRecovery(root, skillDirectories, catalogRecords, issues);

  return {
    catalogEntries: catalogRecords.flatMap((record) => record.entry === null ? [] : [record.entry]),
    skillMetadata: await readSkillMetadata(root, skillDirectories),
    issues: sortIssues(issues),
  };
}

async function readSkillMetadata(root: string, skillDirectories: string[]): Promise<SkillCatalogMetadata[]> {
  const metadata: SkillCatalogMetadata[] = [];
  for (const directory of skillDirectories) {
    let content: string;
    try {
      content = await readFileWithoutFollowing(join(root, directory, "SKILL.md"));
    } catch (error) {
      if (isMissing(error) || isSymlinkLoop(error)) continue;
      throw error;
    }
    const frontmatter = parseSkillDocument(content).frontmatter;
    if (frontmatter === null || typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") continue;

    const skill: SkillCatalogMetadata = {
      name: frontmatter.name,
      description: frontmatter.description,
    };
    for (const key of ["license", "compatibility", "allowed-tools"] as const) {
      if (typeof frontmatter[key] === "string") skill[key] = frontmatter[key];
    }
    if (hasOnlyStringValues(frontmatter.metadata)) {
      skill.metadata = frontmatter.metadata as Record<string, string>;
    }
    metadata.push(skill);
  }
  return metadata.sort((left, right) => left.name.localeCompare(right.name));
}

async function validateAmazonAdsAccountRecovery(
  root: string,
  skillDirectories: string[],
  catalogRecords: CatalogRecord[],
  issues: ValidationIssue[],
): Promise<void> {
  const skillNames = new Set(skillDirectories.map((directory) => directory.split(/[\\/]/).at(-1) ?? ""));

  for (const record of catalogRecords) {
    const entry = record.entry;
    if (
      entry === null
      || entry.origin !== "first-party"
      || entry.name === "amazon-ads-accounts"
      || !entry.name.startsWith("amazon-ads-")
      || !skillNames.has(entry.name)
    ) {
      continue;
    }

    const skillPath = join("skills", entry.name, "SKILL.md");
    let content: string;
    try {
      content = await readFileWithoutFollowing(join(root, skillPath));
    } catch (error) {
      if (isMissing(error) || isSymlinkLoop(error)) continue;
      throw error;
    }

    if (!content.includes(amazonAdsAccountRecoveryGuidance)) {
      issues.push({
        path: skillPath,
        message: "First-party Amazon Ads skills must provide the standard amazon-ads-accounts recovery guidance.",
      });
    }
  }
}

interface CatalogRecord {
  path: string;
  name: string | null;
  classification: Classification | null;
  entry: CatalogEntry | null;
}

interface EvaluationRecord {
  path: string;
  name: string;
  triggerCases: TriggerCase[] | null;
}

interface GovernanceValidators {
  catalog: ValidateFunction<CatalogEntry>;
  triggerCases: ValidateFunction<TriggerCase[]>;
}

let governanceValidators: Promise<GovernanceValidators> | undefined;

async function loadGovernanceValidators(): Promise<GovernanceValidators> {
  governanceValidators ??= (async () => {
    const schemaPath = new URL("../../catalog/schema.json", import.meta.url);
    const catalogSchema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true });
    (addFormats as unknown as (instance: Ajv2020) => void)(ajv);

    return {
      catalog: ajv.compile<CatalogEntry>(catalogSchema),
      triggerCases: ajv.compile<TriggerCase[]>({
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["query", "should_trigger"],
          properties: {
            query: { type: "string", minLength: 1 },
            should_trigger: { type: "boolean" },
          },
        },
      }),
    } satisfies GovernanceValidators;
  })();

  return governanceValidators;
}

async function discoverCatalogFiles(root: string, issues: ValidationIssue[]): Promise<string[]> {
  return discoverJsonFiles(join(root, "catalog", "entries"), join("catalog", "entries"), issues);
}

async function discoverEvaluationFiles(root: string, issues: ValidationIssue[]): Promise<string[]> {
  const evaluationsDirectory = join(root, "evals");
  let entries: Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>;

  try {
    entries = await readdir(evaluationsDirectory, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const displayPath = join("evals", entry.name);
    if (entry.isSymbolicLink()) {
      issues.push({ path: displayPath, message: unsafeContainerMessage });
    } else if (entry.isDirectory()) {
      files.push(join(displayPath, "trigger-cases.json"));
    }
  }
  return files.sort(compareStrings);
}

async function discoverJsonFiles(
  directory: string,
  displayDirectory: string,
  issues: ValidationIssue[],
): Promise<string[]> {
  let entries: Array<{ name: string; isFile(): boolean; isSymbolicLink(): boolean }>;

  try {
    entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".json")) continue;
    const displayPath = join(displayDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      issues.push({ path: displayPath, message: unsafeGovernanceRecordMessage });
    } else if (entry.isFile()) {
      files.push(displayPath);
    }
  }
  return files.sort(compareStrings);
}

async function readCatalogRecords(
  root: string,
  files: string[],
  validator: ValidateFunction<CatalogEntry>,
  issues: ValidationIssue[],
): Promise<CatalogRecord[]> {
  const records: CatalogRecord[] = [];
  for (const path of files) {
    let content: string;
    try {
      content = await readFileWithoutFollowing(join(root, path));
    } catch (error) {
      if (!isSymlinkLoop(error) && !isMissing(error)) throw error;
      issues.push({ path, message: unsafeGovernanceRecordMessage });
      records.push({ path, name: null, classification: null, entry: null });
      continue;
    }
    const data = parseJson(content, path, issues);
    const filename = path.slice("catalog/entries/".length, -".json".length);
    const name = recordName(data);
    const classification = recordClassification(data);
    let entry: CatalogEntry | null = null;

    if (data !== null) {
      if (validator(data)) {
        entry = data;
      } else {
        issues.push(...formatSchemaIssues(path, validator.errors, "catalog entry"));
      }
    }

    if (name !== null && name !== filename) {
      issues.push({ path, message: "Catalog entry filename must match its name." });
    }

    records.push({ path, name, classification, entry });
  }
  return records;
}

async function readEvaluationRecords(
  root: string,
  files: string[],
  validator: ValidateFunction<TriggerCase[]>,
  issues: ValidationIssue[],
): Promise<EvaluationRecord[]> {
  const records: EvaluationRecord[] = [];
  for (const path of files) {
    let content: string;
    try {
      content = await readFileWithoutFollowing(join(root, path));
    } catch (error) {
      if (!isMissing(error) && !isSymlinkLoop(error)) throw error;
      issues.push({
        path,
        message: isSymlinkLoop(error) ? unsafeGovernanceRecordMessage : "Evaluation record does not exist.",
      });
      records.push({
        path,
        name: path.slice("evals/".length, -"/trigger-cases.json".length),
        triggerCases: null,
      });
      continue;
    }
    const data = parseJson(content, path, issues);
    let triggerCases: TriggerCase[] | null = null;
    if (data !== null) {
      if (validator(data)) {
        triggerCases = data;
      } else {
        issues.push(...formatSchemaIssues(path, validator.errors, "evaluation record"));
      }
    }

    records.push({
      path,
      name: path.slice("evals/".length, -"/trigger-cases.json".length),
      triggerCases,
    });
  }
  return records;
}

function parseJson(content: string, path: string, issues: ValidationIssue[]): unknown | null {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    issues.push({ path, message: `Invalid JSON${detail}` });
    return null;
  }
}

function recordName(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  return typeof record.name === "string" ? record.name : null;
}

function recordClassification(data: unknown): Classification | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  return isClassification(record.classification) ? record.classification : null;
}

function formatSchemaIssues(
  path: string,
  errors: ErrorObject[] | null | undefined,
  recordLabel: "catalog entry" | "evaluation record",
): ValidationIssue[] {
  return (errors ?? [])
    .filter((error) => error.keyword !== "if")
    .map((error) => ({ path, message: formatSchemaIssue(error, recordLabel) }));
}

function formatSchemaIssue(error: ErrorObject, recordLabel: "catalog entry" | "evaluation record"): string {
  if (error.instancePath === "/source/revision" && error.keyword === "pattern") {
    return "source.revision must be an immutable Git revision (40-64 lowercase hexadecimal characters).";
  }

  const location = error.instancePath === "" ? recordLabel : `${recordLabel}${error.instancePath}`;
  return `${location} ${error.message ?? "is invalid"}.`;
}

function validateCatalogRelationships(
  skillDirectories: string[],
  catalogRecords: CatalogRecord[],
  issues: ValidationIssue[],
): void {
  const skillNames = new Set(skillDirectories.map((directory) => directory.split(/[\\/]/).at(-1) ?? ""));
  const recordsByName = new Map<string, CatalogRecord[]>();
  for (const record of catalogRecords) {
    if (record.name === null) continue;
    const records = recordsByName.get(record.name) ?? [];
    records.push(record);
    recordsByName.set(record.name, records);
  }

  for (const name of [...skillNames].sort(compareStrings)) {
    const records = recordsByName.get(name) ?? [];
    if (records.length === 0) {
      issues.push({ path: join("skills", name, "SKILL.md"), message: `Skill ${name} has no catalog entry` });
    } else if (records.length > 1) {
      issues.push({ path: join("skills", name, "SKILL.md"), message: `Skill ${name} has more than one catalog entry` });
    }
  }

  for (const [name, records] of recordsByName) {
    for (const record of records) {
      if (!skillNames.has(name)) {
        issues.push({ path: record.path, message: `Catalog entry ${name} has no skill directory` });
      }
    }
  }
}

function validateEvaluationRelationships(
  catalogRecords: CatalogRecord[],
  evaluations: EvaluationRecord[],
  issues: ValidationIssue[],
): void {
  const catalogNames = new Set(catalogRecords.flatMap((record) => record.name === null ? [] : [record.name]));
  const evaluationsByName = new Map(evaluations.map((evaluation) => [evaluation.name, evaluation]));

  for (const evaluation of evaluations) {
    if (!catalogNames.has(evaluation.name)) {
      issues.push({ path: evaluation.path, message: `Evaluation ${evaluation.name} has no catalog entry` });
    }
  }

  for (const record of catalogRecords) {
    if (record.name === null || record.classification !== "certified") continue;
    const { name } = record;
    const triggerCases = evaluationsByName.get(name)?.triggerCases ?? [];
    const hasPositive = triggerCases.some((triggerCase) => triggerCase.should_trigger);
    const hasNegative = triggerCases.some((triggerCase) => !triggerCase.should_trigger);
    if (!hasPositive || !hasNegative) {
      issues.push({
        path: join("evals", name, "trigger-cases.json"),
        message: `Certified skill ${name} must have at least one positive and one negative trigger case.`,
      });
    }
  }
}

function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  skillDirectory: string,
  displayPath: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(frontmatter)) {
    if (!standardFrontmatterFields.has(key)) {
      issues.push({ path: displayPath, message: `Unsupported frontmatter field \"${key}\".` });
    }
  }

  const directoryName = skillDirectory.split(/[\\/]/).at(-1) ?? "";
  const name = frontmatter.name;
  if (typeof name !== "string") {
    issues.push({ path: displayPath, message: "name must be a string." });
  } else {
    if (!isSkillName(name) && name.length <= maximumSkillNameLength) {
      issues.push({ path: displayPath, message: "name must use lowercase letters, numbers, and single hyphens." });
    }
    if (name.length > maximumSkillNameLength) {
      issues.push({ path: displayPath, message: `name must be at most ${maximumSkillNameLength} characters.` });
    }
    if (name !== directoryName) {
      issues.push({ path: displayPath, message: "name must match its directory name." });
    }
  }

  const description = frontmatter.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    issues.push({ path: displayPath, message: "description must be a non-empty string." });
  } else if (description.length > 1024) {
    issues.push({ path: displayPath, message: "description must be at most 1,024 characters." });
  }

  validateCompatibility(frontmatter, displayPath, issues);
  validateLimitedString(frontmatter, "license", undefined, displayPath, issues);
  validateLimitedString(frontmatter, "allowed-tools", undefined, displayPath, issues);

  if ("metadata" in frontmatter && !hasOnlyStringValues(frontmatter.metadata)) {
    issues.push({ path: displayPath, message: "metadata must be a mapping with string values." });
  }
}

function starterDescription(name: unknown): string | null {
  return typeof name === "string"
    ? `Author a precise description of what ${name} does and when it should be used.`
    : null;
}

function validateCompatibility(
  frontmatter: Record<string, unknown>,
  displayPath: string,
  issues: ValidationIssue[],
): void {
  if (!("compatibility" in frontmatter)) return;
  const compatibility = frontmatter.compatibility;
  if (typeof compatibility !== "string" || compatibility.length === 0 || compatibility.length > 500) {
    issues.push({ path: displayPath, message: "compatibility must be a string between 1 and 500 characters." });
  }
}

function validateLimitedString(
  frontmatter: Record<string, unknown>,
  key: string,
  maximum: number | undefined,
  displayPath: string,
  issues: ValidationIssue[],
): void {
  if (!(key in frontmatter)) return;
  const value = frontmatter[key];
  if (typeof value !== "string") {
    issues.push({ path: displayPath, message: `${key} must be a string.` });
  } else if (maximum !== undefined && value.length > maximum) {
    issues.push({ path: displayPath, message: `${key} must be at most ${maximum} characters.` });
  }
}

function hasOnlyStringValues(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string");
}

async function validateReferences(
  root: string,
  skillPath: string,
  displayPath: string,
  markdown: string,
  issues: ValidationIssue[],
): Promise<void> {
  const sourcePath = join(displayPath);
  const skillRoot = await realpath(skillPath);
  for (const reference of collectMarkdownReferences(markdown, sourcePath)) {
    const localPath = decodeLocalPath(reference.url);
    if (localPath === null) {
      issues.push({ path: displayPath, message: `Local reference "${reference.url}" contains malformed percent-encoding.` });
      continue;
    }
    if (localPath.length === 0) continue;

    const target = resolve(dirname(join(root, reference.sourcePath)), localPath);
    if (!isWithin(target, skillPath)) {
      issues.push({ path: displayPath, message: `Local reference \"${reference.url}\" resolves outside the skill directory.` });
      continue;
    }

    if (!(await existsWithoutFollowing(target))) {
      issues.push({ path: displayPath, message: `Local reference \"${reference.url}\" does not exist.` });
      continue;
    }

    let resolvedTarget: string;
    try {
      resolvedTarget = await realpath(target);
    } catch (error) {
      if (!isMissing(error)) throw error;
      issues.push({ path: displayPath, message: `Local reference \"${reference.url}\" does not exist.` });
      continue;
    }
    if (!isWithin(resolvedTarget, skillRoot)) {
      issues.push({ path: displayPath, message: `Local reference \"${reference.url}\" resolves outside the skill directory.` });
    }
  }
}

async function validateSkillTreeSymlinks(
  skillRoot: string,
  directory: string,
  displayDirectory: string,
  issues: ValidationIssue[],
): Promise<void> {
  const canonicalRoot = await realpath(skillRoot);
  const entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
  for (const entry of entries) {
    const target = join(directory, entry.name);
    const displayPath = join(displayDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      if (directory === skillRoot && entry.name === "SKILL.md") continue;
      try {
        const resolved = await realpath(target);
        if (!isWithin(resolved, canonicalRoot)) {
          issues.push({ path: displayPath, message: "Resource symbolic link resolves outside the skill directory." });
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
        issues.push({ path: displayPath, message: "Resource symbolic link target does not exist." });
      }
      continue;
    }
    if (entry.isDirectory()) {
      await validateSkillTreeSymlinks(skillRoot, target, displayPath, issues);
    }
  }
}

function decodeLocalPath(url: string): string | null {
  const separatorIndex = url.search(/[?#]/);
  const path = separatorIndex === -1 ? url : url.slice(0, separatorIndex);
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

function isWithin(target: string, directory: string): boolean {
  const path = relative(directory, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

async function readFileWithoutFollowing(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`${path} is not a regular file.`);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function existsWithoutFollowing(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function validateRepositoryContainer(
  root: string,
  displayPath: string,
  issues: ValidationIssue[],
): Promise<boolean> {
  const path = join(root, displayPath);
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    issues.push({ path: displayPath, message: unsafeContainerMessage });
    return false;
  }
  return true;
}

async function isRealDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isSymlinkLoop(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ELOOP";
}

function lineCount(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message));
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
