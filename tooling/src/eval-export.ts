import { copyFile, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

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

/** A validated case, with each input file resolved to a real path inside the skill's evals/ directory. */
interface PlannedScenario {
  name: string;
  skill: string;
  evalCase: SkillEvalCase;
  files: Array<{ relative: string; source: string }>;
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

/** Tessl's judge grades the files a solution leaves behind, not the chat, so every task asks for an answer file. */
export const ANSWER_FILE = "answer.md";
export const ANSWER_INSTRUCTION = `Write your complete final answer to \`${ANSWER_FILE}\` in the working directory.`;

const MUST_NOT = /^(?:output\s+)?(?:does not|doesn't|do not|never|must not|no\s|avoids?\b)/i;

/**
 * Write each skill eval case as a Tessl scenario: task.md holds the prompt and asks for the answer in a
 * file, never the expected answer; criteria.json turns the assertions into a weighted checklist for the judge.
 * Every selected case and input file is validated before anything is written, so a failed export
 * leaves the output directory empty.
 */
export async function exportTesslScenarios(
  root: string,
  outDirectory: string,
  options: TesslExportOptions = {},
): Promise<TesslExportResult> {
  const existing = await readdir(outDirectory).catch(() => []);
  if (existing.length > 0) throw new Error(`${outDirectory} is not empty; export into a new directory.`);

  const { planned, skipped } = await planScenarios(root, options);
  for (const scenario of planned) {
    await writeScenario(join(outDirectory, scenario.name), scenario);
  }
  return { scenarios: planned.map((scenario) => scenario.name), skipped };
}

async function planScenarios(
  root: string,
  options: TesslExportOptions,
): Promise<{ planned: PlannedScenario[]; skipped: string[] }> {
  const realRoot = await realpath(root);
  const wanted = options.scenarios ? new Set(options.scenarios) : undefined;
  const skills = options.skills ?? (wanted ? [...new Set([...wanted].map(skillOfScenario))].sort() : await skillsWithEvals(root));
  const planned: PlannedScenario[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    const evalDirectory = await realpath(join(root, "skills", skill, "evals"));
    if (!isInside(realRoot, evalDirectory)) throw new Error(`${skill}: evals/ resolves outside the repository.`);
    const evalsFile = await realpath(join(evalDirectory, "evals.json"));
    if (!isInside(evalDirectory, evalsFile)) throw new Error(`${skill}: evals/evals.json resolves outside evals/.`);
    const document = JSON.parse(await readFile(evalsFile, "utf8")) as { evals: SkillEvalCase[] };
    let selected = 0;
    for (const evalCase of document.evals) {
      const name = `${skill}-${String(evalCase.id)}`;
      if (wanted && !wanted.has(name)) continue;
      seen.add(name);
      if (!options.includeLive && (evalCase.fixture !== undefined || evalCase.mode === "live-read")) {
        skipped.push(`${name}: needs live or mocked Amazon tools`);
        continue;
      }
      if (!evalCase.assertions?.length) {
        skipped.push(`${name}: has no assertions`);
        continue;
      }
      if (options.limit !== undefined && selected >= options.limit) break;
      planned.push({ name, skill, evalCase, files: await resolveInputFiles(evalDirectory, name, evalCase.files ?? []) });
      selected += 1;
    }
  }
  const unknown = [...(wanted ?? [])].filter((name) => !seen.has(name));
  if (unknown.length > 0) throw new Error(`Unknown scenarios: ${unknown.join(", ")}.`);
  return { planned, skipped };
}

/** Resolve each input file to its real path and require it to stay inside evals/, so a symlink cannot pull in outside files. */
async function resolveInputFiles(evalDirectory: string, scenario: string, files: string[]): Promise<PlannedScenario["files"]> {
  const resolved: PlannedScenario["files"] = [];
  for (const file of files) {
    const relative = normalize(file);
    if (isAbsolute(relative) || relative === ".." || relative.startsWith(`..${sep}`)) {
      throw new Error(`${scenario}: file ${file} is outside evals/.`);
    }
    // Tessl copies each included directory into the working directory, where the agent writes its answer.
    const [top, ...rest] = relative.split(sep);
    if (top === ANSWER_FILE) throw new Error(`${scenario}: file ${file} uses ${ANSWER_FILE}, which is reserved for the agent's answer.`);
    if (rest.length === 0) throw new Error(`${scenario}: file ${file} must sit in a subdirectory of evals/, such as files/, because Tessl includes directories.`);
    const source = await realpath(join(evalDirectory, relative)).catch(() => {
      throw new Error(`${scenario}: file ${file} does not exist.`);
    });
    if (!isInside(evalDirectory, source)) throw new Error(`${scenario}: file ${file} is outside evals/.`);
    resolved.push({ relative, source });
  }
  return resolved;
}

function isInside(directory: string, path: string): boolean {
  return path.startsWith(`${directory}${sep}`);
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

async function writeScenario(directory: string, { skill, evalCase, files }: PlannedScenario): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "task.md"), `${evalCase.prompt.trim()}\n\n${ANSWER_INSTRUCTION}\n`);
  const criteria = {
    context: evalCase.expected_output?.trim() || `Evaluates the ${skill} skill.`,
    type: "weighted_checklist",
    checklist: checklist(evalCase.assertions ?? []),
  };
  await writeFile(join(directory, "criteria.json"), `${JSON.stringify(criteria, null, 2)}\n`);

  if (files.length === 0) return;
  const included = new Set<string>();
  for (const { relative, source } of files) {
    await mkdir(dirname(join(directory, relative)), { recursive: true });
    await copyFile(source, join(directory, relative));
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
