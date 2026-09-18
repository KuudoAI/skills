import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { collectMarkdownReferences } from "../src/markdown.js";
import { discoverSkillDirectories, validateSkillDirectory } from "../src/validate.js";
import { createRepository, validSkillContent } from "./helpers.js";

test("accepts a minimal standards-compliant skill", async () => {
  const root = await createRepository({
    "skills/pdf-tools/SKILL.md": `---\nname: pdf-tools\ndescription: Extract PDF content. Use when working with PDF documents.\n---\n\n# PDF Tools\n\nInspect the document before editing it.\n`,
  });
  assert.deepEqual(await validateSkillDirectory(root, "skills/pdf-tools"), []);
});

test("rejects rendered scaffold placeholders", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: Author a precise description of what example does and when it should be used.\n---\n\n# Example\n\nAuthor the skill instructions before requesting certification.\n",
  });

  const issues = format(await validateSkillDirectory(root, "skills/example"));

  assert.match(issues, /instructions still contain the scaffold placeholder/);
  assert.match(issues, /description still contains the scaffold placeholder/);
});

test("reports every frontmatter problem in one validation run", async () => {
  const root = await createRepository({
    "skills/PDF--tools/SKILL.md": `---\nname: WrongName\ndescription: ""\ncompatibility: ${"x".repeat(501)}\nmetadata:\n  version: 1\n---\n`,
  });
  const issues = await validateSkillDirectory(root, "skills/PDF--tools");
  const messages = issues.map((issue) => issue.message).join("\n");
  assert.match(messages, /lowercase/);
  assert.match(messages, /match its directory/);
  assert.match(messages, /description/);
  assert.match(messages, /500 characters/);
  assert.match(messages, /string values/);
  assert.match(messages, /Markdown body/);
});

test("rejects unknown top-level frontmatter fields", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: Example.\nversion: 1\n---\n\n# Example\n",
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /Unsupported frontmatter field.*version/);
});

test("rejects an empty compatibility value", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: Example.\ncompatibility: \"\"\n---\n\n# Example\n",
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /compatibility.*1.*500 characters/);
});

test("reports a missing frontmatter block", async () => {
  const root = await createRepository({ "skills/example/SKILL.md": "# Example\n" });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /frontmatter/);
});

test("reports malformed YAML frontmatter", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: [unterminated\n---\n\n# Example\n",
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /YAML/);
});

test("rejects duplicate YAML frontmatter keys", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\nname: duplicate\ndescription: Example.\n---\n\n# Example\n",
  });

  assert.match(format(await validateSkillDirectory(root, "skills/example")), /Map keys must be unique/);
});

test("rejects a non-string license", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: Example.\nlicense: 123\n---\n\n# Example\n",
  });

  assert.match(format(await validateSkillDirectory(root, "skills/example")), /license must be a string/);
});

test("rejects non-string YAML metadata keys", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: Example.\nmetadata:\n  1: release\n---\n\n# Example\n",
  });

  assert.match(format(await validateSkillDirectory(root, "skills/example")), /metadata keys must be strings/);
});

test("rejects a skill name with consecutive hyphens", async () => {
  const root = await createRepository({ "skills/two--words/SKILL.md": validSkillContent("two--words") });
  assert.match(format(await validateSkillDirectory(root, "skills/two--words")), /lowercase/);
});

test("rejects a skill name longer than 64 characters", async () => {
  const name = "a".repeat(65);
  const root = await createRepository({ [`skills/${name}/SKILL.md`]: validSkillContent(name) });
  assert.match(format(await validateSkillDirectory(root, `skills/${name}`)), /64 characters/);
});

test("rejects a description longer than 1,024 characters", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": `---\nname: example\ndescription: ${"x".repeat(1025)}\n---\n\n# Example\n`,
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /1,024 characters/);
});

test("rejects a non-string allowed-tools value", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": "---\nname: example\ndescription: Example.\nallowed-tools:\n  - Read\n---\n\n# Example\n",
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /allowed-tools.*string/);
});

test("rejects SKILL.md documents longer than 500 lines", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": `---\nname: example\ndescription: Example.\n---\n\n${"line\n".repeat(500)}`,
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /500 lines/);
});

test("reports a missing relative link", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": `${validSkillContent("example")}\n[missing](guide.md)\n`,
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /does not exist/);
});

test("reports a relative link that escapes the skill directory", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": `${validSkillContent("example")}\n[escape](../other.md)\n`,
    "skills/other.md": "unrelated\n",
  });
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /outside/);
});

test("reports missing reference-style Markdown links and images", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": `${validSkillContent("example")}\n[guide][docs]\n\n![diagram][asset]\n\n[docs]: missing-guide.md\n[asset]: missing-image.png\n`,
  });
  const issues = format(await validateSkillDirectory(root, "skills/example"));
  assert.match(issues, /missing-guide.md.*does not exist/);
  assert.match(issues, /missing-image.png.*does not exist/);
});

test("reports malformed percent-encoding in a local reference", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": `${validSkillContent("example")}\n[broken](references/%ZZ.md)\n`,
  });

  assert.match(format(await validateSkillDirectory(root, "skills/example")), /malformed percent-encoding/);
});

test("rejects a symbolic-link SKILL.md", async () => {
  const root = await createRepository({ "outside.md": validSkillContent("example") });
  await mkdir(join(root, "skills", "example"), { recursive: true });
  await symlink(join(root, "outside.md"), join(root, "skills", "example", "SKILL.md"));

  assert.match(format(await validateSkillDirectory(root, "skills/example")), /SKILL\.md must be a regular file and not a symbolic link/);
});

test("discovers and rejects a symbolic-link skill directory", async () => {
  const root = await createRepository({ "outside/SKILL.md": validSkillContent("example") });
  await mkdir(join(root, "skills"), { recursive: true });
  await symlink(join(root, "outside"), join(root, "skills", "example"), "dir");

  assert.deepEqual(await discoverSkillDirectories(root), ["skills/example"]);
  assert.match(format(await validateSkillDirectory(root, "skills/example")), /Skill directory must be a real directory and not a symbolic link/);
});

test("reports an unreferenced resource symlink that escapes the skill directory", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": validSkillContent("example"),
    "outside.txt": "private\n",
  });
  await mkdir(join(root, "skills", "example", "references"), { recursive: true });
  await symlink(join(root, "outside.txt"), join(root, "skills", "example", "references", "outside.txt"));

  assert.match(format(await validateSkillDirectory(root, "skills/example")), /references[/\\]outside\.txt.*symbolic link.*outside the skill directory/);
});

test("discovers only direct skill directories in sorted order", async () => {
  const root = await createRepository({
    "skills/zeta/SKILL.md": validSkillContent("zeta"),
    "skills/alpha/SKILL.md": validSkillContent("alpha"),
    "skills/alpha/nested/SKILL.md": validSkillContent("nested"),
    "skills/ignored.txt": "not a skill\n",
  });
  assert.deepEqual(await discoverSkillDirectories(root), ["skills/alpha", "skills/zeta"]);
});

test("discovers direct child directories even when SKILL.md is missing", async () => {
  const root = await createRepository({
    "skills/complete/SKILL.md": validSkillContent("complete"),
    "skills/missing/notes.md": "This directory is incomplete.\n",
  });
  assert.deepEqual(await discoverSkillDirectories(root), ["skills/complete", "skills/missing"]);
});

test("collects local links and images while ignoring external destinations", () => {
  const sourcePath = join("skills", "example", "SKILL.md");
  assert.deepEqual(collectMarkdownReferences("[guide](guide.md) ![image](assets/example.png) [web](https://example.com) [jump](#top)", sourcePath), [
    { url: "guide.md", sourcePath },
    { url: "assets/example.png", sourcePath },
  ]);
});

function format(issues: Awaited<ReturnType<typeof validateSkillDirectory>>): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}
