#!/usr/bin/env bash
# Build the archives people upload to Claude Desktop and claude.ai.
#
#   bash scripts/package.sh [output-directory] [git-ref]
#
# Writes <out>/kuudo-skills.zip (the whole plugin, files at the archive root)
# and <out>/skills/<skill-name>.zip (one skill each, its folder at the archive
# root). Archives come from committed files at <git-ref> (default HEAD), never
# from the working tree.
#
# File names are fixed on purpose: Claude identifies an uploaded plugin or
# skill by its file name, so a renamed archive becomes a duplicate instead of
# replacing the earlier upload. Don't add a version or commit to the names.

set -euo pipefail

repo_root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
out="${1:-${repo_root}/dist}"
ref="${2:-HEAD}"

git -C "${repo_root}" rev-parse --verify --quiet "${ref}^{commit}" >/dev/null || {
  echo "package: ${ref} is not a commit" >&2
  exit 1
}

# Claude Desktop rejects an archive that contains a symbolic link.
links="$(git -C "${repo_root}" ls-tree -r "${ref}" | awk '$1 == "120000" { print $4 }')"
if [[ -n "${links}" ]]; then
  echo "package: ${ref} contains symbolic links, which Claude Desktop rejects:" >&2
  echo "${links}" >&2
  exit 1
fi

rm -rf "${out}"
mkdir -p "${out}/skills"

# The plugin needs its manifest, hook, and skills; the notices travel with it.
# Repository tooling, evals, docs, and the catalog stay out of the archive.
plugin_paths=(.claude-plugin hooks skills LICENSE.md NOTICE THIRD_PARTY_NOTICES.md licenses README.md)
git -C "${repo_root}" archive --format=zip -o "${out}/kuudo-skills.zip" "${ref}" -- "${plugin_paths[@]}"

count=0
while IFS= read -r skill; do
  git -C "${repo_root}" archive --format=zip -o "${out}/skills/${skill}.zip" "${ref}:skills" -- "${skill}"
  count=$((count + 1))
done < <(git -C "${repo_root}" ls-tree -d --name-only "${ref}:skills")

echo "package: wrote ${out}/kuudo-skills.zip and ${count} skill archives from ${ref}"
