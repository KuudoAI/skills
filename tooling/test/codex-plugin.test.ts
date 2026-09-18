import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type JsonObject = Record<string, unknown>;

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

test("Codex plugin exposes native skill discovery without host hooks", async () => {
  const packageJson = await readJson("package.json");
  const plugin = await readJson(".codex-plugin/plugin.json");
  const pluginInterface = plugin.interface as JsonObject;

  assert.equal(plugin.name, "kuudo-skills");
  assert.equal(plugin.version, packageJson.version);
  assert.equal(plugin.skills, "./skills/");
  assert.deepEqual(plugin.hooks, {});
  assert.equal(pluginInterface.displayName, "Kuudo Skills");
  assert.equal(pluginInterface.shortDescription, "Amazon commerce workflows for AI agents");
  assert.equal(pluginInterface.category, "Business & Operations");
  assert.deepEqual(pluginInterface.capabilities, ["Interactive", "Read", "Write"]);
});

test("Codex local marketplace uses the working-tree same-root source", async () => {
  const plugin = await readJson(".codex-plugin/plugin.json");
  const marketplace = await readJson(".agents/plugins/marketplace.json");
  const entries = marketplace.plugins as JsonObject[];

  assert.equal(marketplace.name, "kuudo-skills-dev");
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.name, plugin.name);
  assert.deepEqual(entries[0]?.source, { source: "local", path: "." });
  assert.deepEqual(entries[0]?.policy, {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  });
});

test("Codex metadata contains no routing layer or synthetic aliases", async () => {
  for (const path of [".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"]) {
    const document = await readJson(path);
    const serialized = JSON.stringify(document);

    assert.equal(Object.hasOwn(document, "mcpServers"), false);
    assert.equal(Object.hasOwn(document, "routes"), false);
    assert.equal(Object.hasOwn(document, "capabilityRegistry"), false);
    assert.doesNotMatch(serialized, /ads\.(?:accounts\.read|reports\.create|campaigns\.update-budget)/);
  }
});
