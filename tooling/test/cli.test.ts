import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeCatalogArtifacts } from "../src/catalog.js";
import { createCompleteRepository, createEmptyRepository, read, validThirdPartyEntry, writeJson } from "./helpers.js";

const execute = promisify(execFile);
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
    assert.match(result.stderr, /Usage:/);
    assert.doesNotMatch(result.stderr, /\n {4}at /);
  }
});

test("invalid names are reported without a stack trace", async () => {
  const root = await createEmptyRepository();

  const result = await runCli(root, "new", "Release Notes");

  assert.equal(result.code, 1);
  assert.match(result.stderr, /lowercase letters, numbers, and single hyphens/);
  assert.doesNotMatch(result.stderr, /\n {4}at /);
});
