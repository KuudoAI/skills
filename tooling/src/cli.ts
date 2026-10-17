import { checkCatalogArtifacts, writeCatalogArtifacts } from "./catalog.js";
import { exportTesslScenarios, type TesslExportOptions } from "./eval-export.js";
import { checkCommitSubjects, checkSkillVersionBumps } from "./release-checks.js";
import { scaffoldSkill } from "./scaffold.js";
import { validateRepository } from "./validate.js";

const usage = "Usage: skill:new <name> | validate | catalog <build|check> | version-check --base <ref> | commit-check --base <ref> | evals export tessl --out <dir> [--skill <name>]... [--scenario <skill>-<id>]... [--limit <n>] [--include-live]";
const releaseChecks = { "version-check": checkSkillVersionBumps, "commit-check": checkCommitSubjects };

async function main(arguments_: string[]): Promise<number> {
  if (arguments_.length === 2 && arguments_[0] === "new") {
    const created = await scaffoldSkill(process.cwd(), arguments_[1]);
    process.stdout.write(`${created.join("\n")}\n`);
    return 0;
  }

  if (arguments_.length === 1 && arguments_[0] === "validate") {
    let issues = await validateRepository(process.cwd());
    if (issues.length === 0) {
      issues = await checkCatalogArtifacts(process.cwd());
    }
    if (issues.length === 0) return 0;
    process.stdout.write(`${issues.map(formatIssue).join("\n")}\n`);
    return 1;
  }

  if (arguments_.length === 2 && arguments_[0] === "catalog" && arguments_[1] === "build") {
    await writeCatalogArtifacts(process.cwd());
    return 0;
  }

  if (arguments_.length === 2 && arguments_[0] === "catalog" && arguments_[1] === "check") {
    const issues = await checkCatalogArtifacts(process.cwd());
    if (issues.length === 0) return 0;
    process.stdout.write(`${issues.map(formatIssue).join("\n")}\n`);
    return 1;
  }

  if (arguments_[0] === "evals" && arguments_[1] === "export" && arguments_[2] === "tessl") {
    const parsed = parseExportArguments(arguments_.slice(3));
    if (!parsed) {
      process.stderr.write(`${usage}\n`);
      return 2;
    }
    const result = await exportTesslScenarios(process.cwd(), parsed.out, parsed.options);
    process.stdout.write(`${[...result.skipped.map((line) => `skipped ${line}`), `Exported ${result.scenarios.length} scenarios to ${parsed.out}.`].join("\n")}\n`);
    return 0;
  }

  const command = arguments_[0];
  if (command === "version-check" || command === "commit-check") {
    if (arguments_.length !== 3 || arguments_[1] !== "--base") {
      process.stderr.write(`${command} requires --base <ref>.\n${usage}\n`);
      return 2;
    }
    const result = await releaseChecks[command](process.cwd(), arguments_[2]);
    process.stdout.write(`${[...result.problems, result.summary].join("\n")}\n`);
    return result.problems.length === 0 ? 0 : 1;
  }

  process.stderr.write(`${usage}\n`);
  return 2;
}

function parseExportArguments(arguments_: string[]): { out: string; options: TesslExportOptions } | undefined {
  let out: string | undefined;
  const options: TesslExportOptions = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (flag === "--include-live") {
      options.includeLive = true;
    } else if (flag === "--out" && value) {
      out = value;
      index += 1;
    } else if (flag === "--skill" && value) {
      options.skills = [...(options.skills ?? []), value];
      index += 1;
    } else if (flag === "--scenario" && value) {
      options.scenarios = [...(options.scenarios ?? []), value];
      index += 1;
    } else if (flag === "--limit" && value && /^[1-9]\d*$/.test(value)) {
      options.limit = Number(value);
      index += 1;
    } else {
      return undefined;
    }
  }
  return out ? { out, options } : undefined;
}

function formatIssue(issue: { path: string; message: string }): string {
  return `${issue.path}: ${issue.message}`;
}

void main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  },
);
