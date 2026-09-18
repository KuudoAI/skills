# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are semver and
must match `metadata.version` in SKILL.md.

## [2.1.2] - 2026-08-14

### Changed
- Cut the hermetic distribution baseline. The distribution package now contains the complete accepted skill tree, including evals and accepted dotfiles. This intentionally uses a new version to avoid npm integrity reuse under an existing coordinate.

## [2.1.1] - 2026-06-10

### Changed
- Migrated frontmatter to the agentskills.io Agent Skills spec: `name` aligned to directory name (was `create-dsp-pb-campaign`); version moved to `metadata.version`, bumped 2.1.0 → 2.1.1; `visibility` moved under `metadata`. No behavioral changes.

## [2.1.0] and earlier

- Pre-migration history; see git log for details.
