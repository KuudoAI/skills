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

## [1.2.0] - 2026-10-17

### Added

- Stack planning: each image answers one buyer question, with a default
  hard-goods sequence (main, benefit overview, lifestyle, close-up, size and
  scale, comparison or use-case chooser, what's in the box) framed as a
  default to adapt, not a slot quota.
- Per-image guidance and prompt patterns for benefit infographics (one
  headline plus 3–5 sourced callouts), size and scale (familiar reference,
  seller dimensions, no perspective exaggeration), comparisons, and
  what's-in-the-box images; lifestyle images keep the product as the focal
  point with no prop that could read as included.
- Comparison decision path: the seller's own lineup first, then an unbranded
  alternative only when every cell is sourced or true by definition,
  otherwise give the position to another buyer question. Competitor
  exclusion is reported as a cautious recommendation echoing Amazon's A+
  guidance, not as gallery-image policy.
- Claim-coverage gate for added copy: source every claim, never strengthen
  one, treat category norms and related-spec inference as non-sources, and
  keep unconfirmed copy and placeholders out of ready-to-run prompts.
- Main-image framing: centered with a white margin on every side, 85 percent
  fill measured along the longest dimension for elongated products, and a
  square canvas set through the tool's aspect-ratio or size control when
  available.
- Stack-level checks: cross-image color and finish consistency, a phone-width
  legibility test, and a working text-size heuristic for prompts.
- Evals for stack planning, a cluttered-infographic audit, a lineup
  comparison with a competitor request, and a sparse-spec padding trap;
  a stack-planning trigger query.

### Notes

- Ported from the Agent Iris copy after two eval iterations there
  (with-skill 23/23 vs 18/23 for the prior version, then 34/34 vs 29/34
  against the first iteration; one run per configuration).
- Evaluated against 1.1.0 on the four new evals with no image tool
  available: 38/38 vs 30/38. The gains are in stack planning and audit
  attribution; the lineup-comparison and sparse-spec evals tie, because
  1.1.0's existing rule against inventing product facts already held there.
