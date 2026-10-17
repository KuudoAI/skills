# Contributing

This repository follows the [Agent Skills specification](https://agentskills.io/specification) and its [authoring guidance](https://agentskills.io/skill-creation/best-practices). The open specification governs portable packages; `certified` is a KuudoAI repository trust label, not a format feature.

## First-party skills

1. Create the initial package, catalog entry, and evaluation file with `npm run skill:new -- <skill-name>`.
2. Replace all scaffold placeholders and author `skills/<skill-name>/SKILL.md` according to the specification. Add only resources the skill needs.
3. Complete `catalog/entries/<skill-name>.json` with maintainer, license, classification, origin, and registry information. Start new work as `reference` unless it has completed certification review; `origin` separately identifies first-party and third-party work.
4. Run `npm run catalog:build`, then use the aggregate `npm test` gate before opening a pull request. It includes TypeScript typechecking, unit tests, repository validation, and generated-artifact checks. You can run `npm run typecheck`, `npm run validate`, `npm run catalog:check`, or `npm run test:unit` individually while iterating.

## Licensing

All KuudoAI-authored repository content is licensed under the PolyForm Shield License 1.0.0. `npm run skill:new` adds the license frontmatter and `LICENSE.txt` to a new skill. Keep both, and set the catalog entry's `license` to `PolyForm-Shield-1.0.0`. By contributing, you confirm that you have the right to submit the contribution and grant KuudoAI the right to license it as part of the repository under those terms. Third-party imports keep their upstream license and are never relicensed.

## Third-party imports

Do not alter a third-party skill package to add KuudoAI metadata. Preserve its instructions, scripts, links, assets, and upstream license terms. Record the import in its catalog entry as `third-party`, including the HTTPS source repository, the source path, and an immutable Git revision. Inspect every external instruction and script before execution; generated `THIRD_PARTY_NOTICES.md` derives its attribution from these records.

## Certification

Certification requires owner review, successful repository validation, and at least one positive and one negative trigger case in `evals/<skill-name>/trigger-cases.json`. Describe the evidence supporting any `certified` claim in the pull request. Community skills remain installable but must not be represented as KuudoAI-certified.

## Registry registration

Run `npm run catalog:build` to generate supported registry metadata and `npm run catalog:check` to detect drift. Submit a skill only through a registry's documented submission format, documented contract, or supported CLI. Do not call undocumented registry APIs or scrape registry websites. For skills.sh metadata, use its [published schema](https://skills.sh/schemas/skills.sh.schema.json); do not hand-edit generated manifests.

Tessl scores a published plugin with evaluation scenarios. `npm run evals:export -- tessl --out <dir>` converts each skill's `evals/evals.json` into [Tessl scenarios](https://docs.tessl.io/improving-your-skills/evaluate-skill-quality-using-scenarios): `task.md` holds only the prompt, so the agent never sees the expected answer, and `criteria.json` turns the assertions into the judge's checklist. Cases with a `fixture` or `mode: live-read` need live or mocked Amazon tools, so they are skipped unless you pass `--include-live`; `--skill <name>`, `--scenario <skill>-<id>`, and `--limit <n>` narrow an export. Write the scenarios into the publish copy rather than the repository root, whose `evals/` directory holds trigger cases.

## Releases

There are two kinds of version in this repository, and each has one owner.

**Skill versions are yours.** Every first-party skill declares `metadata.version` in `SKILL.md`, follows the bump rules in its `CHANGELOG.md` (patch for non-behavioral edits, minor for new rules or triggers, major for contract changes), and keeps `evals/evals.json` `skill_version` equal to it. When a pull request changes anything under `skills/<name>/`, bump that skill's version and add the matching `CHANGELOG.md` entry in the same pull request. `npm run validate` checks that the version, the top changelog entry, and the eval version agree, and on pull requests `npm run skills:version-check -- --base origin/main` fails if a changed skill was not bumped.

**The plugin release is automated.** Write every commit in [Conventional Commits](https://www.conventionalcommits.org/) form (`feat:`, `fix:`, `docs:`, `chore:`, and so on, with `!` for breaking changes); `npm run commits:check -- --base origin/main` enforces this on pull requests because the release notes are generated from those subjects. On every push to `main`, [the release workflow](.github/workflows/release.yml) validates the commit and then runs [release-please](https://github.com/googleapis/release-please), which keeps a `chore: release X.Y.Z` pull request open. That pull request bumps the synchronized version in `package.json`, the lockfile, the Claude and Codex plugin manifests, and the Gemini CLI extension manifest, and prepends the generated notes to [RELEASE-NOTES.md](RELEASE-NOTES.md). Merging it tags `vX.Y.Z` and publishes the GitHub release. Before `1.0.0`, `feat` commits raise the minor version and `fix` commits the patch.

Keep [`.version-bump.json`](.version-bump.json) and the `extra-files` in [`release-please-config.json`](release-please-config.json) in step; a test fails if they diverge. `npm run version:check` verifies the synchronized files, and `npm run version:bump -- X.Y.Z` remains for an emergency manual release.

Pull requests merge into `main` by squash only, so each pull request becomes one commit and one release-note entry. A single-commit pull request lands with that commit's message; a pull request with several commits lands under its title, so write the title in Conventional Commits form too. Merge commits are disabled because release-please counted each change twice: once for the original commit and once for the conventional message GitHub copies into the merge commit.

The release pull request is opened with the workflow's default token, so its Validate run waits with `action_required` and the required check stays pending. Approve the waiting run from the pull request, or push any commit to the release branch, and the check runs normally. Alternatively, add a `RELEASE_PLEASE_TOKEN` repository secret (a fine-grained token or GitHub App token with contents and pull-requests write access) so the Validate workflow runs there without approval.
