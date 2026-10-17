import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { CatalogEntry, ValidationIssue } from "../src/types.js";

const executeFile = promisify(execFile);

export async function createRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kuudo-skills-test-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}

export const createEmptyRepository = (): Promise<string> => createRepository({});

export async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export const read = (root: string, path: string): Promise<string> => readFile(join(root, path), "utf8");

export function validSkillContent(name: string): string {
  return `---\nname: ${name}\ndescription: Use when a test needs the ${name} fixture.\n---\n\n# ${name}\n\nFollow the fixture instructions.\n`;
}

export function versionedSkillContent(name: string, version: string): string {
  return `---\nname: ${name}\ndescription: Use when a test needs the ${name} fixture.\nmetadata:\n  version: "${version}"\n---\n\n# ${name}\n\nFollow the fixture instructions.\n`;
}

/**
 * Point fixture and in-process Git commands only at throwaway repositories. Git hooks export variables
 * such as GIT_DIR and GIT_INDEX_FILE that would otherwise redirect them to the real repository, and the
 * developer's global configuration may sign commits or run hooks.
 */
export function isolateGitEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) delete process.env[key];
  }
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_CONFIG_GLOBAL = devNull;
}

export async function git(root: string, ...arguments_: string[]): Promise<string> {
  const { stdout } = await executeFile("git", arguments_, { cwd: root });
  return stdout;
}

/** Create a throwaway Git repository on `main` whose first commit contains `files`. */
export async function createGitRepository(files: Record<string, string>): Promise<string> {
  const root = await createRepository(files);
  await git(root, "init", "--quiet", "--initial-branch=main");
  await git(root, "config", "user.name", "Kuudo Test");
  await git(root, "config", "user.email", "test@example.invalid");
  await git(root, "config", "commit.gpgsign", "false");
  await commitFiles(root, "chore: initial commit");
  return root;
}

/** Write (or, for `null`, delete) files and commit everything with `message`. */
export async function commitFiles(root: string, message: string, files: Record<string, string | null> = {}): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    if (content === null) {
      await rm(target, { recursive: true, force: true });
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
  }
  await git(root, "add", "--all");
  await git(root, "commit", "--quiet", "--allow-empty", "--no-verify", "--message", message);
}

export function validEntry(name: string): CatalogEntry {
  return {
    name,
    classification: "reference",
    origin: "first-party",
    maintainers: ["KuudoAI"],
    license: "UNLICENSED",
    registries: {},
  };
}

export function validThirdPartyEntry(name: string): CatalogEntry {
  return {
    ...validEntry(name),
    origin: "third-party",
    license: "Apache-2.0",
    source: {
      repository: "https://github.com/example/skills",
      revision: "a".repeat(40),
      path: `skills/${name}`,
    },
  };
}

export async function createRepositoryWithValidSkill(name: string): Promise<string> {
  return createRepository({ [`skills/${name}/SKILL.md`]: validSkillContent(name) });
}

export async function createCompleteRepository(name: string, entry = validEntry(name)): Promise<string> {
  const root = await createRepositoryWithValidSkill(name);
  await writeJson(root, `catalog/entries/${name}.json`, entry);
  await writeJson(root, `evals/${name}/trigger-cases.json`, []);
  return root;
}

export async function createCatalogRepository(entries: CatalogEntry[]): Promise<string> {
  const root = await createEmptyRepository();
  for (const entry of entries) {
    const skillPath = join(root, "skills", entry.name, "SKILL.md");
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, validSkillContent(entry.name), "utf8");
    await writeJson(root, `catalog/entries/${entry.name}.json`, entry);
    await writeJson(root, `evals/${entry.name}/trigger-cases.json`, []);
  }
  return root;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}
