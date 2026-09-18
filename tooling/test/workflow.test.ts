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

test("validation workflow checks the repository on pull requests and pushes to main", async () => {
  const workflow = parse(await readFile(".github/workflows/validate.yml", "utf8")) as {
    on: { pull_request?: unknown; push?: { branches?: string[] } };
    permissions?: Record<string, string>;
    jobs?: Record<string, { "runs-on"?: string; steps?: WorkflowStep[] }>;
  };

  assert("pull_request" in workflow.on);
  assert.deepEqual(workflow.on.push?.branches, ["main"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });

  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);

  assert.equal(workflow.jobs?.validate?.["runs-on"], "ubuntu-24.04");
  assert(steps.some((step) => step.uses === "actions/checkout@v5"));
  const setupNode = steps.find((step) => step.uses === "actions/setup-node@v5");
  assert(setupNode);
  assert.equal(setupNode.with?.["node-version"], 22);
  assert.equal(setupNode.with?.cache, "npm");
  assert(steps.some((step) => step.run === "npm ci"));
  assert(steps.some((step) => step.run === "npm test"));
  assert(steps.some((step) => step.run === "npm audit --audit-level=high"));
});

test("release workflow validates main and publishes a new version tag", async () => {
  const workflow = parse(await readFile(".github/workflows/release.yml", "utf8")) as {
    on: { push?: { branches?: string[] } };
    permissions?: Record<string, string>;
    jobs?: Record<string, { "runs-on"?: string; steps?: WorkflowStep[] }>;
  };

  assert.deepEqual(workflow.on.push?.branches, ["main"]);
  assert.deepEqual(workflow.permissions, { contents: "write" });
  assert.equal(workflow.jobs?.release?.["runs-on"], "ubuntu-24.04");

  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
  assert(steps.some((step) => step.id === "version" && step.env?.BEFORE_SHA === "${{ github.event.before }}"));
  assert(steps.some((step) => step.if === "steps.version.outputs.should_release == 'true'"));
  assert(steps.some((step) => step.uses === "actions/checkout@v5"));
  assert(steps.some((step) => step.uses === "actions/setup-node@v5"));
  assert(steps.some((step) => step.run === "npm ci"));
  assert(steps.some((step) => step.run === "npm test"));
  const release = steps.find((step) => step.run?.includes("gh release create"));
  assert(release);
  assert.match(release.run ?? "", /--target/);
  assert.match(release.run ?? "", /--generate-notes/);
});
