import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type JsonObject = Record<string, unknown>;

// Gemini CLI reports these SessionStart sources and matches them against a hook's matcher
// by exact string, after treating an empty matcher or "*" as match-all.
const GEMINI_SESSION_START_TRIGGERS = ["startup", "resume", "clear"];

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

test("Gemini CLI extension exposes native skill discovery without a context file or routing layer", async () => {
  const packageJson = await readJson("package.json");
  const extension = await readJson("gemini-extension.json");

  assert.deepEqual(Object.keys(extension).sort(), ["description", "name", "version"]);
  assert.equal(extension.name, "kuudo-skills");
  assert.equal(extension.version, packageJson.version);
  assert.equal(extension.description, "Kuudo skills for Amazon commerce workflows");
});

test("the Claude Code session-start hook cannot run in Gemini CLI", async () => {
  // Gemini CLI loads hooks/hooks.json from every extension but does not resolve
  // ${CLAUDE_PLUGIN_ROOT}, so the hook command would fail there if a matcher selected it.
  const hooks = (await readJson("hooks/hooks.json")).hooks as JsonObject;

  assert.deepEqual(Object.keys(hooks), ["SessionStart"]);
  for (const entry of hooks.SessionStart as JsonObject[]) {
    const matcher = String(entry.matcher ?? "").trim();
    assert.notEqual(matcher, "");
    assert.notEqual(matcher, "*");
    assert(!GEMINI_SESSION_START_TRIGGERS.includes(matcher), matcher);
  }
});
