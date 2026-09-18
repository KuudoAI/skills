import { lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { isSkillName, maximumSkillNameLength } from "./types.js";

/** Create the minimum first-party community-skill records without optional resource directories. */
export async function scaffoldSkill(root: string, name: string): Promise<string[]> {
  validateName(name);

  const paths = [
    join("skills", name, "SKILL.md"),
    join("skills", name, "LICENSE.txt"),
    join("catalog", "entries", `${name}.json`),
    join("evals", name, "trigger-cases.json"),
  ];
  const targets = paths.map((path) => join(root, path));
  const canonicalRoot = await assertSafeRoot(root);

  await Promise.all(targets.map((target) => assertSafeParentChain(root, dirname(target), canonicalRoot, false)));
  await Promise.all(targets.map(assertAbsent));

  const [template, licenseNotice] = await Promise.all([
    readFile(new URL("../../templates/SKILL.md.tmpl", import.meta.url), "utf8"),
    readFile(new URL("../../templates/LICENSE.txt.tmpl", import.meta.url), "utf8"),
  ]);
  const skill = template
    .replaceAll("__SKILL_NAME__", name)
    .replaceAll("__SKILL_TITLE__", toTitle(name));
  const entry = `${JSON.stringify({
    name,
    classification: "community",
    origin: "first-party",
    maintainers: ["KuudoAI"],
    license: "PolyForm-Shield-1.0.0",
    registries: {},
  }, null, 2)}\n`;

  const contents = [skill, licenseNotice, entry, "[]\n"];
  const reserved: string[] = [];
  try {
    for (const [index, target] of targets.entries()) {
      await assertSafeParentChain(root, dirname(target), canonicalRoot, true);
      await writeFile(target, contents[index], { encoding: "utf8", flag: "wx" });
      reserved.push(target);
    }
  } catch (error) {
    await Promise.all(reserved.map(removeReservedOutput));
    throw error;
  }

  return paths.map((path) => path.replaceAll("\\", "/"));
}

function validateName(name: string): void {
  if (!isSkillName(name)) {
    throw new Error(`Skill name must use lowercase letters, numbers, and single hyphens, and be at most ${maximumSkillNameLength} characters.`);
  }
}

async function assertSafeRoot(root: string): Promise<string> {
  const stat = await lstat(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Scaffold root must be a real directory and not a symbolic link.");
  }
  return realpath(root);
}

async function assertSafeParentChain(
  root: string,
  parent: string,
  canonicalRoot: string,
  create: boolean,
): Promise<void> {
  const relativeParent = relative(root, parent);
  if (relativeParent === "" || relativeParent === ".") return;
  if (relativeParent === ".." || relativeParent.startsWith(`..${sep}`)) {
    throw new Error(`Scaffold parent directory resolves outside the requested root: ${parent}`);
  }

  let current = root;
  for (const segment of relativeParent.split(sep)) {
    current = join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (!isMissing(error)) throw error;
      if (!create) return;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (!isAlreadyExists(mkdirError)) throw mkdirError;
      }
      stat = await lstat(current);
    }

    if (stat.isSymbolicLink()) {
      throw new Error(`Scaffold parent directory must not be a symbolic link: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Scaffold parent path must be a directory: ${current}`);
    }
    const canonicalCurrent = await realpath(current);
    if (!isWithin(canonicalCurrent, canonicalRoot)) {
      throw new Error(`Scaffold parent directory resolves outside the requested root: ${current}`);
    }
  }
}

function isWithin(target: string, directory: string): boolean {
  const path = relative(directory, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw new Error(`Scaffold target already exists: ${path}`);
}

async function removeReservedOutput(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function toTitle(name: string): string {
  return name.split("-").map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}
