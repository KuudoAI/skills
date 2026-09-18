import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

type WorkflowStep = {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
};

test("validation workflow checks the repository on pull requests and pushes to main", async () => {
  const workflow = parse(await readFile(".github/workflows/validate.yml", "utf8")) as {
    on: { pull_request?: unknown; push?: { branches?: string[] } };
    permissions?: Record<string, string>;
    jobs?: Record<string, { steps?: WorkflowStep[] }>;
  };

  assert("pull_request" in workflow.on);
  assert.deepEqual(workflow.on.push?.branches, ["main"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });

  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);

  assert(steps.some((step) => step.uses === "actions/checkout@v4"));
  const setupNode = steps.find((step) => step.uses === "actions/setup-node@v4");
  assert(setupNode);
  assert.equal(setupNode.with?.["node-version"], 22);
  assert.equal(setupNode.with?.cache, "npm");
  assert(steps.some((step) => step.run === "npm ci"));
  assert(steps.some((step) => step.run === "npm test"));
  assert(steps.some((step) => step.run === "npm audit --audit-level=high"));
});
