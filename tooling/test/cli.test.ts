import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeCatalogArtifacts } from "../src/catalog.js";
import {
  commitFiles,
  createCompleteRepository,
  createEmptyRepository,
  createGitRepository,
  git,
  isolateGitEnvironment,
  read,
  validThirdPartyEntry,
  versionedSkillContent,
  writeJson,
} from "./helpers.js";

isolateGitEnvironment();

const execute = promisify(execFile);
const usage = "Usage: skill:new <name> | validate | catalog <build|check> | version-check --base <ref> | commit-check --base <ref>";
const cli = new URL("../src/cli.ts", import.meta.url).pathname;
const tsx = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;

async function runCli(root: string, ...arguments_: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [tsx, cli, ...arguments_], { cwd: root });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const result = error as { stdout: string; stderr: string; code: number };
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }
}

test("new reports created paths", async () => {
  const root = await createEmptyRepository();

  const result = await runCli(root, "new", "release-notes");

  assert.equal(result.code, 0);
  assert.match(result.stdout, /skills\/release-notes\/SKILL\.md/);
  assert.match(await read(root, "catalog/entries/release-notes.json"), /release-notes/);
});

test("validate prints diagnostics and exits one for an unfinished skill", async () => {
  const root = await createEmptyRepository();
  await runCli(root, "new", "release-notes");

  const result = await runCli(root, "validate");

  assert.equal(result.code, 1);
  assert.match(result.stdout, /scaffold placeholder/);
  assert.doesNotMatch(result.stderr, /(?:Error|at )/);
});

test("validate checks generated registry artifacts", async () => {
  const root = await createEmptyRepository();
  await writeCatalogArtifacts(root);
  await writeFile(join(root, "THIRD_PARTY_NOTICES.md"), "stale\n", "utf8");

  const result = await runCli(root, "validate");

  assert.equal(result.code, 1);
  assert.match(result.stdout, /THIRD_PARTY_NOTICES\.md: Generated artifact is missing or stale/);
});

test("catalog commands build and check generated artifacts", async () => {
  const root = await createEmptyRepository();

  const stale = await runCli(root, "catalog", "check");
  const build = await runCli(root, "catalog", "build");
  const check = await runCli(root, "catalog", "check");

  assert.equal(stale.code, 1);
  assert.match(stale.stdout, /THIRD_PARTY_NOTICES\.md: Generated artifact is missing or stale\./);
  assert.equal(build.code, 0);
  assert.equal(check.code, 0);
  assert.match(await read(root, "THIRD_PARTY_NOTICES.md"), /No third-party skills/);
});

test("catalog build refuses invalid repository state without changing artifacts", async () => {
  const entry = validThirdPartyEntry("external");
  const { source: _source, ...invalidEntry } = entry;
  const root = await createCompleteRepository("external", entry);
  await writeJson(root, "catalog/entries/external.json", invalidEntry);
  await writeFile(join(root, "THIRD_PARTY_NOTICES.md"), "preserve me\n", "utf8");

  const result = await runCli(root, "catalog", "build");

  assert.equal(result.code, 1);
  assert.match(result.stderr, /source/);
  assert.equal(await read(root, "THIRD_PARTY_NOTICES.md"), "preserve me\n");
});

test("unknown and incomplete commands print usage without stack traces", async () => {
  const root = await createEmptyRepository();

  for (const arguments_ of [["new"], ["catalog"], ["unknown"]]) {
    const result = await runCli(root, ...arguments_);
    assert.equal(result.code, 2);
    assert.equal(result.stderr, `${usage}\n`);
  }
});

test("version-check and commit-check require --base <ref>", async () => {
  const root = await createGitRepository({});

  for (const command of ["version-check", "commit-check"]) {
    for (const arguments_ of [[], ["--base"], ["main"], ["--base", "main", "extra"]]) {
      const result = await runCli(root, command, ...arguments_);
      assert.equal(result.code, 2, `${command} ${arguments_.join(" ")}`);
      assert.equal(result.stderr, `${command} requires --base <ref>.\n${usage}\n`);
    }
  }
});

test("version-check and commit-check report an unresolvable base ref without a stack trace", async () => {
  const root = await createGitRepository({});

  for (const command of ["version-check", "commit-check"]) {
    const result = await runCli(root, command, "--base", "origin/missing");
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Cannot resolve base ref "origin\/missing" to a commit/);
    assert.doesNotMatch(result.stderr, /\n {4}at /);
  }
});

test("version-check exits one for an unbumped skill and zero once it is bumped", async () => {
  const root = await createGitRepository({ "skills/alpha/SKILL.md": versionedSkillContent("alpha", "0.2.0") });
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "fix(alpha): add notes", { "skills/alpha/notes.md": "Notes.\n" });

  const unbumped = await runCli(root, "version-check", "--base", "main");
  await commitFiles(root, "fix(alpha): bump version", { "skills/alpha/SKILL.md": versionedSkillContent("alpha", "0.2.1") });
  const bumped = await runCli(root, "version-check", "--base", "main");

  assert.equal(unbumped.code, 1);
  assert.match(unbumped.stdout, /^skills\/alpha changed but metadata\.version was not bumped \(0\.2\.0 → 0\.2\.0\)\.\n/);
  assert.equal(bumped.code, 0);
  assert.equal(bumped.stdout, "Skill version check passed against main (1 changed versioned skill).\n");
});

test("commit-check exits one for a non-conventional subject and zero otherwise", async () => {
  const root = await createGitRepository({});
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "feat: add alpha");

  const passing = await runCli(root, "commit-check", "--base", "main");
  await commitFiles(root, "WIP");
  const failing = await runCli(root, "commit-check", "--base", "main");

  assert.equal(passing.code, 0);
  assert.equal(passing.stdout, "Commit check passed against main (1 commit).\n");
  assert.equal(failing.code, 1);
  assert.match(failing.stdout, /^[0-9a-f]+ "WIP" is not a Conventional Commit subject\.\n.*release notes/s);
});

test("invalid names are reported without a stack trace", async () => {
  const root = await createEmptyRepository();

  const result = await runCli(root, "new", "Release Notes");

  assert.equal(result.code, 1);
  assert.match(result.stderr, /lowercase letters, numbers, and single hyphens/);
  assert.doesNotMatch(result.stderr, /\n {4}at /);
});
