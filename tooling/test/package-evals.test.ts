import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { parseSkillDocument } from "../src/frontmatter.js";

interface PackageEvaluations {
  skill_name?: unknown;
  skill_version?: unknown;
  evals?: unknown;
}

test("bundled behavioral evaluations identify the skill and contain cases", async () => {
  const entries = await readdir("skills", { withFileTypes: true });

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const skillPath = join("skills", entry.name, "SKILL.md");
    const evaluationPath = join("skills", entry.name, "evals", "evals.json");
    let evaluationText: string;

    try {
      evaluationText = await readFile(evaluationPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    const skill = parseSkillDocument(await readFile(skillPath, "utf8"));
    assert.equal(skill.issues.length, 0, `${skillPath} has invalid frontmatter`);
    assert.ok(skill.frontmatter, `${skillPath} has no frontmatter`);
    const metadata = skill.frontmatter.metadata;
    assert.ok(
      typeof metadata === "object" && metadata !== null && !Array.isArray(metadata),
      `${skillPath} metadata must be a mapping`,
    );

    const evaluations = JSON.parse(evaluationText) as PackageEvaluations;
    assert.equal(evaluations.skill_name, entry.name, evaluationPath);
    assert.equal(
      evaluations.skill_version,
      (metadata as Record<string, unknown>).version,
      `${evaluationPath} version must match SKILL.md`,
    );
    assert.ok(Array.isArray(evaluations.evals), `${evaluationPath} evals must be an array`);
    assert.ok(evaluations.evals.length > 0, `${evaluationPath} must contain at least one case`);
  }
});
