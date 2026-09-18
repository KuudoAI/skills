# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are semver and
must match `metadata.version` in SKILL.md.

Bump rules: **patch** = non-behavioral (typos, formatting, reference-only
edits) · **minor** = behavioral additions (new sections, rules, triggers) ·
**major** = contract changes (response shape, output format, scope).
Every bump also updates `evals/evals.json` `skill_version`.

## [0.1.0] - 2026-09-09

First versioned release. The skill existed as an unversioned draft with no
changelog, no evals and no MCP declaration; this cuts it to a shippable
baseline and fixes three defects that produced confidently wrong numbers.

### Fixed
- **`margin.py` reported a break-even price that loses money.** The solver
  returned the first price where profit crossed zero and stopped. A
  whole-price referral band re-rates the *entire* price at its threshold, so
  profit can be positive below the threshold, negative just above it, and
  positive again higher up — and the first crossing sits below the dip. On a
  Beauty product (8% up to $10, then 15% on the whole price) the solver
  returned $9.89 with no warning, while every price from $10.01 to $10.70
  lost money. `break_even_price` is now the **safe floor**: the lowest price
  profitable all the way to the top of the solve range. `lowest_break_even`
  keeps the old value, `loss_zones` names the dead ranges, and a warning
  fires when they differ. `price_for_target_margin` has the same treatment
  via `below_target_zones`. This affects live mode too — FBA price bands
  create the same discontinuity. Regression pinned in
  `scripts/fixtures/per-unit-beauty-whole-band.json`.
- **`amazon_take` used the wrong denominator.** It divided Amazon's fees by
  the VAT-inclusive selling price while every other margin in the model uses
  net revenue, so in a 20% VAT market it reported 37.01% where fees actually
  consumed 44.41% of net revenue. It now uses net revenue, matching the
  skill's own "name the denominator" guardrail, and carries the gross-price
  figure alongside as `amazon_take_of_gross_price`. The published US worked
  example is VAT-free, so its documented 37.0% is unchanged.
- **`pnl.py` emitted `deltas_in_points` as fractions.** The JSON gave
  −0.0285 where the text render printed −2.9 for the same movement — a
  hundredfold disagreement between the two output paths of one script. The
  key says points, so it now holds points. Keys also drop the misleading
  `_pct` suffix.
- **Dangling skill reference.** The workflow delegated returns analysis to
  `refund-return-rate-monitor`, which no longer exists under that name; it is
  `amazon-sp-refund-return-monitor`.
- **Non-canonical MCP server name.** References named the Ads server
  `amazon_ads_v4`; every skill in this repo that declares one uses
  `amazon_ads`.

- **Margin figures were reported without their denominator.** The "name the
  denominator" guardrail existed but sat in Guardrails, where it did not reach
  the reporting step, and an eval caught the skill emitting a bare "Margin"
  column with net revenue never mentioned. The report step now asks for it
  explicitly, with the reason: a bare percentage compared against a benchmark
  computed on gross sales is wrong in a way the reader cannot see.

### Added
- Optional `amazon_sp` and `amazon_ads` integration paths. Neither is required:
  without them the skill runs in manual mode on seller-supplied fees and labels
  the output as such.
- `compatibility` field stating that degradation path.
- `scripts/fixtures/` and `scripts/validate_fixtures.py`. Both reference docs
  said "re-run this case after any change" while shipping no inputs to run —
  the published per-unit example, the published worked quarter and the
  discontinuity regression are now executable, with their expected values
  checked against the figures quoted in the references.
- `evals/` with behavioral cases covering model selection, the safe floor,
  the COGS refusal, the channel-vs-net-margin distinction and VAT treatment.

### Changed
- Description rewritten into the `IF … THEN invoke … DO NOT invoke for …`
  form. It previously claimed "what price to charge" and "break-even" with no
  exclusions, colliding head-on with `amazon-sp-repricing`, whose own trigger
  list includes "needs a floor or break-even price". The boundary is now
  explicit: break-even and margin *analysis* here, live price setting and
  competitive repricing there.
- `references/us-referral-fees.md` no longer tells the reader to pass a
  `per_item_minimum` and `closing_fee` whose amounts it never states. Which
  categories carry them is recorded; the amounts must come from a live probe,
  the seller, or Amazon's pricing page — consistent with the skill's own
  "never invent a fee number" guardrail.
