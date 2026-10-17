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
  jobs?: Record<string, { "runs-on"?: string; needs?: string | string[]; steps?: WorkflowStep[] }>;
};

const CHECKOUT = "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";
const SETUP_NODE = "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444";
const RELEASE_PLEASE = "googleapis/release-please-action@5c625bfb5d1ff62eadeeb3772007f7f66fdcf071";
const PULL_REQUEST_ONLY = "github.event_name == 'pull_request'";
const BASE_REF = "origin/${{ github.base_ref }}";

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
  const checkout = steps.find((step) => step.uses === CHECKOUT);
  assert(checkout);
  assert.equal(checkout.with?.["fetch-depth"], 0);
  const setupNode = steps.find((step) => step.uses === SETUP_NODE);
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
  assert.deepEqual(workflow.permissions, { contents: "write", "pull-requests": "write" });
  assert.deepEqual(workflow.concurrency, { group: "release-main", "cancel-in-progress": false });

  const verify = stepsOf(workflow, "verify");
  assert.equal(workflow.jobs?.verify?.["runs-on"], "ubuntu-24.04");
  assert(verify.some((step) => step.uses === CHECKOUT));
  assert(verify.some((step) => step.uses === SETUP_NODE));
  for (const command of ["npm ci", "npm test", "npm run version:check"]) {
    assert(verify.some((step) => step.run === command), command);
  }

  assert.equal(workflow.jobs?.release?.["runs-on"], "ubuntu-24.04");
  assert.equal(workflow.jobs?.release?.needs, "verify");
  const releasePlease = stepsOf(workflow, "release").find((step) => step.uses === RELEASE_PLEASE);
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
