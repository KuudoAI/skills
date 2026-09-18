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

## Releases

Releases are versioned as `vX.Y.Z` and use one synchronized version across `package.json`, the lockfile, and the Claude and Codex plugin manifests. To prepare a release, run `npm run version:bump -- 0.2.0`, add the user-facing changes to [RELEASE-NOTES.md](RELEASE-NOTES.md), and run `npm run version:check`, `npm run version:audit`, and `npm test` before opening the release pull request.

When that versioned change reaches `main`, [the release workflow](.github/workflows/release.yml) validates it again. If the tag does not already exist, GitHub creates `v0.2.0` and publishes a release with generated notes. Ordinary merges that do not change the version do not create another release.
