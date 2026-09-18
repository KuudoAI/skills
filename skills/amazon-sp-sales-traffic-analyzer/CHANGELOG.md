# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are semver and
must match `metadata.version` in SKILL.md.

## [0.4.0] - 2026-09-16

### Changed
- Made trend calculations conditional on `DAY` granularity and completed the documented weekday/weekend and anomaly summaries.
- Preserved B2B field presence, validated B2B subsets before emitting non-B2B residuals, and removed consumer-attribution labels.
- Added currency, report-shape, report-type, and single-marketplace validation.
- Weighted portfolio Buy Box percentage by page views and made analysis thresholds configurable and visible in output.
- Clarified source routing for Reports API JSON, Seller Central flat exports, and Data Kiosk results.
- Added Python compatibility metadata and synchronized plugin/package versions.

## [0.3.2] - 2026-08-14

### Changed
- Cut the hermetic distribution baseline. The distribution package now contains the complete accepted skill tree, including evals and accepted dotfiles. This intentionally uses a new version to avoid npm integrity reuse under an existing coordinate.

## [0.3.1] - 2026-06-10

### Changed
- Migrated frontmatter to the agentskills.io Agent Skills spec: `name` aligned to directory name (was `sales-traffic-analyzer`); version moved to `metadata.version`, bumped 0.3.0 → 0.3.1; empty `compatibility` removed. No behavioral changes.

## [0.3.0] and earlier

- Pre-migration history; see git log for details.
