import assert from "node:assert/strict";
import test from "node:test";
import { checkCommitSubjects, checkSkillVersionBumps, isConventionalCommitSubject } from "../src/release-checks.js";
import {
  commitFiles,
  createGitRepository,
  git,
  isolateGitEnvironment,
  validSkillContent,
  versionedSkillContent,
} from "./helpers.js";

isolateGitEnvironment();

function skill(name: string, version: string): Record<string, string> {
  return { [`skills/${name}/SKILL.md`]: versionedSkillContent(name, version) };
}

async function shortHash(root: string): Promise<string> {
  return (await git(root, "log", "-1", "--format=%h")).trim();
}

test("version-check reports a changed skill whose metadata.version was not bumped", async () => {
  const root = await createGitRepository(skill("amazon-sp-repricing", "0.2.0"));
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "fix(amazon-sp-repricing): clarify notes", {
    "skills/amazon-sp-repricing/references/notes.md": "Changed.\n",
  });

  const result = await checkSkillVersionBumps(root, "main");

  assert.deepEqual(result.problems, [
    "skills/amazon-sp-repricing changed but metadata.version was not bumped (0.2.0 → 0.2.0).",
  ]);
  assert.match(result.summary, /Bump metadata\.version/);
});

test("version-check rejects a lower version and a release replaced by its prerelease", async () => {
  const root = await createGitRepository({ ...skill("alpha", "0.2.0"), ...skill("beta", "1.0.0") });
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "fix: lower versions", { ...skill("alpha", "0.1.9"), ...skill("beta", "1.0.0-rc.1") });

  assert.deepEqual((await checkSkillVersionBumps(root, "main")).problems, [
    "skills/alpha changed but metadata.version was not bumped (0.2.0 → 0.1.9).",
    "skills/beta changed but metadata.version was not bumped (1.0.0 → 1.0.0-rc.1).",
  ]);
});

test("version-check accepts versions raised by SemVer precedence", async () => {
  const root = await createGitRepository({
    ...skill("alpha", "0.9.0"),
    ...skill("beta", "1.0.0-beta.2"),
    ...skill("gamma", "1.0.0-rc.1"),
  });
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "feat: raise versions", {
    ...skill("alpha", "0.10.0"),
    ...skill("beta", "1.0.0-beta.10"),
    ...skill("gamma", "1.0.0"),
  });

  const result = await checkSkillVersionBumps(root, "main");

  assert.deepEqual(result.problems, []);
  assert.equal(result.summary, "Skill version check passed against main (3 changed versioned skills).");
});

test("version-check reports a changed skill whose new version is not semantic", async () => {
  const root = await createGitRepository(skill("alpha", "0.2.0"));
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "fix: shorten version", skill("alpha", "1.0"));

  assert.deepEqual((await checkSkillVersionBumps(root, "main")).problems, [
    "skills/alpha changed but metadata.version \"1.0\" is not a semantic version.",
  ]);
});

test("version-check skips new, deleted, unversioned, and unchanged skills", async () => {
  const root = await createGitRepository({
    ...skill("removed", "0.1.0"),
    ...skill("unchanged", "0.1.0"),
    ...skill("dropping", "0.1.0"),
    ...skill("legacy", "1.0"),
    "skills/adopting/SKILL.md": validSkillContent("adopting"),
    "skills/README.md": "Skills.\n",
  });
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "chore: reshape skills", {
    "skills/removed": null,
    ...skill("added", "0.1.0"),
    ...skill("adopting", "0.1.0"),
    "skills/dropping/SKILL.md": validSkillContent("dropping"),
    ...skill("legacy", "1.0.0"),
    "skills/README.md": "Skills, revised.\n",
  });

  const result = await checkSkillVersionBumps(root, "main");

  assert.deepEqual(result.problems, []);
  assert.equal(result.summary, "Skill version check passed against main (0 changed versioned skills).");
});

test("version-check compares HEAD with the merge base, not the base branch tip", async () => {
  const root = await createGitRepository({ ...skill("alpha", "0.1.0"), ...skill("beta", "0.1.0") });
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "feat(alpha): raise version", skill("alpha", "0.1.1"));
  await git(root, "checkout", "--quiet", "main");
  await commitFiles(root, "feat: change main after the branch point", {
    ...skill("alpha", "0.2.0"),
    "skills/beta/notes.md": "Changed only on main.\n",
  });
  await git(root, "checkout", "--quiet", "feature");

  const result = await checkSkillVersionBumps(root, "main");

  assert.deepEqual(result.problems, []);
  assert.equal(result.summary, "Skill version check passed against main (1 changed versioned skill).");
});

test("version-check counts a file moved out of a skill as a change to that skill", async () => {
  const root = await createGitRepository({ ...skill("alpha", "0.1.0"), "skills/alpha/references/guide.md": "Guide.\n" });
  await git(root, "checkout", "--quiet", "-b", "feature");
  await git(root, "mv", "skills/alpha/references/guide.md", "guide.md");
  await commitFiles(root, "refactor: move the guide out of alpha");

  assert.deepEqual((await checkSkillVersionBumps(root, "main")).problems, [
    "skills/alpha changed but metadata.version was not bumped (0.1.0 → 0.1.0).",
  ]);
});

test("version-check explains a base ref that shares no history with HEAD", async () => {
  const root = await createGitRepository(skill("alpha", "0.1.0"));
  await git(root, "checkout", "--quiet", "--orphan", "unrelated");
  await commitFiles(root, "chore: start unrelated history");

  await assert.rejects(checkSkillVersionBumps(root, "main"), /Cannot find a merge base between "main" and HEAD/);
});

test("release checks reject a base ref that cannot be resolved", async () => {
  const root = await createGitRepository({});

  for (const check of [checkSkillVersionBumps, checkCommitSubjects]) {
    await assert.rejects(check(root, "origin/missing"), /Cannot resolve base ref "origin\/missing" to a commit/);
    await assert.rejects(check(root, "--output=/dev/null"), /Cannot resolve base ref "--output=\/dev\/null" to a commit/);
  }
});

test("commit subjects must use a Conventional Commits type or Git's revert form", () => {
  for (const subject of [
    "feat: add a skill",
    "fix(amazon-sp-repricing): handle empty offers",
    "feat(api)!: drop the legacy flag",
    "chore!: require Node 22",
    "docs(skills/amazon-ads-reporting): clarify windows",
    "build(deps-dev): bump tsx to 4.19.3",
    "revert: feat: add a skill",
    "perf: cache catalog reads",
    "refactor: split validation",
    "test: cover merges",
    "ci: pin actions",
    "style: format",
    "Revert \"feat: add a skill\"",
  ]) {
    assert(isConventionalCommitSubject(subject), subject);
  }

  for (const subject of [
    "Update README",
    "feat:missing space",
    "feat: ",
    "Feat: capitalized type",
    "feature: unknown type",
    "feat(Scope): uppercase scope",
    "feat(): empty scope",
    "fixup! feat: add a skill",
    "squash! fix: handle empty offers",
    "amend! fix: handle empty offers",
    "Revert feat: add a skill",
    "Merge branch 'main' into feature",
  ]) {
    assert(!isConventionalCommitSubject(subject), subject);
  }
});

test("commit-check lists every non-conventional commit after the base with a hint", async () => {
  const root = await createGitRepository({});
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "feat(alpha): add guide");
  await commitFiles(root, "Update stuff");
  const update = await shortHash(root);
  await commitFiles(root, "fixup! feat(alpha): add guide");
  const fixup = await shortHash(root);
  await commitFiles(root, "Revert \"feat(alpha): add guide\"");

  const result = await checkCommitSubjects(root, "main");

  assert.deepEqual(result.problems, [
    `${update} "Update stuff" is not a Conventional Commit subject.`,
    `${fixup} "fixup! feat(alpha): add guide" is not a Conventional Commit subject.`,
  ]);
  assert.match(result.summary, /type\(scope\)!: summary/);
  assert.match(result.summary, /release notes are generated from/);
});

test("commit-check ignores merge commits and commits already on the base", async () => {
  const root = await createGitRepository({});
  await git(root, "checkout", "--quiet", "-b", "feature");
  await commitFiles(root, "feat: feature work", { "feature.txt": "Feature.\n" });
  await git(root, "checkout", "--quiet", "main");
  await commitFiles(root, "Unconventional work on main", { "main.txt": "Main.\n" });
  await git(root, "checkout", "--quiet", "feature");
  await git(root, "merge", "--quiet", "--no-ff", "--no-edit", "main");

  const result = await checkCommitSubjects(root, "main");

  assert.deepEqual(result.problems, []);
  assert.equal(result.summary, "Commit check passed against main (1 commit).");
});

test("commit-check passes when HEAD has no commits after the base", async () => {
  const root = await createGitRepository({});

  const result = await checkCommitSubjects(root, "main");

  assert.deepEqual(result.problems, []);
  assert.equal(result.summary, "Commit check passed against main (0 commits).");
});
