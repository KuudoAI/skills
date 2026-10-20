import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const skills = join(root, "skills");
for (const entry of readdirSync(skills, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const directory = join(skills, entry.name, "tests");
  if (!existsSync(directory) || !readdirSync(directory).some(name => /^test_.*\.py$/.test(name))) continue;
  const files = readdirSync(directory).filter(name => /^test_.*\.py$/.test(name));
  const unittestFiles = files.filter(name => /^(?:import unittest\b|from unittest\b)/m.test(readFileSync(join(directory, name), "utf8")));
  if (unittestFiles.length === 0) {
    test(`${entry.name}: non-unittest files require their own runner`, { skip: true }, () => {});
    continue;
  }
  for (const file of unittestFiles) test(`${entry.name}: ${file}`, () => {
    const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", directory, "-p", file], {
      cwd: root, encoding: "utf8", timeout: 120_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    assert.ifError(result.error); // Includes a clear ENOENT if python3 is absent.
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
