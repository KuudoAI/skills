import assert from "node:assert/strict";
import { mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exportTesslScenarios } from "../src/eval-export.js";
import { createRepository, read, writeJson } from "./helpers.js";

const outDirectory = (): Promise<string> => mkdtemp(join(tmpdir(), "tessl-scenarios-"));

async function repositoryWithEvals(): Promise<string> {
  const root = await createRepository({
    "skills/amazon-sp-messaging-api/evals/files/INV-1.pdf": "%PDF-1.4 invoice\n",
    "skills/amazon-sp-messaging-api/SKILL.md": "---\nname: amazon-sp-messaging-api\n---\n",
  });
  await writeJson(root, "skills/amazon-sp-messaging-api/evals/evals.json", {
    skill_name: "amazon-sp-messaging-api",
    skill_version: "0.1.0",
    evals: [
      {
        id: 1,
        prompt: "  Tell the buyer their order is delayed.  ",
        expected_output: "Previews the exact message and waits for approval.",
        files: [],
        assertions: [
          { name: "previews-first", condition: "Shows the exact message before sending" },
          { name: "no-unapproved-send", condition: "Does not send without an explicit yes" },
        ],
      },
      {
        id: 2,
        prompt: "Send the invoice at ./files/INV-1.pdf.",
        files: ["files/INV-1.pdf"],
        assertions: [{ text: "Attaches INV-1.pdf as an invoice", passed: null, evidence: "" }],
      },
      { id: 3, prompt: "Check live order status.", mode: "live-read", assertions: [{ name: "reads", condition: "Reads the order" }] },
      { id: 4, prompt: "Use the delay fixture.", fixture: "delay-single", assertions: [{ name: "x", condition: "Uses it" }] },
    ],
  });
  return root;
}

test("exports each eval as a Tessl scenario whose task holds only the prompt", async () => {
  const root = await repositoryWithEvals();
  const out = await outDirectory();
  const result = await exportTesslScenarios(root, out);

  assert.deepEqual(result.scenarios, ["amazon-sp-messaging-api-1", "amazon-sp-messaging-api-2"]);
  assert.equal(await read(out, "amazon-sp-messaging-api-1/task.md"), "Tell the buyer their order is delayed.\n");
  assert.deepEqual(JSON.parse(await read(out, "amazon-sp-messaging-api-1/criteria.json")), {
    context: "Previews the exact message and waits for approval.",
    type: "weighted_checklist",
    checklist: [
      { name: "previews-first", description: "Shows the exact message before sending", max_score: 1, category: "INTENT" },
      { name: "no-unapproved-send", description: "Does not send without an explicit yes", max_score: 1, category: "MUST_NOT" },
    ],
  });
  assert.doesNotMatch(await read(out, "amazon-sp-messaging-api-1/task.md"), /waits for approval/);
});

test("converts text-shaped assertions and copies input files with an include entry", async () => {
  const root = await repositoryWithEvals();
  const out = await outDirectory();
  await exportTesslScenarios(root, out);

  const criteria = JSON.parse(await read(out, "amazon-sp-messaging-api-2/criteria.json")) as { context: string; checklist: unknown[] };
  assert.equal(criteria.context, "Evaluates the amazon-sp-messaging-api skill.");
  assert.deepEqual(criteria.checklist, [
    { name: "attaches-inv-1-pdf-as-an-invoice", description: "Attaches INV-1.pdf as an invoice", max_score: 1, category: "INTENT" },
  ]);
  assert.equal(await read(out, "amazon-sp-messaging-api-2/files/INV-1.pdf"), "%PDF-1.4 invoice\n");
  assert.deepEqual(JSON.parse(await read(out, "amazon-sp-messaging-api-2/scenario.json")), { include: ["./files"] });
});

test("skips cases that need live or mocked Amazon tools unless asked to include them", async () => {
  const root = await repositoryWithEvals();
  const skipped = await exportTesslScenarios(root, await outDirectory());
  assert.deepEqual(skipped.skipped, [
    "amazon-sp-messaging-api-3: needs live or mocked Amazon tools",
    "amazon-sp-messaging-api-4: needs live or mocked Amazon tools",
  ]);

  const included = await exportTesslScenarios(root, await outDirectory(), { includeLive: true });
  assert.equal(included.scenarios.length, 4);
});

test("limits scenarios per skill and refuses to write into a non-empty directory", async () => {
  const root = await repositoryWithEvals();
  const out = await outDirectory();
  const result = await exportTesslScenarios(root, out, { skills: ["amazon-sp-messaging-api"], limit: 1 });
  assert.deepEqual(result.scenarios, ["amazon-sp-messaging-api-1"]);
  assert.deepEqual(await readdir(out), ["amazon-sp-messaging-api-1"]);

  const occupied = await outDirectory();
  await writeFile(join(occupied, "stale.txt"), "old\n");
  await assert.rejects(exportTesslScenarios(root, occupied), /is not empty/);
});

test("rejects eval input files outside the skill's evals directory", async () => {
  const root = await createRepository({ "skills/demo/SKILL.md": "---\nname: demo\n---\n" });
  await writeJson(root, "skills/demo/evals/evals.json", {
    evals: [{ id: 1, prompt: "Read it.", files: ["../SKILL.md"], assertions: [{ name: "a", condition: "Reads it" }] }],
  });
  await assert.rejects(exportTesslScenarios(root, await outDirectory()), /outside evals/);
});

test("exports only named scenarios and rejects names that do not exist", async () => {
  const root = await repositoryWithEvals();
  const out = await outDirectory();
  const result = await exportTesslScenarios(root, out, { scenarios: ["amazon-sp-messaging-api-2"] });
  assert.deepEqual(result.scenarios, ["amazon-sp-messaging-api-2"]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(await readdir(out), ["amazon-sp-messaging-api-2"]);

  await assert.rejects(
    exportTesslScenarios(root, await outDirectory(), { scenarios: ["amazon-sp-messaging-api-2", "amazon-sp-messaging-api-99"] }),
    /Unknown scenarios: amazon-sp-messaging-api-99\./,
  );
});

test("rejects a symlinked input file that resolves outside evals/ and writes nothing", async () => {
  const root = await createRepository({
    "secret.txt": "do not package\n",
    "skills/demo/SKILL.md": "---\nname: demo\n---\n",
    "skills/demo/evals/files/.keep": "",
  });
  await symlink(join(root, "secret.txt"), join(root, "skills/demo/evals/files/input.txt"));
  await writeJson(root, "skills/demo/evals/evals.json", {
    evals: [
      { id: 1, prompt: "Plain case.", assertions: [{ name: "a", condition: "Answers" }] },
      { id: 2, prompt: "Read files/input.txt.", files: ["files/input.txt"], assertions: [{ name: "b", condition: "Reads it" }] },
    ],
  });
  const out = await outDirectory();
  await assert.rejects(exportTesslScenarios(root, out), /demo-2: file files\/input\.txt is outside evals\//);
  assert.deepEqual(await readdir(out), []);
});

test("validates every selected case before writing, so a failed export leaves the output empty", async () => {
  const root = await repositoryWithEvals();
  const unknownOut = await outDirectory();
  await assert.rejects(
    exportTesslScenarios(root, unknownOut, { scenarios: ["amazon-sp-messaging-api-1", "amazon-sp-messaging-api-99"] }),
    /Unknown scenarios: amazon-sp-messaging-api-99\./,
  );
  assert.deepEqual(await readdir(unknownOut), []);

  await writeJson(root, "skills/amazon-sp-messaging-api/evals/evals.json", {
    evals: [
      { id: 1, prompt: "Fine.", assertions: [{ name: "a", condition: "Answers" }] },
      { id: 2, prompt: "Attach it.", files: ["files/missing.pdf"], assertions: [{ name: "b", condition: "Attaches it" }] },
    ],
  });
  const missingOut = await outDirectory();
  await assert.rejects(exportTesslScenarios(root, missingOut), /amazon-sp-messaging-api-2: file files\/missing\.pdf does not exist\./);
  assert.deepEqual(await readdir(missingOut), []);
});
