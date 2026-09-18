import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = process.cwd();

type JsonObject = Record<string, unknown>;

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(join(root, path), "utf8")) as JsonObject;
}

async function runBash(path: string, ...arguments_: string[]): Promise<JsonObject> {
  const { stdout, stderr } = await execute("bash", [path, ...arguments_], { cwd: root });
  assert.equal(stderr, "");
  return JSON.parse(stdout) as JsonObject;
}

function sessionOutput(envelope: JsonObject): JsonObject {
  return (envelope.hookSpecificOutput ?? {}) as JsonObject;
}

test("Claude package, plugin, marketplace, and hook metadata agree", async () => {
  const packageJson = await readJson("package.json");
  const plugin = await readJson(".claude-plugin/plugin.json");
  const marketplace = await readJson(".claude-plugin/marketplace.json");
  const hooks = await readJson("hooks/hooks.json");
  const entries = marketplace.plugins as JsonObject[];
  const sessionStart = ((hooks.hooks as JsonObject).SessionStart as JsonObject[])[0];
  const registrations = sessionStart.hooks as JsonObject[];

  assert.equal(plugin.name, "kuudo-skills");
  assert.equal(packageJson.version, "0.1.0");
  assert.equal(plugin.version, packageJson.version);
  assert.equal(marketplace.name, "kuudo-skills-dev");
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.name, plugin.name);
  assert.equal(entries[0]?.version, packageJson.version);
  assert.equal(entries[0]?.source, "./");
  assert.deepEqual(sessionStart.matcher, "startup|clear|compact");
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0], {
    type: "command",
    command: '"${CLAUDE_PLUGIN_ROOT}/hooks/session-start"',
    shell: "bash",
    async: false,
  });
});

test("session-start injects the complete bootstrap skill", async () => {
  const skill = await readFile(join(root, "skills/using-kuudo/SKILL.md"), "utf8");
  const envelope = await runBash("hooks/session-start");
  const output = sessionOutput(envelope);
  const context = output.additionalContext as string;

  assert.equal(output.hookEventName, "SessionStart");
  assert.match(context, /kuudo-skills:using-kuudo/);
  assert.match(context, /host's Skill tool/);
  assert.match(context, /Use this exact format and do not paraphrase/);
  assert.ok(context.includes(skill));
  assert.ok(context.includes("---\nname: using-kuudo\n"));
});

test("session-start degrades to valid diagnostic context when the bootstrap is missing", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "kuudo-claude-hook-"));
  const hooksDirectory = join(temporaryRoot, "hooks");
  await mkdir(hooksDirectory);
  await copyFile(join(root, "hooks/session-start"), join(hooksDirectory, "session-start"));

  const { stdout } = await execute("bash", [join(hooksDirectory, "session-start")]);
  const output = sessionOutput(JSON.parse(stdout) as JsonObject);

  assert.equal(output.hookEventName, "SessionStart");
  assert.match(output.additionalContext as string, /could not load.*using-kuudo/i);
});

test("session hook remains dependency-free, domain-neutral, and heredoc-free", async () => {
  const sessionStart = await readFile(join(root, "hooks/session-start"), "utf8");

  assert.doesNotMatch(sessionStart, /<</);
  assert.doesNotMatch(sessionStart, /\b(?:node|npm|python|perl|jq)\b/i);
  assert.doesNotMatch(sessionStart, /ads\.|seller\.|vendor\.|mcp|credential/i);
});
