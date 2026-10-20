# Theme decisions and exact proposals

Lead with up to three distinct actionable decisions by default (user-adjustable), then concise holds/no-change findings and supporting tables. A table of diagnostic `investigate` rows is not an action queue. One decision selects one primary change. Do not replace a decision with a checklist of price, shipping, reviews, images and title investigations.

## Evidence before action

Fetch available decisive evidence once per ASIN/marketplace and reuse it. Record source, date, coverage and confirmation status separately for product facts and listing presentation. Catalog is useful discovery evidence but merges multiple sources: disagreement with a listing does not prove the listing is wrong. `product_fact_correction` requires a seller-confirmed specification or the user's explicit confirmation for this variant. Repetition of the disputed listing claim is not independent confirmation. Otherwise return `hold_missing_evidence` naming the single fact to confirm.

Absence requires complete relevant fields: a complete title/bullet read can establish omission there, not across the entire PDP. Image claims require images; unavailable A+ or images do not become defects. Current evidence is not historical listing evidence. A proposed omission edit must use supported product facts and remain within inspected fields. If dimensions already appear clearly, do not add them again just because the cohort underperforms.

## Precedence

Apply full-query relevance first. Mixed themes keep eligible exact/substitute slices and list excluded members. One mismatched query never excludes the whole eligible theme.

| Condition | Decision | Output |
|---|---|---|
| Invalid scope/counts or comparison-affecting conflict | `hold_invalid_input` | One repair needed; continue unaffected analysis |
| All members known complement/irrelevant, none eligible or unknown | `exclude_theme_targeting` | Unsupported needs and member IDs |
| Seller/user-confirmed fact contradicts listing | `product_fact_correction` | Exact correction even with thin SQP; performance impact unproven |
| Unconfirmed catalog/listing conflict, or only unknown members | `hold_missing_evidence` | One fact to confirm |
| Recurring localized candidate plus verified specific omission/ambiguity | `listing_content_test` | One exact draft, uncertainty disclosure and cohort measure |
| Adequate theme, decisive product/listing evidence unavailable | `hold_missing_evidence` | One missing fact/read, after attempting available retrieval |
| Insufficient counts/recurrence | `hold_insufficient_data` | Failed gate and observations needed |
| Complete relevant evidence but no supported change | `no_change` | Brief explanation; preserve already useful content |

An inferred use case alone cannot qualify. Substitutes may warrant truthful clarification, never copy pretending to meet an unmet requirement. Observed weaker purchases do not require inventing a remedy. Read [ASIN rules](asin-rules.md) for secondary offer/operations findings.

Sort actions: confirmed corrections, then supported content tests; within each class by affected ASIN clicks descending, query volume descending (missing last), theme and ASIN lexical ties. Deduplicate same-field/fact proposals: prefer the more specific supported theme, then clicks, then lexical order. Preserve aliases and union membership rather than summing duplicated reach. Show holds separately; default to no action if none qualifies.

## Additive contract 2.1

Use one `schema_version: "2.1"`. Retain 2.0 diagnostic record fields and meanings (`reported`, `derived`, `product_evidence`, `relevance`, `intent_hypotheses`, `qa`, `priority`, `observations`, `recommendations`, report/scope/query/ASIN). A diagnostic recommendation may remain conditional; it does not automatically become an actionable theme decision. Empty recommendations are valid. Version 2.0 consumers must accept the new schema tag before reading additive fields.

Add `theme_rollups` (helper output) and `theme_decisions`. Each decision includes:

- Stable theme ID (scope + gram + relevance), member IDs and aliases; decision class.
- Evidence references with source/confirmation and coverage; before text, exact after text or concrete image brief; observed gap and bounded rationale.
- Selector: ASIN, seller SKU when known, marketplace, Amazon attribute (such as `bullet_point`), zero-based array index and language tag. Missing seller SKU can be resolved by the owning skill before a write; never guess it. Asset proposals name the actual observed slot/asset.
- Cohort counts, named-denominator ratios, Wilson intervals and uncertainty statement, effective thresholds; affected traffic explains priority without projected lift.
- Single blocker for holds; comparable complete periods and an affected-cohort measure for tests, with concurrent changes recorded.

Example proposal selector: `{"asin":"B0TESTBED01","sku":"BED-L","marketplace_id":"ATVPDKIKX0DER","attribute":"bullet_point","index":0,"language_tag":"en_US"}`. The listing optimizer re-reads that entry and validates the marketplace/product-type attribute schema before an approved write. The index is a proposal locator, not permission to overwrite a changed array blindly.

Hand a user-selected proposal to `amazon-sp-listing-optimizer` when available. Preserve its preview/approval flow. This skill performs analysis and drafting only.
