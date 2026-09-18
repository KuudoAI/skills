# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are semver and
must match `metadata.version` in SKILL.md.

## [0.3.0] - 2026-09-17

### Changed

- Made Amazon Ads MCP the skill's sole data transport and removed the offline CSV workflow.
- Reworked the entrypoint into a concise, read-only workflow with capability discovery, account-context resolution, runtime field validation, safe asynchronous retrieval, and explicit completion criteria.
- Consolidated aggregation and interpretation rules into focused references. Removed placeholder code-generation guidance and arbitrary portfolio standards.
- Required audits to separate observations, diagnostic hypotheses, and recommendations, and to disclose proxy status, threshold sources, report provenance, and unsupported sections.
- Updated the plugin repository and synchronized package metadata.

## [0.2.3] - 2026-08-14

### Changed
- Cut the hermetic distribution baseline. The distribution package now contains the complete accepted skill tree, including evals and accepted dotfiles. This intentionally uses a new version to avoid npm integrity reuse under an existing coordinate.

## [0.2.2] - 2026-06-10

### Changed
- Migrated frontmatter to the agentskills.io Agent Skills spec: `name` aligned to directory name (was `campaign-structure-auditor`); version moved to `metadata.version`, bumped 0.2.1 → 0.2.2; `compatibility` folded from a YAML list to a spec string. No behavioral changes.

## [0.2.1] and earlier

- Pre-migration history; see git log for details.
