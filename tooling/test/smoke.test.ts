import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { checkCatalogArtifacts } from "../src/catalog.js";
import { collectMarkdownReferences } from "../src/markdown.js";
import { discoverSkillDirectories, validateRepository } from "../src/validate.js";

const execute = promisify(execFile);
const root = process.cwd();

type JsonObject = Record<string, unknown>;

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(join(root, path), "utf8")) as JsonObject;
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

test("package exposes the deterministic smoke command", async () => {
  const packageJson = await readJson("package.json");
  const scripts = packageJson.scripts as JsonObject;

  assert.equal(scripts.smoke, "node --import tsx --test tooling/test/smoke.test.ts");
});

test("release metadata keeps declared package versions synchronized", async () => {
  const packageJson = await readJson("package.json");
  const manifest = await readJson(".version-bump.json");
  const files = manifest.files as JsonObject[];

  assert.ok(files.length >= 5);
  for (const entry of files) {
    const document = await readJson(entry.path as string);
    const version = (entry.field as string).split(".").reduce(
      (value, key) => (value as JsonObject)[key],
      document as unknown,
    );
    assert.equal(version, packageJson.version, `${entry.path}.${entry.field} drifted`);
  }
});

test("repository and generated catalog are release-valid", async () => {
  assert.deepEqual(await validateRepository(root), []);
  assert.deepEqual(await checkCatalogArtifacts(root), []);
});

test("plugin versions and same-root marketplace sources agree", async () => {
  const packageJson = await readJson("package.json");
  const claudePlugin = await readJson(".claude-plugin/plugin.json");
  const claudeMarketplace = await readJson(".claude-plugin/marketplace.json");
  const codexPlugin = await readJson(".codex-plugin/plugin.json");
  const codexMarketplace = await readJson(".agents/plugins/marketplace.json");
  const claudeEntry = (claudeMarketplace.plugins as JsonObject[])[0];
  const codexEntry = (codexMarketplace.plugins as JsonObject[])[0];

  assert.equal(claudePlugin.version, packageJson.version);
  assert.equal(claudeEntry?.version, packageJson.version);
  assert.equal(codexPlugin.version, packageJson.version);
  assert.equal(claudeEntry?.source, "./");
  assert.deepEqual(codexEntry?.source, { source: "local", path: "." });
  assert.equal(claudeEntry?.name, claudePlugin.name);
  assert.equal(codexEntry?.name, codexPlugin.name);
});

test("Claude bootstrap hook emits the complete using-kuudo skill", async () => {
  const skill = await readFile(join(root, "skills/using-kuudo/SKILL.md"), "utf8");
  const { stdout, stderr } = await execute("bash", [join(root, "hooks/session-start")], { cwd: root });
  const envelope = JSON.parse(stdout) as JsonObject;
  const output = envelope.hookSpecificOutput as JsonObject;

  assert.equal(stderr, "");
  assert.equal(output.hookEventName, "SessionStart");
  assert.ok((output.additionalContext as string).includes(skill));
});

test("using-kuudo exposes readable adaptation guidance for each supported host", async () => {
  const sourcePath = join("skills", "using-kuudo", "SKILL.md");
  const skill = await readFile(join(root, sourcePath), "utf8");
  const references = collectMarkdownReferences(skill, sourcePath)
    .map(({ url }) => url)
    .filter((url) => url.startsWith("references/"))
    .sort();

  assert.deepEqual(references, ["references/claude-code.md", "references/codex.md"]);

  for (const reference of references) {
    assert.notEqual((await readFile(join(root, "skills", "using-kuudo", reference), "utf8")).trim(), "");
  }
});

test("both plugins expose the complete portable skill collection", async () => {
  const directories = await discoverSkillDirectories(root);
  const names = directories.map((directory) => basename(directory));
  const claudeMarketplace = await readJson(".claude-plugin/marketplace.json");
  const codexPlugin = await readJson(".codex-plugin/plugin.json");
  const codexMarketplace = await readJson(".agents/plugins/marketplace.json");
  const claudeEntry = (claudeMarketplace.plugins as JsonObject[])[0];
  const codexEntry = (codexMarketplace.plugins as JsonObject[])[0];
  const codexSource = codexEntry?.source as JsonObject;

  assert.ok(names.length > 0);
  assert.ok(names.includes("using-kuudo"));
  assert.equal(claudeEntry?.source, "./");
  assert.equal(codexSource.path, ".");
  assert.equal(codexPlugin.skills, "./skills/");

  for (const directory of directories) {
    assert.ok((await readFile(join(root, directory, "SKILL.md"), "utf8")).startsWith("---\n"));
  }
});

test("portable skill packages contain no nested host plugin manifests", async () => {
  for (const directory of await discoverSkillDirectories(root)) {
    const names = (await readdir(join(root, directory), { withFileTypes: true })).map((entry) => entry.name);
    assert.ok(!names.includes(".claude-plugin"), `${directory} contains a nested Claude plugin manifest`);
  }
});

test("portable skill instructions contain no private tool identifiers", async () => {
  for (const directory of await discoverSkillDirectories(root)) {
    for (const path of await collectFiles(join(root, directory))) {
      if (!/\.(?:json|md|py|txt)$/.test(path)) continue;
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, /\bcodefactory(?:_mcp)?\b|\bagent[ _-]?factory\b/i, path);
    }
  }
});
