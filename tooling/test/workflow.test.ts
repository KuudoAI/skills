import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

type WorkflowStep = {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type Workflow = {
  on: { pull_request?: unknown; push?: { branches?: string[] } };
  permissions?: Record<string, string>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs?: Record<string, {
    "runs-on"?: string;
    needs?: string | string[];
    permissions?: Record<string, string>;
    steps?: WorkflowStep[];
  }>;
};

// Actions are matched by name, not by commit, so Dependabot can move the pins.
// The pinning test below checks that every pin is a full SHA with a version comment.
const CHECKOUT = "actions/checkout@";
const SETUP_NODE = "actions/setup-node@";
const RELEASE_PLEASE = "googleapis/release-please-action@";
const PULL_REQUEST_ONLY = "github.event_name == 'pull_request'";
const BASE_REF = "origin/${{ github.base_ref }}";

const usesAction = (step: WorkflowStep, action: string): boolean => step.uses?.startsWith(action) ?? false;

async function readWorkflow(name: string): Promise<{ raw: string; workflow: Workflow }> {
  const raw = await readFile(`.github/workflows/${name}`, "utf8");
  return { raw, workflow: parse(raw) as Workflow };
}

function stepsOf(workflow: Workflow, job?: string): WorkflowStep[] {
  const jobs = job ? [workflow.jobs?.[job]] : Object.values(workflow.jobs ?? {});
  return jobs.flatMap((entry) => entry?.steps ?? []);
}

test("every workflow pins third-party actions to a full commit SHA with a version comment", async () => {
  for (const name of ["validate.yml", "release.yml"]) {
    const { raw, workflow } = await readWorkflow(name);
    const uses = stepsOf(workflow).flatMap((step) => (step.uses ? [step.uses] : []));
    assert(uses.length > 0, name);
    for (const action of uses) {
      assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${name}: ${action}`);
    }
    for (const line of raw.split("\n").filter((entry) => /^\s*(-\s*)?uses:/.test(entry))) {
      assert.match(line, /@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${name}: ${line.trim()}`);
    }
  }
});

test("validation workflow checks the repository on pull requests and pushes to main", async () => {
  const { workflow } = await readWorkflow("validate.yml");

  assert("pull_request" in workflow.on);
  assert.deepEqual(workflow.on.push?.branches, ["main"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.jobs?.validate?.["runs-on"], "ubuntu-24.04");

  const steps = stepsOf(workflow, "validate");
  const checkout = steps.find((step) => usesAction(step, CHECKOUT));
  assert(checkout);
  assert.equal(checkout.with?.["fetch-depth"], 0);
  const setupNode = steps.find((step) => usesAction(step, SETUP_NODE));
  assert(setupNode);
  assert.equal(setupNode.with?.["node-version"], 22);
  assert.equal(setupNode.with?.cache, "npm");
  for (const command of ["npm ci", "npm test", "npm run version:check", "npm audit --audit-level=high"]) {
    assert(steps.some((step) => step.run === command), command);
  }
});

test("pull requests must bump changed skills and use conventional commits", async () => {
  const { workflow } = await readWorkflow("validate.yml");
  const steps = stepsOf(workflow, "validate");

  for (const command of [
    `npm run skills:version-check -- --base ${BASE_REF}`,
    `npm run commits:check -- --base ${BASE_REF}`,
  ]) {
    const step = steps.find((entry) => entry.run === command);
    assert(step, command);
    assert.equal(step.if, PULL_REQUEST_ONLY, command);
  }
});

test("release workflow validates main before release-please opens or publishes a release", async () => {
  const { workflow } = await readWorkflow("release.yml");

  assert.deepEqual(workflow.on.push?.branches, ["main"]);
  // Least privilege per job: only the release job can write, and nothing that can write
  // restores a dependency cache (cache-poisoning hardening).
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.jobs?.verify?.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs?.release?.permissions, { contents: "write", "pull-requests": "write" });
  assert.deepEqual(workflow.concurrency, { group: "release-main", "cancel-in-progress": false });

  const verify = stepsOf(workflow, "verify");
  assert.equal(workflow.jobs?.verify?.["runs-on"], "ubuntu-24.04");
  assert(verify.some((step) => usesAction(step, CHECKOUT)));
  const verifyNode = verify.find((step) => usesAction(step, SETUP_NODE));
  assert(verifyNode);
  assert.equal(verifyNode.with?.cache, undefined);
  for (const command of ["npm ci", "npm test", "npm run version:check"]) {
    assert(verify.some((step) => step.run === command), command);
  }

  assert.equal(workflow.jobs?.release?.["runs-on"], "ubuntu-24.04");
  assert.equal(workflow.jobs?.release?.needs, "verify");
  const releasePlease = stepsOf(workflow, "release").find((step) => usesAction(step, RELEASE_PLEASE));
  assert(releasePlease);
  assert.equal(releasePlease.with?.token, "${{ secrets.RELEASE_PLEASE_TOKEN || github.token }}");
  assert.equal(releasePlease.with?.["config-file"], "release-please-config.json");
  assert.equal(releasePlease.with?.["manifest-file"], ".release-please-manifest.json");
});

test("release-please updates exactly the synchronized version fields", async () => {
  const config = JSON.parse(await readFile("release-please-config.json", "utf8")) as {
    packages: Record<string, {
      "release-type"?: string;
      "package-name"?: string;
      "changelog-path"?: string;
      "include-component-in-tag"?: boolean;
      "extra-files"?: Array<{ type: string; path: string; jsonpath: string }>;
    }>;
  };
  const manifest = JSON.parse(await readFile(".release-please-manifest.json", "utf8")) as Record<string, string>;
  const versionFiles = JSON.parse(await readFile(".version-bump.json", "utf8")) as {
    files: Array<{ path: string; field: string }>;
  };
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };

  const root = config.packages["."];
  assert(root);
  assert.equal(root["release-type"], "node");
  assert.equal(root["package-name"], "kuudo-skills");
  assert.equal(root["changelog-path"], "RELEASE-NOTES.md");
  assert.equal(root["include-component-in-tag"], false);
  assert.deepEqual(manifest, { ".": packageJson.version });

  // The node release type updates package.json and package-lock.json itself; every
  // other synchronized file must be an extra-file with the matching JSON path.
  const expected = versionFiles.files
    .filter(({ path }) => path !== "package.json" && path !== "package-lock.json")
    .map(({ path, field }) => ({
      type: "json",
      path,
      jsonpath: `$.${field.replace(/\.(\d+)(?=\.|$)/g, "[$1]")}`,
    }));
  assert.deepEqual(root["extra-files"], expected);
});

test("release notes have no manual Unreleased section for release-please to stall behind", async () => {
  const notes = await readFile("RELEASE-NOTES.md", "utf8");
  assert.doesNotMatch(notes, /^## Unreleased/m);
  assert.match(notes, /^## v\d+\.\d+\.\d+/m);
});

test("dependabot keeps GitHub Actions and npm dependencies current", async () => {
  const config = parse(await readFile(".github/dependabot.yml", "utf8")) as {
    version: number;
    updates: Array<{ "package-ecosystem": string; directory: string }>;
  };
  assert.equal(config.version, 2);
  const ecosystems = config.updates.map((update) => update["package-ecosystem"]).sort();
  assert.deepEqual(ecosystems, ["github-actions", "npm"]);
});

test("dependabot groups only minor and patch updates and holds Node types to the runtime major", async () => {
  const config = parse(await readFile(".github/dependabot.yml", "utf8")) as {
    updates: Array<{
      "package-ecosystem": string;
      groups?: Record<string, { "update-types"?: string[] }>;
      ignore?: Array<{ "dependency-name": string; "update-types"?: string[] }>;
    }>;
  };
  for (const update of config.updates) {
    const groups = Object.values(update.groups ?? {});
    assert(groups.length > 0, update["package-ecosystem"]);
    for (const group of groups) {
      assert.deepEqual(group["update-types"], ["minor", "patch"], update["package-ecosystem"]);
    }
  }
  const npm = config.updates.find((update) => update["package-ecosystem"] === "npm");
  assert(npm?.ignore?.some((rule) =>
    rule["dependency-name"] === "@types/node" && rule["update-types"]?.includes("version-update:semver-major")));

  const validate = parse(await readFile(".github/workflows/validate.yml", "utf8")) as Workflow;
  const nodeVersion = stepsOf(validate, "validate").find((step) => usesAction(step, SETUP_NODE))?.with?.["node-version"];
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.equal(packageJson.devDependencies["@types/node"]?.match(/\d+/)?.[0], String(nodeVersion));
});

test("TypeScript loads Node's built-in types explicitly, as TypeScript 6 and later require", async () => {
  const tsconfig = JSON.parse(await readFile("tsconfig.json", "utf8")) as { compilerOptions: { types?: string[] } };
  assert.deepEqual(tsconfig.compilerOptions.types, ["node"]);
});
