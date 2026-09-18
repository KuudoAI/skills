import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { validateRepository } from "../src/validate.js";
import {
  createCompleteRepository,
  createRepository,
  createRepositoryWithValidSkill,
  formatIssues,
  validEntry,
  validThirdPartyEntry,
  writeJson,
} from "./helpers.js";

test("requires a one-to-one relationship between skills and catalog entries", async () => {
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/orphan.json", validEntry("orphan"));

  const messages = (await validateRepository(root)).map((issue) => issue.message);

  assert(messages.includes("Skill alpha has no catalog entry"));
  assert(messages.includes("Catalog entry orphan has no skill directory"));
});

test("requires first-party Amazon Ads consumer skills to expose account-context recovery", async () => {
  const root = await createCompleteRepository("amazon-ads-example");

  assert.match(
    formatIssues(await validateRepository(root)),
    /First-party Amazon Ads skills must provide the standard amazon-ads-accounts recovery guidance/,
  );
});

test("accepts the standard Amazon Ads account-context recovery guidance", async () => {
  const name = "amazon-ads-example";
  const root = await createCompleteRepository(name);
  await writeFile(
    join(root, "skills", name, "SKILL.md"),
    `---
name: ${name}
description: Use when testing an Amazon Ads example.
---

# Amazon Ads Example

## Account-context recovery

If Amazon account scope, identifier type, marketplace mapping, or account relationships become unclear, consult \`amazon-ads-accounts\` when it is available. Resume this skill after resolving the ambiguity. If it is unavailable, use equivalent read-only discovery and ask the user when multiple valid choices remain. Never guess or interchange identifier types.
`,
    "utf8",
  );

  assert.deepEqual(await validateRepository(root), []);
});

test("does not require the account-context recovery guidance on the account skill itself", async () => {
  const root = await createCompleteRepository("amazon-ads-accounts");

  assert.deepEqual(await validateRepository(root), []);
});

test("does not modify the contract for third-party Amazon Ads skills", async () => {
  const name = "amazon-ads-external";
  const root = await createCompleteRepository(name, validThirdPartyEntry(name));

  assert.deepEqual(await validateRepository(root), []);
});

test("requires immutable provenance for third-party skills", async () => {
  const root = await createCompleteRepository("external", {
    ...validEntry("external"),
    origin: "third-party",
    source: {
      repository: "https://github.com/example/skills",
      revision: "main",
      path: "skills/external",
    },
  });

  assert.match(formatIssues(await validateRepository(root)), /immutable Git revision/);
});

test("requires positive and negative trigger cases for certification", async () => {
  const root = await createCompleteRepository("reviewed", {
    ...validEntry("reviewed"),
    classification: "certified",
  });
  await writeJson(root, "evals/reviewed/trigger-cases.json", []);

  assert.match(formatIssues(await validateRepository(root)), /positive and one negative/);
});

test("applies certification trigger requirements despite unrelated catalog schema errors", async () => {
  const root = await createCompleteRepository("reviewed", {
    ...validEntry("reviewed"),
    classification: "certified",
    maintainers: [],
  });

  const issues = formatIssues(await validateRepository(root));

  assert.match(issues, /maintainers/);
  assert.match(issues, /positive and one negative/);
});

test("reports invalid catalog JSON without stopping other validation", async () => {
  const root = await createRepository({
    "skills/alpha/SKILL.md": "---\nname: alpha\ndescription: Alpha fixture.\n---\n\n# Alpha\n",
    "catalog/entries/alpha.json": "{ invalid json\n",
  });

  assert.match(formatIssues(await validateRepository(root)), /catalog\/entries\/alpha\.json: Invalid JSON/);
});

test("rejects catalog entries with unsupported properties", async () => {
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/alpha.json", { ...validEntry("alpha"), extra: true });
  await writeJson(root, "evals/alpha/trigger-cases.json", []);

  assert.match(formatIssues(await validateRepository(root)), /additional properties/);
});

test("requires the catalog filename to match the entry name", async () => {
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/wrong-name.json", validEntry("alpha"));

  assert.match(formatIssues(await validateRepository(root)), /filename must match its name/);
});

test("rejects catalog entries without maintainers", async () => {
  const root = await createCompleteRepository("alpha", { ...validEntry("alpha"), maintainers: [] });

  assert.match(formatIssues(await validateRepository(root)), /maintainers/);
});

test("rejects catalog entries without a license", async () => {
  const { license: _license, ...entryWithoutLicense } = validEntry("alpha");
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/alpha.json", entryWithoutLicense);
  await writeJson(root, "evals/alpha/trigger-cases.json", []);

  assert.match(formatIssues(await validateRepository(root)), /license/);
});

test("requires provenance source details for third-party entries", async () => {
  const { source: _source, ...entryWithoutSource } = validThirdPartyEntry("external");
  const root = await createCompleteRepository("external");
  await writeJson(root, "catalog/entries/external.json", entryWithoutSource);

  assert.match(formatIssues(await validateRepository(root)), /source/);
});

test("requires forward-slash Git-relative third-party provenance paths", async () => {
  for (const sourcePath of ["C:\\repo\\skills\\external", "\\\\server\\share\\external", "..\\skills\\external"]) {
    const root = await createCompleteRepository("external", {
      ...validThirdPartyEntry("external"),
      source: {
        ...validThirdPartyEntry("external").source!,
        path: sourcePath,
      },
    });

    assert.match(formatIssues(await validateRepository(root)), /source\/path/);
  }
});

test("permits the repository root as a third-party provenance path", async () => {
  const entry = validThirdPartyEntry("external");
  const root = await createCompleteRepository("external", {
    ...entry,
    source: { ...entry.source!, path: "." },
  });

  assert.deepEqual(await validateRepository(root), []);
});

test("rejects invalid trigger-case shapes", async () => {
  const root = await createCompleteRepository("alpha");
  await writeJson(root, "evals/alpha/trigger-cases.json", [{ query: "Need alpha", should_trigger: "yes" }]);

  const issues = formatIssues(await validateRepository(root));
  assert.match(issues, /should_trigger.*boolean/);
  assert.match(issues, /evaluation record/);
});

test("rejects evaluation directories without a catalog entry", async () => {
  const root = await createRepository({
    "evals/orphan/trigger-cases.json": "[]\n",
  });

  assert.match(formatIssues(await validateRepository(root)), /Evaluation orphan has no catalog entry/);
});

test("reports an orphan evaluation directory without a trigger-case file", async () => {
  const root = await createRepository({
    "evals/orphan/README.md": "No trigger cases yet.\n",
  });

  const issues = formatIssues(await validateRepository(root));
  assert.match(issues, /evals\/orphan\/trigger-cases\.json: Evaluation record does not exist/);
  assert.match(issues, /Evaluation orphan has no catalog entry/);
});

test("rejects a symlinked skills container without accepting external skills", async () => {
  const root = await createRepository({
    "catalog/entries/alpha.json": `${JSON.stringify(validEntry("alpha"))}\n`,
    "evals/alpha/trigger-cases.json": "[]\n",
  });
  const externalRoot = await createRepositoryWithValidSkill("alpha");
  await symlink(join(externalRoot, "skills"), join(root, "skills"), "dir");

  assert.deepEqual(await validateRepository(root), [
    { path: "catalog/entries/alpha.json", message: "Catalog entry alpha has no skill directory" },
    { path: "skills", message: "Repository container must be a real directory and not a symbolic link." },
  ]);
});

test("rejects a symlinked catalog container without accepting external records", async () => {
  const root = await createRepository({
    "skills/alpha/SKILL.md": "---\nname: alpha\ndescription: Alpha fixture.\n---\n\n# Alpha\n",
    "evals/alpha/trigger-cases.json": "[]\n",
  });
  const externalRoot = await createCompleteRepository("alpha");
  await symlink(join(externalRoot, "catalog"), join(root, "catalog"), "dir");

  assert.deepEqual(await validateRepository(root), [
    { path: "catalog", message: "Repository container must be a real directory and not a symbolic link." },
    { path: "evals/alpha/trigger-cases.json", message: "Evaluation alpha has no catalog entry" },
    { path: "skills/alpha/SKILL.md", message: "Skill alpha has no catalog entry" },
  ]);
});

test("rejects a symlinked catalog entries container without accepting external records", async () => {
  const root = await createRepository({
    "skills/alpha/SKILL.md": "---\nname: alpha\ndescription: Alpha fixture.\n---\n\n# Alpha\n",
    "catalog/README.md": "Catalog records.\n",
    "evals/alpha/trigger-cases.json": "[]\n",
  });
  const externalRoot = await createCompleteRepository("alpha");
  await symlink(join(externalRoot, "catalog", "entries"), join(root, "catalog", "entries"), "dir");

  assert.deepEqual(await validateRepository(root), [
    { path: "catalog/entries", message: "Repository container must be a real directory and not a symbolic link." },
    { path: "evals/alpha/trigger-cases.json", message: "Evaluation alpha has no catalog entry" },
    { path: "skills/alpha/SKILL.md", message: "Skill alpha has no catalog entry" },
  ]);
});

test("rejects a symlinked evaluations container without accepting external trigger cases", async () => {
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/alpha.json", { ...validEntry("alpha"), classification: "certified" });
  const externalRoot = await createRepository({
    "evals/alpha/trigger-cases.json": `${JSON.stringify([
      { query: "Use alpha", should_trigger: true },
      { query: "Do not use alpha", should_trigger: false },
    ])}\n`,
  });
  await symlink(join(externalRoot, "evals"), join(root, "evals"), "dir");

  assert.deepEqual(await validateRepository(root), [
    { path: "evals", message: "Repository container must be a real directory and not a symbolic link." },
    {
      path: "evals/alpha/trigger-cases.json",
      message: "Certified skill alpha must have at least one positive and one negative trigger case.",
    },
  ]);
});

test("rejects a symlinked skill evaluation container without accepting external trigger cases", async () => {
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/alpha.json", { ...validEntry("alpha"), classification: "certified" });
  await mkdir(join(root, "evals"), { recursive: true });
  const externalRoot = await createRepository({
    "evals/alpha/trigger-cases.json": `${JSON.stringify([
      { query: "Use alpha", should_trigger: true },
      { query: "Do not use alpha", should_trigger: false },
    ])}\n`,
  });
  await symlink(join(externalRoot, "evals", "alpha"), join(root, "evals", "alpha"), "dir");

  assert.deepEqual(await validateRepository(root), [
    { path: "evals/alpha", message: "Repository container must be a real directory and not a symbolic link." },
    {
      path: "evals/alpha/trigger-cases.json",
      message: "Certified skill alpha must have at least one positive and one negative trigger case.",
    },
  ]);
});

test("rejects a symlinked catalog record without accepting external metadata", async () => {
  const root = await createRepository({
    "skills/alpha/SKILL.md": "---\nname: alpha\ndescription: Alpha fixture.\n---\n\n# Alpha\n",
    "evals/alpha/trigger-cases.json": "[]\n",
  });
  await mkdir(join(root, "catalog", "entries"), { recursive: true });
  const externalRoot = await createRepository({
    "alpha.json": `${JSON.stringify(validEntry("alpha"))}\n`,
  });
  await symlink(join(externalRoot, "alpha.json"), join(root, "catalog", "entries", "alpha.json"));

  assert.deepEqual(await validateRepository(root), [
    {
      path: "catalog/entries/alpha.json",
      message: "Governance record must be a regular file and not a symbolic link.",
    },
    { path: "evals/alpha/trigger-cases.json", message: "Evaluation alpha has no catalog entry" },
    { path: "skills/alpha/SKILL.md", message: "Skill alpha has no catalog entry" },
  ]);
});

test("rejects a symlinked evaluation record without accepting external trigger cases", async () => {
  const root = await createRepositoryWithValidSkill("alpha");
  await writeJson(root, "catalog/entries/alpha.json", { ...validEntry("alpha"), classification: "certified" });
  await mkdir(join(root, "evals", "alpha"), { recursive: true });
  const externalRoot = await createRepository({
    "trigger-cases.json": `${JSON.stringify([
      { query: "Use alpha", should_trigger: true },
      { query: "Do not use alpha", should_trigger: false },
    ])}\n`,
  });
  await symlink(join(externalRoot, "trigger-cases.json"), join(root, "evals", "alpha", "trigger-cases.json"));

  assert.deepEqual(await validateRepository(root), [
    {
      path: "evals/alpha/trigger-cases.json",
      message: "Certified skill alpha must have at least one positive and one negative trigger case.",
    },
    {
      path: "evals/alpha/trigger-cases.json",
      message: "Governance record must be a regular file and not a symbolic link.",
    },
  ]);
});
