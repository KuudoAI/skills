import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CatalogEntry, ValidationIssue } from "../src/types.js";

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
