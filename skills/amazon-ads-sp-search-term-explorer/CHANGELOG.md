# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are semver and
must match `metadata.version` in SKILL.md.

## [0.4.2] - 2026-08-14

### Changed
- Cut the hermetic distribution baseline. The distribution package now contains the complete accepted skill tree, including evals and accepted dotfiles. This intentionally uses a new version to avoid npm integrity reuse under an existing coordinate.

## [0.4.1] - 2026-06-10

### Changed
- Migrated frontmatter to the agentskills.io Agent Skills spec: version moved to `metadata.version`, bumped 0.4.0 → 0.4.1; `compatibility` folded from a YAML list to a spec string. No behavioral changes.

## [0.4.0] and earlier

- Pre-migration history; see git log for details.
