import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isRecord, parseSkillDocument } from "./frontmatter.js";
import { compareSemanticVersions, isSemanticVersion } from "./semver.js";

const executeFile = promisify(execFile);
const conventionalSubjectPattern = /^(feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert)(\([a-z0-9._/-]+\))?!?: \S/;
const gitRevertSubjectPattern = /^Revert ".+"$/;
const versionBumpHint = "Bump metadata.version in each skill listed above, and keep its top CHANGELOG.md entry and evals/evals.json skill_version in step when it has them.";
const commitSubjectHint = "Write commit subjects as \"type(scope)!: summary\" with type feat, fix, perf, refactor, docs, test, build, ci, chore, style, or revert (scope and ! optional), because release notes are generated from these subjects; reword the commits listed above.";

export interface ReleaseCheckResult {
  /** One line per problem; empty when the check passes. */
  problems: string[];
  /** Closing line: a success message when there are no problems, otherwise how to fix them. */
  summary: string;
}

/**
 * Require every skill changed between the merge base with `baseRef` and HEAD to raise its metadata.version.
 * Skills that are new, deleted, or unversioned at either end are skipped.
 */
export async function checkSkillVersionBumps(root: string, baseRef: string): Promise<ReleaseCheckResult> {
  const base = await resolveCommit(root, baseRef);
  const mergeBase = await findMergeBase(root, base, baseRef);
  // Without rename detection a file moved out of a skill still counts as a change to that skill.
  const changedPaths = await git(root, ["diff", "--name-only", "--no-renames", "-z", mergeBase, "HEAD"]);
  const skillDirectories = new Set<string>();
  for (const path of changedPaths.split("\0")) {
    const [container, name, ...rest] = path.split("/");
    if (container === "skills" && name !== undefined && rest.length > 0) skillDirectories.add(`skills/${name}`);
  }

  const problems: string[] = [];
  let checked = 0;
  for (const directory of [...skillDirectories].sort()) {
    const [before, after] = await Promise.all([
      readSkillVersion(root, mergeBase, directory),
      readSkillVersion(root, "HEAD", directory),
    ]);
    if (before === null || after === null || !isSemanticVersion(before)) continue;
    checked += 1;
    if (!isSemanticVersion(after)) {
      problems.push(`${directory} changed but metadata.version "${after}" is not a semantic version.`);
    } else if (compareSemanticVersions(after, before) <= 0) {
      problems.push(`${directory} changed but metadata.version was not bumped (${before} → ${after}).`);
    }
  }

  return {
    problems,
    summary: problems.length === 0
      ? `Skill version check passed against ${baseRef} (${count(checked, "changed versioned skill")}).`
      : versionBumpHint,
  };
}

/** Require a Conventional Commits subject on every non-merge commit in `baseRef..HEAD`. */
export async function checkCommitSubjects(root: string, baseRef: string): Promise<ReleaseCheckResult> {
  const base = await resolveCommit(root, baseRef);
  const log = await git(root, ["log", "--no-merges", "--reverse", "--no-show-signature", "--format=%h%x00%s", `${base}..HEAD`]);
  const commits = log
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.indexOf("\0");
      return { hash: line.slice(0, separator), subject: line.slice(separator + 1) };
    });
  const problems = commits
    .filter(({ subject }) => !isConventionalCommitSubject(subject))
    .map(({ hash, subject }) => `${hash} "${subject}" is not a Conventional Commit subject.`);

  return {
    problems,
    summary: problems.length === 0
      ? `Commit check passed against ${baseRef} (${count(commits.length, "commit")}).`
      : commitSubjectHint,
  };
}

/** Accept Conventional Commits subjects and Git's default `Revert "..."` subject. */
export function isConventionalCommitSubject(subject: string): boolean {
  return conventionalSubjectPattern.test(subject) || gitRevertSubjectPattern.test(subject);
}

async function resolveCommit(root: string, ref: string): Promise<string> {
  // Refuse option-like refs so a crafted --base value cannot become a Git option.
  if (!ref.startsWith("-")) {
    try {
      return (await git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).trim();
    } catch {
      // Report every resolution failure with the same actionable message below.
    }
  }
  throw new Error(`Cannot resolve base ref "${ref}" to a commit. Fetch it first or pass another --base ref.`);
}

async function findMergeBase(root: string, base: string, baseRef: string): Promise<string> {
  try {
    return (await git(root, ["merge-base", base, "HEAD"])).trim();
  } catch (error) {
    // merge-base exits 1 without output when the histories share no commit, including in shallow clones.
    if (typeof error === "object" && error !== null && "code" in error && error.code === 1) {
      throw new Error(
        `Cannot find a merge base between "${baseRef}" and HEAD. Fetch the full history of both (for example, actions/checkout with fetch-depth: 0).`,
      );
    }
    throw error;
  }
}

async function readSkillVersion(root: string, commit: string, directory: string): Promise<string | null> {
  const entry = await git(root, ["--literal-pathspecs", "ls-tree", "-z", "--full-tree", commit, "--", `${directory}/SKILL.md`]);
  const blob = /^100(?:644|755) blob ([0-9a-f]+)\t/.exec(entry);
  if (blob === null) return null;

  const frontmatter = parseSkillDocument(await git(root, ["cat-file", "blob", blob[1]])).frontmatter;
  const metadata = frontmatter?.metadata;
  if (!isRecord(metadata)) return null;
  return typeof metadata.version === "string" ? metadata.version : null;
}

async function git(root: string, arguments_: string[]): Promise<string> {
  const { stdout } = await executeFile("git", arguments_, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
