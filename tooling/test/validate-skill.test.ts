import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { collectMarkdownReferences } from "../src/markdown.js";
import { discoverSkillDirectories, validateSkillDirectory } from "../src/validate.js";
import { createRepository, validSkillContent, versionedSkillContent } from "./helpers.js";

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

test("accepts a version that matches the top CHANGELOG entry and the eval version", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": versionedSkillContent("example", "0.4.0"),
    "skills/example/CHANGELOG.md": "# Changelog\n\n## [0.4.0] - 2026-10-17\n\n- Added.\n\n## [0.3.0] - 2026-09-01\n\n- Earlier.\n",
    "skills/example/evals/evals.json": `${JSON.stringify({ skill_name: "example", skill_version: "0.4.0", evals: [] })}\n`,
  });

  assert.deepEqual(await validateSkillDirectory(root, "skills/example"), []);
});

test("reports a top CHANGELOG entry that does not match metadata.version", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": versionedSkillContent("example", "0.4.0"),
    "skills/example/CHANGELOG.md": "# Changelog\n\n## [0.3.0] - 2026-09-01\n\n- Earlier.\n",
  });

  assert.equal(
    format(await validateSkillDirectory(root, "skills/example")),
    "skills/example/SKILL.md: CHANGELOG.md top entry 0.3.0 does not match metadata.version 0.4.0.",
  );
});

test("compares the first versioned CHANGELOG heading, skipping an Unreleased section", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": versionedSkillContent("example", "1.0.0-beta.1"),
    "skills/example/CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- Pending.\n\n## [1.0.0-beta.1] - 2026-10-17\n\n- Preview.\n",
  });

  assert.deepEqual(await validateSkillDirectory(root, "skills/example"), []);
});

test("reports a CHANGELOG without a versioned entry", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": versionedSkillContent("example", "0.4.0"),
    "skills/example/CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- Pending.\n",
  });

  assert.equal(
    format(await validateSkillDirectory(root, "skills/example")),
    "skills/example/SKILL.md: CHANGELOG.md has no \"## [X.Y.Z]\" entry to match metadata.version 0.4.0.",
  );
});

test("requires metadata.version when a skill has a CHANGELOG", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": validSkillContent("example"),
    "skills/example/CHANGELOG.md": "# Changelog\n\n## [0.1.0] - 2026-09-01\n\n- Initial.\n",
  });

  assert.equal(
    format(await validateSkillDirectory(root, "skills/example")),
    "skills/example/SKILL.md: metadata.version is required when CHANGELOG.md exists.",
  );
});

test("reports an eval skill_version that does not match metadata.version", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": versionedSkillContent("example", "0.4.0"),
    "skills/example/evals/evals.json": `${JSON.stringify({ skill_name: "example", skill_version: "0.3.0", evals: [] })}\n`,
  });

  assert.equal(
    format(await validateSkillDirectory(root, "skills/example")),
    "skills/example/SKILL.md: evals/evals.json skill_version 0.3.0 does not match metadata.version 0.4.0.",
  );
});

test("accepts semantic versions with prerelease identifiers", async () => {
  for (const version of ["0.0.0", "1.2.3", "10.20.30", "1.0.0-alpha", "1.0.0-rc.1", "1.0.0-0.3.7", "1.0.0-x-y.7.z.92"]) {
    const root = await createRepository({ "skills/example/SKILL.md": versionedSkillContent("example", version) });
    assert.deepEqual(await validateSkillDirectory(root, "skills/example"), [], version);
  }
});

test("rejects a metadata.version that is not a semantic version", async () => {
  for (const version of ["1.0", "v1.0.0", "01.0.0", "1.0.0-", "1.0.0-01", "1.0.0+build.1", ""]) {
    const root = await createRepository({ "skills/example/SKILL.md": versionedSkillContent("example", version) });
    assert.equal(
      format(await validateSkillDirectory(root, "skills/example")),
      `skills/example/SKILL.md: metadata.version "${version}" must be a semantic version (MAJOR.MINOR.PATCH with an optional -prerelease).`,
      version,
    );
  }
});

test("leaves an imported skill without a version or CHANGELOG untouched", async () => {
  const root = await createRepository({
    "skills/imported/SKILL.md": validSkillContent("imported"),
    "skills/imported/evals/evals.json": `${JSON.stringify({ skill_name: "imported", skill_version: "9.9.9", evals: [] })}\n`,
  });

  assert.deepEqual(await validateSkillDirectory(root, "skills/imported"), []);
});

test("accepts a versioned skill that deliberately has no CHANGELOG", async () => {
  const root = await createRepository({
    "skills/amazon-ads-reporting/SKILL.md": versionedSkillContent("amazon-ads-reporting", "0.4.0"),
    "skills/amazon-ads-reporting/evals/evals.json": `${JSON.stringify({ skill_name: "amazon-ads-reporting", skill_version: "0.4.0", evals: [] })}\n`,
  });

  assert.deepEqual(await validateSkillDirectory(root, "skills/amazon-ads-reporting"), []);
});

test("rejects a symbolic-link CHANGELOG", async () => {
  const root = await createRepository({
    "skills/example/SKILL.md": versionedSkillContent("example", "0.4.0"),
    "skills/example/references/history.md": "## [0.4.0] - 2026-10-17\n",
  });
  await symlink(join("references", "history.md"), join(root, "skills", "example", "CHANGELOG.md"));

  assert.equal(
    format(await validateSkillDirectory(root, "skills/example")),
    "skills/example/CHANGELOG.md: CHANGELOG.md must be a regular file and not a symbolic link.",
  );
});

function format(issues: Awaited<ReturnType<typeof validateSkillDirectory>>): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}
