import assert from "node:assert/strict";
import { access, lstat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { scaffoldSkill } from "../src/scaffold.js";
import { validateRepository } from "../src/validate.js";
import { createEmptyRepository, read, writeJson } from "./helpers.js";

test("scaffolds a first-party reference skill without optional directories", async () => {
  const root = await createEmptyRepository();
  const created = await scaffoldSkill(root, "release-notes");

  assert.deepEqual(created.sort(), [
    "catalog/entries/release-notes.json",
    "evals/release-notes/trigger-cases.json",
    "skills/release-notes/LICENSE.txt",
    "skills/release-notes/SKILL.md",
  ]);
  assert.match(await read(root, "skills/release-notes/LICENSE.txt"), /PolyForm Shield License 1\.0\.0/);
  assert.match(await read(root, "skills/release-notes/LICENSE.txt"), /Required Notice: Copyright/);
  assert.match(await read(root, "skills/release-notes/SKILL.md"), /license: PolyForm-Shield-1.0.0/);
  assert.match(await read(root, "skills/release-notes/SKILL.md"), /name: release-notes/);
  assert.match(await read(root, "skills/release-notes/SKILL.md"), /Author the skill instructions before requesting certification\./);
  assert.deepEqual(JSON.parse(await read(root, "catalog/entries/release-notes.json")), {
    name: "release-notes",
    classification: "reference",
    origin: "first-party",
    maintainers: ["KuudoAI"],
    license: "PolyForm-Shield-1.0.0",
    registries: {},
  });
  assert.equal(await read(root, "evals/release-notes/trigger-cases.json"), "[]\n");
  await assert.rejects(access(join(root, "skills/release-notes/scripts")));
});

test("rejects invalid skill names before creating any files", async () => {
  const root = await createEmptyRepository();

  await assert.rejects(scaffoldSkill(root, "Release Notes"), /lowercase letters, numbers, and single hyphens/);
  await assert.rejects(access(join(root, "skills")));
  await assert.rejects(access(join(root, "catalog")));
  await assert.rejects(access(join(root, "evals")));
});

test("refuses an existing target without creating the other scaffold files", async () => {
  const root = await createEmptyRepository();
  await writeJson(root, "catalog/entries/release-notes.json", { existing: true });
  const original = await read(root, "catalog/entries/release-notes.json");

  await assert.rejects(scaffoldSkill(root, "release-notes"), /already exists/);

  assert.equal(await read(root, "catalog/entries/release-notes.json"), original);
  await assert.rejects(access(join(root, "skills")));
  await assert.rejects(access(join(root, "evals")));
});

test("treats a dangling target symlink as an existing collision", async () => {
  const root = await createEmptyRepository();
  const target = join(root, "catalog/entries/release-notes.json");
  await mkdir(join(root, "catalog", "entries"), { recursive: true });
  await symlink(join(root, "missing-catalog-entry.json"), target);

  await assert.rejects(scaffoldSkill(root, "release-notes"), /already exists/);

  assert((await lstat(target)).isSymbolicLink());
  await assert.rejects(access(join(root, "skills")));
  await assert.rejects(access(join(root, "evals")));
});

test("removes reserved outputs when a later target cannot be created", async () => {
  const root = await createEmptyRepository();
  const blockedDirectory = join(root, "evals", "release-notes");
  await mkdir(join(root, "evals"), { recursive: true });
  await symlink(readOnlyDirectory(), blockedDirectory, "dir");

  await assert.rejects(scaffoldSkill(root, "release-notes"));

  await assert.rejects(access(join(root, "skills", "release-notes", "SKILL.md")));
  await assert.rejects(access(join(root, "skills", "release-notes", "LICENSE.txt")));
  await assert.rejects(access(join(root, "catalog", "entries", "release-notes.json")));
  await assert.rejects(access(join(root, "evals", "release-notes", "trigger-cases.json")));
});

test("refuses symlinked scaffold parent directories without writing outside the repository", async () => {
  const root = await createEmptyRepository();
  const external = await createEmptyRepository();
  await symlink(external, join(root, "skills"), "dir");

  await assert.rejects(scaffoldSkill(root, "release-notes"), /parent directory.*symbolic link/);

  await assert.rejects(access(join(external, "release-notes", "SKILL.md")));
  await assert.rejects(access(join(root, "catalog")));
  await assert.rejects(access(join(root, "evals")));
});

test("identifies an unfinished rendered scaffold during validation", async () => {
  const root = await createEmptyRepository();
  await scaffoldSkill(root, "release-notes");

  const messages = (await validateRepository(root)).map((issue) => issue.message);

  assert(messages.includes("Skill instructions still contain the scaffold placeholder."));
  assert(messages.includes("Skill description still contains the scaffold placeholder."));
});

function readOnlyDirectory(): string {
  return process.platform === "darwin" ? "/System/Library" : "/sys/kernel";
}
