# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com). Versions are semver and must
match `metadata.version` in SKILL.md.

Bump rules:

- **patch:** non-behavioral changes (typos, formatting, reference-only
  edits).
- **minor:** behavioral additions (new sections, rules, triggers).
- **major:** contract changes (response shape, output format, scope).

Every bump also updates the `evals/evals.json` `skill_version`.

## [0.1.0] - 2026-09-29

### Added

- First KuudoAI release. Covers all nine Messaging API v1 send operations,
  `getMessagingActionsForOrder` eligibility, `GetAttributes` buyer locale,
  and attachments through the Uploads API with a host-side upload.
- Preview → explicit approval → paced send, with one approval per batch
  and no blind retry after an ambiguous send failure. Exact seller-supplied
  text with an explicit "send" counts as approval unless checks would
  change what a buyer receives.
- Alternative message types are offered only when the message fits that
  type's own purpose, and only as a separate seller choice.
- Inbox and reply requests get a paste-ready Seller Central reply.
- Content rules and a draft checklist for Amazon's buyer-seller
  communication guidelines; routes review requests and inbox replies out
  of scope.
- Tool surface (names, schemas, annotations) verified live by discovery on
  2026-09-29; order-level responses modeled from Amazon's API model.
