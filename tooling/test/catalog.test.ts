import assert from "node:assert/strict";
import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { checkCatalogArtifacts, generateCatalogArtifacts, writeCatalogArtifacts } from "../src/catalog.js";
import { createCatalogRepository, createEmptyRepository, validEntry, validThirdPartyEntry, writeJson } from "./helpers.js";

test("groups skills for skills.sh and sorts each group", async () => {
  const root = await createCatalogRepository([
    { ...validEntry("zulu"), classification: "community" },
    { ...validEntry("alpha"), classification: "certified" },
  ]);
  await writeJson(root, "evals/alpha/trigger-cases.json", [
    { query: "Use alpha", should_trigger: true },
    { query: "Use zulu", should_trigger: false },
  ]);

  const artifacts = await generateCatalogArtifacts(root);
  const manifest = JSON.parse(artifacts["skills.sh.json"]!);

  assert.equal(manifest.$schema, "https://skills.sh/schemas/skills.sh.schema.json");
  assert.equal(manifest.notGrouped, "bottom");
  assert.deepEqual(manifest.groupings[0], {
    title: "KuudoAI Certified",
    description: "Skills reviewed and certified by KuudoAI.",
    skills: ["alpha"],
  });
  assert.deepEqual(manifest.groupings[1], {
    title: "Community",
    description: "Community-contributed skills.",
    skills: ["zulu"],
  });
});

test("sorts multiple skills alphabetically within the same group", async () => {
  const root = await createCatalogRepository([
    validEntry("zulu"),
    validEntry("alpha"),
    validEntry("middle"),
  ]);

  const artifacts = await generateCatalogArtifacts(root);
  const manifest = JSON.parse(artifacts["skills.sh.json"]!);

  assert.deepEqual(manifest.groupings, [{
    title: "Community",
    description: "Community-contributed skills.",
    skills: ["alpha", "middle", "zulu"],
  }]);
});

test("renders immutable third-party provenance", async () => {
  const entry = validThirdPartyEntry("external");
  const root = await createCatalogRepository([entry]);

  const notices = (await generateCatalogArtifacts(root))["THIRD_PARTY_NOTICES.md"];

  assert.match(notices, /external/);
  assert.match(notices, new RegExp(entry.source!.repository));
  assert.match(notices, new RegExp(entry.source!.path));
  assert.match(notices, new RegExp(entry.source!.revision));
  assert.match(notices, /Apache-2.0/);
});

test("renders empty catalog artifacts for an empty repository", async () => {
  const root = await createEmptyRepository();

  const artifacts = await generateCatalogArtifacts(root);

  assert.equal(artifacts["skills.sh.json"], undefined);
  assert.match(artifacts["THIRD_PARTY_NOTICES.md"], /No third-party skills are included/);
  assert.match(artifacts["THIRD_PARTY_NOTICES.md"], /\n$/);
});

test("writes artifacts and reports generated artifact drift without mutating files", async () => {
  const root = await createCatalogRepository([validEntry("alpha")]);

  await writeCatalogArtifacts(root);
  assert.deepEqual(await checkCatalogArtifacts(root), []);

  const manifestPath = join(root, "skills.sh.json");
  await writeFile(manifestPath, "stale\n", "utf8");
  const issues = await checkCatalogArtifacts(root);

  assert.deepEqual(issues, [{ path: "skills.sh.json", message: "Generated artifact is missing or stale." }]);
  assert.equal(await readFile(manifestPath, "utf8"), "stale\n");
});

test("reports missing generated artifacts", async () => {
  const root = await createEmptyRepository();

  assert.deepEqual(await checkCatalogArtifacts(root), [
    { path: "THIRD_PARTY_NOTICES.md", message: "Generated artifact is missing or stale." },
  ]);
});

test("reports a stale manifest when an empty catalog has one", async () => {
  const root = await createEmptyRepository();
  await writeFile(join(root, "skills.sh.json"), "stale\n", "utf8");

  assert.deepEqual(await checkCatalogArtifacts(root), [
    { path: "skills.sh.json", message: "Generated artifact is missing or stale." },
    { path: "THIRD_PARTY_NOTICES.md", message: "Generated artifact is missing or stale." },
  ]);
});

test("removes a stale manifest while writing empty catalog artifacts", async () => {
  const root = await createEmptyRepository();
  const manifestPath = join(root, "skills.sh.json");
  await writeFile(manifestPath, "stale\n", "utf8");

  await writeCatalogArtifacts(root);

  await assert.rejects(readFile(manifestPath, "utf8"), { code: "ENOENT" });
  assert.deepEqual(await checkCatalogArtifacts(root), []);
});

test("refuses generation and writes when repository validation fails", async () => {
  const entry = validThirdPartyEntry("external");
  const { source: _source, ...invalidEntry } = entry;
  const root = await createCatalogRepository([entry]);
  await writeJson(root, "catalog/entries/external.json", invalidEntry);
  const noticesPath = join(root, "THIRD_PARTY_NOTICES.md");
  await writeFile(noticesPath, "preserve me\n", "utf8");

  await assert.rejects(generateCatalogArtifacts(root), /source/);
  await assert.rejects(writeCatalogArtifacts(root), /source/);
  assert.equal(await readFile(noticesPath, "utf8"), "preserve me\n");
  assert.match(JSON.stringify(await checkCatalogArtifacts(root)), /source/);
});

test("does not follow generated artifact symlinks", async () => {
  const root = await createEmptyRepository();
  const externalRoot = await createEmptyRepository();
  const external = join(externalRoot, "external-notices.md");
  const artifact = join(root, "THIRD_PARTY_NOTICES.md");
  await writeFile(external, "preserve me\n", "utf8");
  await symlink(external, artifact);

  assert.deepEqual(await checkCatalogArtifacts(root), [{
    path: "THIRD_PARTY_NOTICES.md",
    message: "Generated artifact must be a regular file and not a symbolic link.",
  }]);
  await assert.rejects(writeCatalogArtifacts(root), /THIRD_PARTY_NOTICES\.md.*symbolic link/);
  assert.equal(await readFile(external, "utf8"), "preserve me\n");
});

test("does not treat a dangling generated artifact symlink as absent", async () => {
  const root = await createEmptyRepository();
  const externalRoot = await createEmptyRepository();
  const external = join(externalRoot, "missing-notices.md");
  const artifact = join(root, "THIRD_PARTY_NOTICES.md");
  await symlink(external, artifact);

  assert.deepEqual(await checkCatalogArtifacts(root), [{
    path: "THIRD_PARTY_NOTICES.md",
    message: "Generated artifact must be a regular file and not a symbolic link.",
  }]);
  await assert.rejects(writeCatalogArtifacts(root), /THIRD_PARTY_NOTICES\.md.*symbolic link/);
  assert((await lstat(artifact)).isSymbolicLink());
  await assert.rejects(lstat(external), { code: "ENOENT" });
});

test("refuses to generate artifacts from a symlinked catalog entries container", async () => {
  const root = await createEmptyRepository();
  await mkdir(join(root, "skills", "external"), { recursive: true });
  await writeFile(join(root, "skills", "external", "SKILL.md"), "---\nname: external\ndescription: External fixture.\n---\n\n# External\n", "utf8");
  await mkdir(join(root, "catalog"), { recursive: true });
  const externalRoot = await createCatalogRepository([validEntry("external")]);
  await symlink(join(externalRoot, "catalog", "entries"), join(root, "catalog", "entries"), "dir");

  await assert.rejects(
    generateCatalogArtifacts(root),
    /catalog\/entries: Repository container must be a real directory and not a symbolic link/,
  );
});
