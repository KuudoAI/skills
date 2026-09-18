#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v node >/dev/null 2>&1 || { echo "error: node is required" >&2; exit 1; }

if [[ $# -eq 1 && "$1" == "--check" ]]; then
  REPO_ROOT="$repo_root" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.REPO_ROOT;
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.version-bump.json'), 'utf8'));
const versions = manifest.files.map(({ path: relativePath, field }) => {
  const document = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  return { relativePath, version: field.split('.').reduce((value, key) => value[key], document) };
});
const unique = [...new Set(versions.map(({ version }) => version))];
for (const { relativePath, version } of versions) console.log(`${relativePath}: ${version}`);
if (unique.length !== 1) {
  console.error(`Version drift detected: ${unique.join(', ')}`);
  process.exit(1);
}
NODE
  exit 0
fi

if [[ $# -eq 1 && "$1" == "--audit" ]]; then
  current_version="$(node -p "require('$repo_root/package.json').version")"
  bash "$repo_root/scripts/bump-version.sh" --check >/dev/null
  unexpected=$(git -C "$repo_root" grep -n -F "$current_version" -- ':!RELEASE-NOTES.md' ':!.version-bump.json' ':!scripts/bump-version.sh' ':!package-lock.json' | grep -vE '^(package.json|\.claude-plugin/|\.codex-plugin/|skills/|evals/|.*\.md:)' || true)
  if [[ -n "$unexpected" ]]; then
    echo "Version references requiring review:"
    echo "$unexpected"
  else
    echo "No unexpected references to ${current_version}."
  fi
  exit 0
fi

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: scripts/bump-version.sh <version> | --check | --audit" >&2
  exit 2
fi

new_version="$1"

REPO_ROOT="$repo_root" NEW_VERSION="$new_version" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.REPO_ROOT;
const next = process.env.NEW_VERSION;
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.version-bump.json'), 'utf8'));

function get(object, field) {
  return field.split('.').reduce((value, key) => value[key], object);
}

function set(object, field, value) {
  const keys = field.split('.');
  const final = keys.pop();
  const parent = keys.reduce((current, key) => current[key], object);
  parent[final] = value;
}

const documents = new Map();
for (const { path: relativePath, field } of manifest.files) {
  const filePath = path.join(root, relativePath);
  let entry = documents.get(filePath);
  if (!entry) {
    entry = { filePath, relativePath, document: JSON.parse(fs.readFileSync(filePath, 'utf8')), fields: [] };
    documents.set(filePath, entry);
  }
  const current = get(entry.document, field);
  if (typeof current !== 'string') throw new Error(`${relativePath} ${field} is not a string`);
  entry.fields.push({ field, current });
}

for (const { filePath, relativePath, document, fields } of documents.values()) {
  for (const { field, current } of fields) {
    set(document, field, next);
    console.log(`${relativePath} (${field}): ${current} -> ${next}`);
  }
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
}
NODE

echo "Checking synchronized versions..."
REPO_ROOT="$repo_root" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.REPO_ROOT;
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.version-bump.json'), 'utf8'));
const versions = manifest.files.map(({ path: relativePath, field }) => {
  const document = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  return field.split('.').reduce((value, key) => value[key], document);
});
if (new Set(versions).size !== 1) {
  console.error(`Version drift detected: ${versions.join(', ')}`);
  process.exit(1);
}
console.log(`All ${versions.length} declared files are synchronized at ${versions[0]}.`);
NODE
