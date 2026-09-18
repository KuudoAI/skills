# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are semver and
must match `metadata.version` in SKILL.md.

## [1.0.1] - 2026-08-14

### Changed
- Cut the hermetic distribution baseline. The distribution package now contains the complete accepted skill tree, including evals and accepted dotfiles. This intentionally uses a new version to avoid npm integrity reuse under an existing coordinate.
- This pre-release no longer satisfies the prior `^0.1.0` range; PoC/UAT users must update or reinstall explicitly.

## [1.0.0] - 2026-07-25

Realigns the skill to current Seller Central documentation (product title
requirements, bullet point requirements, attributes guide, A+ Content guide,
search optimization, keyword attributes, browse tree guides, search-term usage,
and the error-code resolution pages), preserved verbatim in
`references/00-source-*.txt`. **Contains breaking rule changes** — copy that was
compliant under the previous version is not necessarily compliant now.

### Changed (breaking — listing contract)

- **Title limit is 75 characters, not 200.** 75 is Amazon's policy limit;
  200 remains only the technical field cap for `item_name`. The skill now
  reports an accepted-but-over-75 title as non-compliant instead of fine, and
  SKILL.md carries the distinction up front because "under 200" is the single
  most common piece of stale advice in this domain.
- **Bullet points are 10–255 characters, not ≤500.** Bullet-intent scoring
  thresholds updated to match (`04-bullet-intent-scoring.md`).
- **Bullets spell out numbers one through nine** (excluding names, model
  numbers, and measurements) and require a space between digit and unit —
  reversing the previous "Arabic numerals throughout" guidance, which remains
  correct for titles only.
- **Backend search terms: write to under 200 bytes**, and — the part that
  actually matters — **exceeding the limit makes Amazon Search ignore the
  entire attribute**, not truncate it. Every other keyword attribute indexes
  up to its limit and drops only the excess; `generic_keywords` is
  all-or-nothing, so an over-stuffed field indexes nothing. Amazon documents
  the limit as both 249 bytes and 200 (error 97779); the skill surfaces the
  discrepancy rather than asserting one. Also corrected: bytes ≠ characters
  for non-ASCII copy, and spaces/punctuation are **not** counted.
- **Bullets have a set-level cap of under 1,000 characters total**, which
  binds *before* the per-bullet cap — five bullets at the 255 maximum would
  total 1,275 and be non-compliant as a set. The skill now budgets ~200 per
  bullet across five rather than treating 255 as freely available.
- Title character rules split into never-allowed (`! $ ? _ { } ^ ¬ ¦`) vs.
  allowed-only-in-functional-context (`~ # < > *`), replacing the previous
  flat ban, plus the non-language ASCII ban and the brand-field exemption.
- Suppression triggers updated: title over 75 chars, fewer than 3 bullets.

### Added

- **Item highlights** (`01-policy-rules.md` § 2) — the 125-character
  comma-separated field that absorbs detail the 75-char title can no longer
  carry. Audits now treat an over-length title beside an empty highlights
  field as one finding with one fix.
- `references/02-attributes-and-error-codes.md` — attribute views
  (Required/Recommended/All), why attributes drive refinement filters and
  Rufus context, template hygiene (<90 days, version in cell B1), and the
  submission error codes 90057, 90220, 90225, 90248, 97779, 99001, 99010
  with resolutions.
- `references/03-search-optimization.md` — browse-tree classification and
  Browse Tree Guides, and searchability triage for listings that are
  unsearchable **without** being suppressed (no offer, no browse node, future
  launch date, adult classification), the 72-hour propagation window, the
  "Determine why an ASIN is not searchable" tool, and the three search
  behaviors sellers misread as bugs (query auto-correction, position
  fluctuation, result-count limits).
- Title rules now cover word repetition including brand names, Amazon's
  information order, parent-vs-child title scope, and suppression
  troubleshooting via Manage All Inventory.
- Bullet rules now cover the `Header: description` shape, uniqueness per
  bullet, cross-variant consistency, the verifiable-on-packaging test for
  subjective claims, and the full prohibited list (ASINs, bamboo/soy
  sourcing claims, placeholder text, external information).
- **A+ AI-generated-people disclosure** — `contains-synthetic-performer` in
  the `dc:subject` (XMP) field for video, the Creative Assets checkbox for
  images, and the four cases where it does *not* apply. Wired into the AI
  image-generation workflow so it surfaces at generation time.
- A+ Basic vs. Premium spec table (970×300 / 5 modules / 14 types vs.
  1464×600 / 7 modules / 19 types), prerequisites including the
  case-sensitive Brand Registry name match, publication limits (20 pending
  submissions, 10,000-ASIN bulk cap, 7-day review, 24-hour publication),
  technical restrictions, Amazon's acceptable/not-acceptable table, and
  display/rejection troubleshooting.
- Audit checklist gains title & item-highlights compliance, attribute
  completeness against the Recommended view, and searchability-distinct-from-
  suppression checks.
- **Amazon Search does no partial matching** — a query matches only listings
  whose catalog data contains every word in the query. The audit now reframes
  "I don't rank for X" as an eligibility question (are X's words present at
  all?) before treating it as a ranking problem.
- **The full keyword-attribute set** with byte limits and status:
  `generic_keywords` (249), `item_type_keyword` (250, drives browse
  assignment), `style_keywords` (100), `thesaurus_subject_keywords` (250),
  `subject_keywords` (210, media only), plus the three US attributes being
  phased out and `platinum_keywords`, which is redundant. The skill no longer
  recommends work on the dead fields.
- **`generic_keywords` is a required attribute for 23 product types** since
  Dec 6, 2023 — on those, empty is a submission failure.
- Amazon's published prohibited-search-term word lists (brand, temporary, and
  subjective classes) as a concrete audit screen.
- Browse mechanics: assignment queries against attribute values
  (`style_keywords:sport-sandals`), classification method by seller plan and
  listing volume, why keyword-search and browse-based result counts legitimately
  differ, and the severity split between *no browse node* (invisible in both
  search and browse) and *wrong-depth node* (searchable but unbrowsable).
- Deep resolution steps for errors 90057, 99001, and 99010 — exact error
  message text, the Feed Processing Summary tab, orange vs. red cell
  highlighting, the "Required?" column in Data Definitions, the
  multi-product-type template trap, and the conditionally-required groups
  (Sale Price → start/end dates with format and ordering constraints;
  Product ID → Product ID Type; Parentage → Variation Theme). The known-groups
  table is marked **non-exhaustive** — groups vary by category, so the
  Data Definitions and Valid Values tabs are the general answer and the table
  is only examples. All three error sections use the same numbered-resolution
  shape, since 99010's tab names were previously buried in prose and were
  being dropped in favour of invented tab names (caught by 3x replication).
- Search glossary entries that change a diagnosis: index-suppressed, 72-hour
  latency, launch date, valid values, catalog spam, search constraints,
  browse refinements.
- Second diagnostic tool: "Determine why a listing is not displaying" (reached
  by searching **"inactive"** in Seller Central help), alongside the existing
  unsearchable tool, Search Query Performance Dashboard, and Listing Quality
  Dashboard.
- `references/09-size-charts.md` — size chart eligibility (Brand Registry),
  the self-service path (Catalog → Add size charts), the permissions-vs-
  eligibility distinction that makes an inaccessible tool look like an
  ineligible account, the Seller Support fallback, the full category/
  subcategory template map, template structure (20 rows, per-column units and
  mandatory flags), and the extracted per-template measurement schemas. Added
  a size-chart gap check to the audit workflow, framed on returns cost.
- Reference map table in SKILL.md.
- Five eval cases: 75-char title + item highlights routing, bullet rewrite
  against the 255-char cap and prohibited claims, searchability triage,
  keyword byte-limit/no-partial-matching correction, and 99010 conditional
  group diagnosis.

### Changed (structure)

- **Reference files are now numerically ordered** — `01-policy-rules.md`,
  `02-attributes-and-error-codes.md`, `03-search-optimization.md`,
  `04-bullet-intent-scoring.md`, `05-aplus-content.md`,
  `06-patch-construction.md`, `07-ai-image-generation.md`,
  `08-amazon-atlas-knowledge.md`. All cross-references in SKILL.md, the
  reference files and `scripts/*.py` updated; section
  numbers within `01-policy-rules.md` shifted by the two new sections and
  all `§` citations were re-pointed.
- Source documents retained under `references/00-source-*.txt`
  (`amazon-seller-central`, `keyword-attributes`, `error-codes`,
  `size-charts`) for provenance, and named as the tiebreaker when the
  distilled files drift.
- **Removed 45 blank Amazon India size-chart `.xlsx` templates** (1.3MB) that
  had been placed in `references/excel/`, after extracting their measurement
  schemas into `09-size-charts.md`. They were binary (unreadable without a
  script, defeating progressive disclosure), marketplace-scoped to India while
  the skill defaults to US/UK/JP/DE, and subject to the same staleness that
  this skill documents as the leading cause of error 99001. Sellers download
  the current template for their own marketplace from Seller Central. Skill
  size dropped from ~1.6MB to 332KB.
- Removed a stale pointer to `style-<category>.md` files that do not exist in
  this skill; category style guidance comes from `amazon_atlas`.
- Description extended with item highlights, browse nodes, attributes, error
  codes, and unsearchable-listing triggers.

## [0.2.0] - 2026-06-14

### Added
- AI image-improvement workflow (client-side): generate or regenerate listing
  images from the listing's existing public Amazon photos as seeds, using the
  user's own provider key (Google Gemini / OpenAI) and the user's own storage
  bucket. Generated candidates are validated, human-approved, staged to a
  public URL, and patched onto the listing's image locators under the existing
  preview→confirm→submit flow. The skill holds no secrets and hosts nothing.
- `scripts/validate_image.py` — no-secrets, deterministic pre-submit validator
  for Amazon image policy (`policy-rules.md` § 5): format, size, color space,
  resolution, and MAIN-image white-background + product-fill checks. Honestly
  reports text/logo/accuracy as human-review-only rather than faking them.
- `scripts/stage_artifact.py` — pluggable uploader (S3 / GCS / Cloudinary, and
  Google Drive via a service account) that returns a public/presigned URL for an
  approved image so Amazon can fetch it. In Claude.ai / Cowork, the in-session
  Google Drive connector can stage the image instead (`create_file` into a
  pre-shared public folder), since Amazon fetches the image URL unauthenticated.
- `references/ai-image-generation.md` — setup (provider + storage env
  contract), per-provider and per-store instructions, end-to-end workflow, and
  AI-specific image policy (accurate representation, main-image purity,
  mandatory human approval).
- First behavioral eval coverage in `evals/evals.json` (workflow, automation/
  approval boundary, config gating).

### Changed
- Expanded the "Image work" section of SKILL.md and clarified that Amazon
  fetches image locators by URL. Extended the description with image-generation
  triggers.

## [0.1.0] - 2026-06-10

### Added
- Migrated frontmatter to the agentskills.io Agent Skills spec: seeded initial `metadata.version` 0.1.0. No behavioral changes.
