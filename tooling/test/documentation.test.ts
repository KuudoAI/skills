import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type JsonObject = Record<string, unknown>;

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

test("README documents portable installation and trust labels", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /https:\/\/agentskills\.io\/home/);
  assert.match(readme, /https:\/\/agentskills\.io\/specification/);
  assert.match(readme, /npx skills add KuudoAI\/skills --skill <skill-name>/);
  assert.match(readme, /npx skills add https:\/\/github\.com\/KuudoAI\/skills\/tree\/main\/skills\/<skill-name>/);
  assert.match(readme, /certified/i);
  assert.match(readme, /community/i);
  assert.match(readme, /CONTRIBUTING\.md/);
  assert.match(readme, /SECURITY\.md/);
  assert.match(readme, /docs\/plugin-installation\.md/);
  assert.match(readme, /docs\/mcp-configuration\.md/);
  assert.match(readme, /whole suite/i);
  assert.match(readme, /one (?:portable )?skill/i);
  assert.match(readme, /npm run smoke/);
});

test("public package metadata applies PolyForm Shield to all KuudoAI-authored content", async () => {
  const packageJson = await readJson("package.json");
  const claudePlugin = await readJson(".claude-plugin/plugin.json");
  const codexPlugin = await readJson(".codex-plugin/plugin.json");
  const license = await readFile("LICENSE.md", "utf8");
  const notice = await readFile("NOTICE", "utf8");

  assert.equal(packageJson.license, "SEE LICENSE IN LICENSE.md");
  assert.equal(claudePlugin.license, "PolyForm-Shield-1.0.0");
  assert.equal(codexPlugin.license, "PolyForm-Shield-1.0.0");
  assert.match(license, /all KuudoAI-authored content/i);
  assert.match(license, /PolyForm Shield License 1\.0\.0/);
  assert.doesNotMatch(`${license}\n${notice}`, /Apache License|MIT License|Superpowers/i);
});

test("agent guidance points skill authors to the recommended references", async () => {
  const agentGuidance = await readFile("AGENTS.md", "utf8");

  assert.match(agentGuidance, /skill-creator/);
  assert.match(agentGuidance, /https:\/\/agentskills\.io\/home/);
  assert.match(agentGuidance, /https:\/\/agentskills\.io\/specification/);
  assert.match(agentGuidance, /host adapters contain mechanics only/i);
  assert.match(agentGuidance, /using-kuudo.*replaceable.*context/is);
  assert.match(agentGuidance, /observed client (?:behavior|failures)/i);
  assert.match(agentGuidance, /THIRD_PARTY_NOTICES\.md.*cataloged third-party skills only/is);
});

test("plugin guide distinguishes suite and portable installation", async () => {
  const installation = await readFile("docs/plugin-installation.md", "utf8");

  assert.match(installation, /claude --plugin-dir \/absolute\/path\/to\/skills/);
  assert.match(installation, /claude plugin marketplace add \/absolute\/path\/to\/skills --scope local/);
  assert.match(installation, /claude plugin install kuudo-skills@kuudo-skills-dev --scope local/);
  assert.match(installation, /codex plugin marketplace add \/absolute\/path\/to\/skills/);
  assert.match(installation, /codex plugin add kuudo-skills@kuudo-skills-dev/);
  assert.match(installation, /npx skills add KuudoAI\/skills --skill <skill-name>/);
  assert.match(installation, /npx skills add .*skills\/<skill-name>/);
  assert.match(installation, /choose (?:one|either).*installation mode.*client/is);
  assert.match(installation, /--all.*not.*plugin bootstrap/is);
});

test("MCP guide leaves connection and native discovery to the client", async () => {
  const mcp = await readFile("docs/mcp-configuration.md", "utf8");

  assert.match(mcp, /https:\/\/code\.claude\.com\/docs\/en\/mcp/);
  assert.match(mcp, /https:\/\/developers\.openai\.com\/codex\/mcp\//);
  assert.match(mcp, /https:\/\/modelcontextprotocol\.io\/docs\/learn\/architecture/);
  assert.match(mcp, /client owns.*configuration.*authentication.*connection.*discovery/is);
  assert.match(mcp, /native tools, resources, and prompts/i);
  assert.match(mcp, /does not (?:read|modify).*config/is);
  assert.match(mcp, /no .*aliases.*capability registry.*proxy/is);
  assert.match(mcp, /does not[\s\S]*guess tool names/i);
});

test("portable skills do not own host MCP setup", async () => {
  const skillsReadme = await readFile("skills/README.md", "utf8");

  assert.match(skillsReadme, /portable skill does not own host MCP setup/i);
  assert.match(skillsReadme, /plugin-installation\.md/);
  assert.match(skillsReadme, /mcp-configuration\.md/);
});

test("contribution guidance preserves provenance and uses documented registry workflows", async () => {
  const contributing = await readFile("CONTRIBUTING.md", "utf8");

  assert.match(contributing, /third-party/i);
  assert.match(contributing, /immutable Git revision/i);
  assert.match(contributing, /source repository/i);
  assert.match(contributing, /documented (?:registry )?(?:submission )?(?:format|contract|CLI)/i);
  assert.match(contributing, /do not (?:call|use) undocumented registry APIs/i);
  assert.match(contributing, /npm test/);
  assert.match(contributing, /typecheck/i);
});
