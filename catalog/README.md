# Skill catalog

The generated [`catalog/skills.json`](skills.json) is the repository's machine-readable skill catalog. It carries the standard Agent Skills discovery fields from each `SKILL.md`—`name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools` when present—alongside repository status, provenance, maintainers, and registry metadata.

The source records in [`entries/`](entries/) hold governance data, while portable skill packages remain in [`../skills/`](../skills/). The catalog does not replace `SKILL.md`; it makes the same standard discovery information easy for clients, registries, and people to browse. Run `npm run catalog:build` after changing a skill or entry and `npm run catalog:check` before submitting a change.

The format follows the [Agent Skills specification](https://agentskills.io/specification): `SKILL.md` remains the source of truth for portable instructions and frontmatter, and the catalog is generated from it.

A `reference` entry is not yet KuudoAI-certified. The separate `origin` field records whether it is maintained by KuudoAI or contributed by a third party, so first-party reference skills are not labeled as community contributions. Third-party entries must record an HTTPS source repository, an immutable Git revision, and the repository-relative source path. A `certified` entry must include both positive and negative trigger cases in `evals/<skill>/trigger-cases.json`.
