import { checkCatalogArtifacts, writeCatalogArtifacts } from "./catalog.js";
import { scaffoldSkill } from "./scaffold.js";
import { validateRepository } from "./validate.js";

const usage = "Usage: skill:new <name> | validate | catalog <build|check>";

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

  process.stderr.write(`${usage}\n`);
  return 2;
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
