import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

/** One case from a skill's evals/evals.json, in either assertion shape the repository uses. */
interface SkillEvalCase {
  id: number | string;
  prompt: string;
  expected_output?: string;
  files?: string[];
  assertions?: Array<{ name?: string; condition?: string; text?: string }>;
  fixture?: string;
  mode?: string;
}

interface ChecklistItem {
  name: string;
  description: string;
  max_score: number;
  category: "INTENT" | "MUST_NOT";
}

export interface TesslExportOptions {
  /** Export only these skills; all skills with evals/evals.json when omitted. */
  skills?: string[];
  /** Export only these scenarios, named `<skill>-<eval id>`; unknown names are an error. */
  scenarios?: string[];
  /** Maximum scenarios per skill, taken in file order. */
  limit?: number;
  /** Also export cases that need live or mocked Amazon tools (a `fixture` or `mode: live-read`). */
  includeLive?: boolean;
}

export interface TesslExportResult {
  scenarios: string[];
  skipped: string[];
}

const MUST_NOT = /^(?:output\s+)?(?:does not|doesn't|do not|never|must not|no\s|avoids?\b)/i;

/**
 * Write each skill eval case as a Tessl scenario: task.md holds only the prompt, so the agent never
 * sees the expected answer; criteria.json turns the assertions into a weighted checklist for the judge.
 */
export async function exportTesslScenarios(
  root: string,
  outDirectory: string,
  options: TesslExportOptions = {},
): Promise<TesslExportResult> {
  const existing = await readdir(outDirectory).catch(() => []);
  if (existing.length > 0) throw new Error(`${outDirectory} is not empty; export into a new directory.`);

  const wanted = options.scenarios ? new Set(options.scenarios) : undefined;
  const skills = options.skills ?? (wanted ? [...new Set([...wanted].map(skillOfScenario))].sort() : await skillsWithEvals(root));
  const result: TesslExportResult = { scenarios: [], skipped: [] };
  const seen = new Set<string>();
  for (const skill of skills) {
    const evalDirectory = join(root, "skills", skill, "evals");
    const document = JSON.parse(await readFile(join(evalDirectory, "evals.json"), "utf8")) as { evals: SkillEvalCase[] };
    let exported = 0;
    for (const evalCase of document.evals) {
      const scenario = `${skill}-${String(evalCase.id)}`;
      if (wanted && !wanted.has(scenario)) continue;
      seen.add(scenario);
      if (!options.includeLive && (evalCase.fixture !== undefined || evalCase.mode === "live-read")) {
        result.skipped.push(`${scenario}: needs live or mocked Amazon tools`);
        continue;
      }
      if (!evalCase.assertions?.length) {
        result.skipped.push(`${scenario}: has no assertions`);
        continue;
      }
      if (options.limit !== undefined && exported >= options.limit) break;
      await writeScenario(join(outDirectory, scenario), evalDirectory, skill, evalCase);
      result.scenarios.push(scenario);
      exported += 1;
    }
  }
  const unknown = [...(wanted ?? [])].filter((scenario) => !seen.has(scenario));
  if (unknown.length > 0) throw new Error(`Unknown scenarios: ${unknown.join(", ")}.`);
  return result;
}

/** A scenario is named `<skill>-<eval id>`; skill names contain hyphens, so split at the last one. */
function skillOfScenario(scenario: string): string {
  return scenario.slice(0, scenario.lastIndexOf("-"));
}

async function skillsWithEvals(root: string): Promise<string[]> {
  const entries = await readdir(join(root, "skills"), { withFileTypes: true });
  const skills: string[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const hasEvals = await readFile(join(root, "skills", entry.name, "evals", "evals.json")).then(() => true, () => false);
    if (hasEvals) skills.push(entry.name);
  }
  return skills;
}

async function writeScenario(directory: string, evalDirectory: string, skill: string, evalCase: SkillEvalCase): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "task.md"), `${evalCase.prompt.trim()}\n`);
  const criteria = {
    context: evalCase.expected_output?.trim() || `Evaluates the ${skill} skill.`,
    type: "weighted_checklist",
    checklist: checklist(evalCase.assertions ?? []),
  };
  await writeFile(join(directory, "criteria.json"), `${JSON.stringify(criteria, null, 2)}\n`);

  const files = evalCase.files ?? [];
  if (files.length === 0) return;
  const included = new Set<string>();
  for (const file of files) {
    const relative = normalize(file);
    if (relative.startsWith("..") || relative.startsWith(sep)) throw new Error(`${skill} eval ${evalCase.id}: file ${file} is outside evals/.`);
    await mkdir(dirname(join(directory, relative)), { recursive: true });
    await copyFile(join(evalDirectory, relative), join(directory, relative));
    included.add(`./${relative.split(sep)[0]}`);
  }
  await writeFile(join(directory, "scenario.json"), `${JSON.stringify({ include: [...included].sort() }, null, 2)}\n`);
}

function checklist(assertions: NonNullable<SkillEvalCase["assertions"]>): ChecklistItem[] {
  const used = new Set<string>();
  return assertions.map((assertion, index) => {
    const description = (assertion.condition ?? assertion.text ?? "").trim();
    let name = assertion.name ?? slug(description) ?? `check-${index + 1}`;
    if (used.has(name)) name = `${name}-${index + 1}`;
    used.add(name);
    return { name, description, max_score: 1, category: MUST_NOT.test(description) ? "MUST_NOT" : "INTENT" };
  });
}

function slug(text: string): string | undefined {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length > 0 ? words.join("-") : undefined;
}
