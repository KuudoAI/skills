import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = process.cwd();

async function entries(archive: string): Promise<string[]> {
  const { stdout } = await execute("unzip", ["-Z1", archive]);
  return stdout.split("\n").filter(Boolean);
}

test("package builds fixed-name Claude upload archives from committed files", async () => {
  const out = join(await mkdtemp(join(tmpdir(), "kuudo-package-")), "dist");
  await execute("bash", ["scripts/package.sh", out], { cwd: root });

  // Fixed names: Claude replaces an upload only when the file name matches.
  assert.deepEqual(await readdir(out), ["kuudo-skills.zip", "skills"]);

  const plugin = await entries(join(out, "kuudo-skills.zip"));
  assert.ok(plugin.includes(".claude-plugin/plugin.json"), "plugin manifest at the archive root");
  assert.ok(plugin.includes("hooks/session-start"));
  assert.ok(plugin.includes("skills/using-kuudo/SKILL.md"));
  for (const excluded of ["tooling/", "evals/", "catalog/", "docs/", "package.json"]) {
    assert.ok(!plugin.some((entry) => entry.startsWith(excluded)), `${excluded} stays out of the plugin archive`);
  }

  const { stdout } = await execute("git", ["ls-tree", "-d", "--name-only", "HEAD:skills"], { cwd: root });
  const skills = stdout.split("\n").filter(Boolean).sort();
  const archives = (await readdir(join(out, "skills"))).sort();
  assert.deepEqual(archives, skills.map((skill) => `${skill}.zip`));
  const single = await entries(join(out, "skills", "using-kuudo.zip"));
  assert.ok(single.includes("using-kuudo/SKILL.md"), "skill folder at the archive root");
  assert.ok(single.every((entry) => entry.startsWith("using-kuudo/")));
});
