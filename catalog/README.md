# Repository catalog

Files in `catalog/entries/` are repository-governance records. They describe each skill's maintainers, license, origin, registry metadata, and certification status. They are not part of the [Agent Skills standard](https://agentskills.io/specification).

A `reference` entry is not yet KuudoAI-certified. The separate `origin` field records whether it is maintained by KuudoAI or contributed by a third party, so first-party reference skills are not labeled as community contributions. Third-party entries must record an HTTPS source repository, an immutable Git revision, and the repository-relative source path. A `certified` entry must include both positive and negative trigger cases in `evals/<skill>/trigger-cases.json`.
