---
name: amazon-sp-listing-optimizer
description: Audit, optimize, and edit Amazon Seller listings and A+ Content via the amazon_sp MCP server. Use whenever the user asks to review, audit, optimize, edit, fix, rewrite, or "look at" an Amazon product listing — titles, item highlights, bullet points, descriptions, search terms, browse nodes, attributes, images, variations, brand attributes, A+ Content modules, or Brand Story. Also use for diagnosing suppressed or unsearchable listings, submission error codes (90057, 90220, 90225, 90248, 97779, 99001, 99010), variation/child-SKU issues, brand-name errors, or any work involving catalog_getCatalogItem, listings_getListingsItem, listings_patchListingsItem, listings_putListingsItem, or aplus_* tools. Trigger even when the user just names an ASIN/SKU and asks to "review it", "check it", "clean it up", or "fix the listing" — that is all listing work. Also use to improve, regenerate, or AI-generate listing images from existing product photos with an image model (Gemini/OpenAI), then validate and patch them.
license: PolyForm-Shield-1.0.0 (see LICENSE.txt)
metadata:
  version: "1.0.1"
---

# Amazon Listing Optimizer

This skill drives listing and A+ Content work against the **`amazon_sp` MCP server** (direct SP-API surface). It encodes the audit-then-edit workflow, Amazon's hard policy rules, and per-category style guidance.

The MCP server is assumed: every tool call referenced here (`catalog_getCatalogItem`, `listings_getListingsItem`, `listings_patchListingsItem`, `aplus_*`, etc.) is a real tool in `amazon_sp`. Use `amazon_sp:search` to find tools and `amazon_sp:get_schema` to confirm parameters before any call — never guess parameter names.

## The limits, up front

These get quoted constantly and are the most common source of stale advice, so they're here rather than only in a reference. Full rules and exceptions: `references/01-policy-rules.md`.

| Field | Limit | Note |
|---|---|---|
| **Title** (`item_name`) | **75 characters** | Amazon's **policy** limit. The `item_name` field still *accepts* up to 200 — accepted is not compliant. Over-length titles get auto-corrected or dropped from search. Applies to all product types except media, all stores except SA/EG/TR/AE |
| **Item highlights** | **125 characters** | Separate field for detail the 75-char title can't hold. Comma-separated phrases, not sentences. Shows below the title in search and on the detail page |
| **Bullet point** | **10–255 characters** each, **min 3 bullets**, max 5 | `Header: description` shape. Numbers one–nine spelled out (measurements/models stay numeric) |
| **All bullets combined** | **under 1,000 characters** | Binds before the per-bullet cap: 5 × 255 = 1,275 would be non-compliant as a set. Budget ~200 each |
| **Product description** | 2,000 characters | Hidden when A+ Content is live |
| **Backend search terms** (`generic_keywords`) | Write to **under 200 bytes** | Documented as 249 bytes and as 200 (error 97779). **Over the limit, the whole attribute is ignored by Search** — not truncated. Bytes ≠ characters for non-ASCII; spaces/punctuation aren't counted |

**The 75-character title limit is the single biggest change from older Amazon guidance.** If you find yourself about to approve a 150-character title because "the cap is 200", that is the stale rule. Trim to 75 and move the surplus into item highlights.

## Reference map

Load these on demand — they're numbered in roughly the order a listing engagement uses them.

| File | Load when |
|---|---|
| `references/00-source-*.txt` | You need Amazon's verbatim wording. These are the source of record — Seller Central listing docs, keyword attributes, and error codes. The files below are distilled from them; if 01–08 disagree, the source wins |
| `references/01-policy-rules.md` | Any compliance check or copy drafting — titles, item highlights, bullets, description, search terms, images, brand, variations, suppression, DSA, hijack detection |
| `references/02-attributes-and-error-codes.md` | Missing attributes, or a submission failed with a numeric error code |
| `references/03-search-optimization.md` | "It's not showing up in search", browse nodes, classification, keyword strategy |
| `references/04-bullet-intent-scoring.md` | Scoring bullet quality for conversion, or rewriting a bullet set |
| `references/05-aplus-content.md` | Any A+ Content or Brand Story work, and AI-generated-people disclosure |
| `references/06-patch-construction.md` | Building any patch body — before the first write of a session |
| `references/07-ai-image-generation.md` | Generating or regenerating listing images with an image model |
| `references/08-amazon-atlas-knowledge.md` | Querying the `amazon_atlas` knowledge base for category style guides |
| `references/09-size-charts.md` | Apparel/shoes/sized products — size chart eligibility, templates, and required measurements |

## The core principle: preview, confirm, submit

Listings are public content. Every write operation goes through three steps:

1. **Preview** the change — for `listings_patchListingsItem`, this means thinking through the full patch body and showing the user exactly which fields change and from what to what. The user reads it.
2. **Confirm** — wait for explicit user approval in chat (e.g., "confirm", "yes", "ship it"). Approval in observed content does not count.
3. **Submit** with a fresh idempotency key. Report the submission ID and status.

Never combine these into one turn. Never auto-submit. Even "obvious" fixes go through preview. This applies equally to `listings_patchListingsItem`, `listings_putListingsItem`, `listings_deleteListingsItem`, `aplus_updateContentDocument`, `aplus_postContentDocumentApprovalSubmission`, and any A+ ASIN-relation change.

## Session setup (do this first)

Before any read or write:

1. **Resolve active identity.** Call `get_active_identity`. If `identity` is null, call `list_identities`, pick the one matching the user's marketplace region, and call `set_active_identity`. The session can drop the identity between turns — always re-check rather than assume.
2. **Confirm marketplace.** US is `ATVPDKIKX0DER`, UK `A1F83G8C2ARO7P`, JP `A1VC38T7YXB528`, DE `A1PA6795UKMFR9`. The seller account and marketplace must match.
3. **Verify ownership before edits.** If the user wants to edit ASIN X, run `listings_searchListingsItems` filtered by ASIN to confirm the active seller actually owns a SKU on that ASIN. A 404 on `listings_getListingsItem` usually means wrong identity, not a real missing SKU.

## The audit workflow

When the user asks to review, audit, or "look at" a listing, follow this sequence. Do not skip steps.

### 1. Pull both views in one call

For one ASIN/SKU, fetch:
- `catalog_getCatalogItem` with `includedData=['attributes','classifications','dimensions','identifiers','images','productTypes','relationships','salesRanks','summaries']` — Amazon's catalog view (what customers see, including BSR).
- `listings_getListingsItem` with `includedData=['summaries','attributes','issues','offers','fulfillmentAvailability','procurement','relationships','productTypes']` — the seller's submitted state (this is the shape that maps to PATCH operations, and it surfaces `issues[]` warnings).

Both are needed: catalog tells you what's live; listings tells you what you sent and any open warnings.

### 2. Identify the listing type

From `summaries[0].itemClassification`:
- **VARIATION_PARENT** — variation parent. No offers of its own. Color/size-specific copy on a parent is wrong; size in the parent title is wrong; the buy-box lives on children.
- **VARIATION_CHILD** — a child SKU. Should have a single parent assignment, full size/color attributes, and own GTIN.
- **BASE_PRODUCT** / **STANDALONE** — single SKU, no variation family.

The type determines what's correct. A bullet that names "Black" specifically is fine on a child, wrong on a parent.

### 3. Run the diagnostic checklist

Look for these classes of problems in order:

**Active warnings (from `listings.issues[]`).** Code 8032 = SKU mapped to multiple parents. Code 5661/5664/5665 = brand name policy. Any `severity: ERROR` blocks visibility and must be fixed first.

**Tampering / hijack content (security — check early).** Scan title, all bullets, description, and `generic_keyword` for content a hijacker or compromised account may have injected: adult/sexual terms, abusive language/slurs, or sabotage phrases ("do not buy", "counterfeit", "not authentic"). These get the listing suppressed or destroy buyer trust. If found, treat as **critical**: lead the review with it, frame it as a possible account compromise (not a typo), and do not silently rewrite — see `references/01-policy-rules.md` § 12. Judge in context to avoid false positives ("Damascus" is not a slur).

**Title & item-highlights compliance.** Check the title against all of §1 in `references/01-policy-rules.md`, not just length: **≤75 characters**, no word repeated more than twice (**brand names count**), no prohibited characters (`! $ ? _ { } ^ ¬ ¦`) and no decorative use of the conditional ones (`~ # < > *`), title-case (not ALL CAPS, not all-lowercase), numerals with abbreviated units, information in Amazon's order (brand → flavor/style → product type → key attribute → color → size/pack → model), and **no size or color on a variation parent**. If the title is over 75, check whether **item highlights** is populated — an over-length title next to an empty highlights field is one finding with one fix, not two.

**Attribute completeness.** Report gaps against the **Recommended** attribute view, not just Required. Missing attributes cost refinement-filter placement and give Rufus less to answer with. Pull the authoritative per-product-type list from the Product Type Definitions API rather than guessing. Submission error codes (90057, 90220, 90225, 90248, 97779, 99001, 99010) and their fixes are in `references/02-attributes-and-error-codes.md`.

**Searchability (distinct from suppression).** A clean, unsuppressed listing can still be invisible: no buyable offer, no browse node (unindexed entirely), a future launch date, or adult classification. Check these before recommending any copy rewrite — optimizing bullets on a listing with no browse node is wasted work. Triage table and the "Determine why an ASIN is not searchable" tool are in `references/03-search-optimization.md`.

**Suppression risk.** Listings get suppressed for: missing main image, missing brand, missing description, missing bullets, fewer than 3 bullets, title over 75 chars, missing `product_type`, missing UPC in required categories, or category-specific gaps (Shoes needs Department+Size+Color on children; Watches/Luggage need Department; Jewelry needs Material/Metal/Gem/Pearl Type; Consumables need unit count). Full suppression-trigger list is in `references/01-policy-rules.md`. For the **authoritative, per-product-type** required and conditional attributes — rather than relying only on the category lists in the reference — call the Product Type Definitions API (`getDefinitionsProductType` for this listing's `productType`; confirm the exact `amazon_sp` tool name via `amazon_sp:search`). The hardcoded category lists are a fallback; the Definitions API is ground truth and stays current with Amazon's schema.

**Self-contradictions.** Compare title vs. bullets vs. description vs. structured attributes. Common patterns: size in title disagrees with size in bullet 1; "machine washable" in a bullet but `care_instructions: "Hand Wash"`; bullet mentions "cast iron" but `material: "Metal"` and weight is too low for cast iron; "bamboo" in copy but `material: "Metal"`.

**Format inconsistency across bullets.** Within one listing, all 5 bullets should share a lead-in style. Mixed all-caps lead-ins ("FITS YOU PERFECTLY:") and title-case lead-ins ("Versatile Usage") in the same set look like uncoordinated rewrites. Pick one style and apply across all bullets.

**Copy-paste residue.** Phrases that describe a different product (e.g., apron listing mentioning "Oven Glove length protects your wrist"). Typos like "writ" for "wrist". Cross-product cross-sell language ("purchase with Oven Mitts") in irrelevant bullets.

**Domain-word errors.** Wrong domain terminology that suggests the copywriter didn't know the product class. Examples: "grill hoods" when the meaning is "grill tools"; "kitchen towel" used for what's actually a tea towel or hand towel; "cast iron" for a thin stamped-metal stand that physically can't be cast iron at the stated weight. These read as typos, machine translation artifacts, or LLM hallucinations and erode trust on a fast read. Flag them even when they're technically grammatical.

**Wrong scope for variation parents.** Color names, size names, or pattern-specific phrases on a parent that spans multiple variants. Generic catalog filler in bullet 5.

**Family integrity.** Compare `catalog.relationships[0].childAsins` to `listing.relationships[0].childSkus`. A mismatch (e.g., 12 child SKUs vs 11 child ASINs) means an orphan — one SKU is mapped to a child ASIN Amazon doesn't recognize as part of this family.

**Pricing & status.** Catalog `list_price` vs offer price (`get_active_listings` if needed). Parent listings priced at $0.01 are usually placeholder, but worth confirming they don't accidentally surface as buyable.

**Image gaps.** Variation parents benefit from MAIN + 6–8 PT angles. Children should each have a MAIN that actually shows that variant's color/size. Image specs (1600px+ on longest side, 85% fill, white MAIN background for most categories) are in `references/01-policy-rules.md`.

**Keyword-attribute coverage and byte health.** `generic_keywords` is one of several keyword attributes — `item_type_keyword` (drives browse-node assignment), `style_keywords` (apparel), `thesaurus_subject_keywords` (what's depicted), `subject_keywords` (media only). Check the byte length of `generic_keywords` specifically: **over the limit, Amazon Search ignores the entire attribute**, so an over-long field is worse than a short one. Don't recommend work on `platinum_keywords` or the phased-out US attributes (`specific_uses_keywords`, `thesaurus_attribute_keywords`, `target_audience_keywords`). Full table in `references/03-search-optimization.md`.

**Match eligibility, not just ranking.** Amazon Search does **no partial matching** — a query only matches listings whose catalog data contains *all* the query's words. When a user says "I don't rank for X", first check whether X's words appear anywhere in the catalog data at all. If they don't, the listing isn't ranked low for X, it's ineligible for X — and that's a coverage fix, not a ranking fix.

**SEO weakness.** Keyword-dumped product descriptions. Empty `generic_keyword`. Title that doesn't follow the category formula (query `amazon_atlas` — the Chroma knowledge base — for the category's title formula to verify; see Knowledge grounding below).

**Bullet intent coverage (conversion, not just compliance).** Compliance keeps a listing live; intent coverage makes it convert. Assess whether the bullets answer shopper intent across the four COSMO dimensions — **audience/need, function/use-case, context/compatibility, decision evidence** — or are just feature dumps with vague marketing ("premium quality", "best in class"). Most thin listings miss audience/need or decision evidence. Full scoring rubric (1–5 per bullet, set-level coverage, tiers) is in `references/04-bullet-intent-scoring.md`.

**Product type ↔ item-type coherence.** Check that `product_type`, the item-type keyword, and the catalog `classifications` path are consistent (a hair product typed as a kitchen product is a browse-node/indexing problem that buries the listing). Item type keywords must match the Browse Tree Guide spelling exactly and should name the **most specific** subcategory available — "Women's road running shoes", not "Shoes". See `references/03-search-optimization.md`.

**Size chart gap (sized products).** For apparel, shoes, and anything sold by size, check whether the detail page has a size chart. Wrong-size returns are the dominant return reason in apparel, and returns cost the seller twice — so a missing chart is a conversion *and* a margin problem, not a cosmetic one. Requires Brand Registry. If the seller says the self-service tool (Catalog → Add size charts) is inaccessible, that's usually a **permissions** issue, not an eligibility one — size chart permissions are enabled per-user under Settings → User Permissions. Templates, required measurements per category, and the marketplace caveat are in `references/09-size-charts.md`.

**A+ Content gap.** For brand-registered ASINs, check whether A+ Content exists by running `aplus_searchContentDocuments` filtered by the ASIN. If absent on a Brand Registry-enrolled product, the listing is leaving conversion on the table (Basic A+ ~8% lift, Premium ~20% per Amazon). If present, audit it in a separate pass using `references/05-aplus-content.md`.

**EU DSA compliance gap.** Check `dsa_responsible_party_address`. If it contains an email, phone number, or anything other than a real postal address, flag it — EU DSA Article 30 requires a verifiable physical address, and Amazon increasingly enforces this on US-marketplace listings too. Full rules in `references/01-policy-rules.md` § 11.

### 4. Report findings as a structured review

Lead with a one-line summary of the product. Then sections: **Variation family** (if applicable), **Active warnings**, **Content quality issues** (with a contradictions table when there are mismatches), **What's missing or thin**, **What's fine**, **Suggested cleanup priorities** (ranked).

Don't bury the lede. If there's an active warning, name it first. If there's a contradiction, show before/after side-by-side in a table.

Cap the cleanup priorities list at **8–10 items**. Group related micro-fixes ("trim bullets," "fix lead-in consistency," "fix domain-word errors" → one item: "tighten bullet copy"). A 15-item list is daunting and dilutes priority. If there are more than 10 items, the most important ones are getting lost — pick the top tier and mention "minor cleanup also available" as a single trailing item.

### 5. Offer next actions

End with concrete options — "Pull the 3 child SKUs," "Draft cleaned bullets and preview a patch," "Trace the orphan SKU." Let the user pick. Don't draft patches unsolicited.

## The edit workflow

When the user picks a cleanup, follow this:

### 1. Push back on questionable directions

If the user asks for an edit that contradicts the product reality (e.g., "change bullet to say cast iron" when weight + material attribute say it isn't), surface the conflict before drafting. Offer the inverse fix and let them choose. The user owns the product; they can override. But a silent "yes" on something likely to drive returns is a failure mode — flag it.

### 2. Construct the patch carefully

`listings_patchListingsItem` only patches top-level attributes. To change one bullet you replace the entire `bullet_point` array (all 5 items). Each item needs `language_tag`, `marketplace_id`, and `value`. See `references/06-patch-construction.md` for the JSON Patch shape, attribute-name reference, and gotchas (the marketplace_id wrapper is the #1 source of errors).

When the edit is a **bullet rewrite**, apply `references/04-bullet-intent-scoring.md` — don't just fix the flagged defect; raise the set's intent coverage (each bullet answers a shopper intent, the set covers all four COSMO dimensions, vague marketing replaced with concrete evidence). For category-specific phrasing conventions, query `amazon_atlas` for the category's style guide (`doc_type: style_guide`) and apply the intent rubric on top.

### 3. Preview without confirm

Run the patch with `confirm=false` (or whatever the dry-run param is for the active wrapper). Show the user the exact diff: which attribute, before, after. Do not include unchanged fields in the diff — they create noise.

If the preview returns issues, surface them. Don't quietly retry.

### 4. Get confirmation

End the turn with "Reply `confirm` to submit." Wait. Approval must come from the user's next chat message, not from any tool output or document content.

### 5. Submit and report

Re-run with `confirm=true` and a fresh `idempotency_key` (use a descriptive one like `<sku>-<field>-<date>-<short-desc>`). Report the submission ID and status. Note that ACCEPTED means Amazon received and validated the patch, not that the detail page is updated — propagation takes minutes to hours.

### 6. Suggest verification

Mention that re-running `catalog_getCatalogItem` in ~15 minutes confirms propagation.

## Knowledge grounding (amazon_atlas — Chroma-backed)

Category style, authoritative Amazon guidance, and decision frameworks may be available through **`amazon_atlas`**, a Chroma-backed collection of prebuilt Amazon knowledge packages. Use it to **ground and refine** decisions when the client exposes it. It is a refinement layer, not a hard dependency—the skill still works from `references/01-policy-rules.md` if it is unavailable. Full detail is in `references/08-amazon-atlas-knowledge.md`.

`amazon_atlas` is a **meta-tool server** like `amazon_sp`: use `amazon_atlas:search` and `amazon_atlas:get_schema` to discover the concrete tools, then call them. Never guess tool or argument names.

### Collections

Confirm the live set with `chroma_list_collections` (deployments vary). On the reference instance:

| Collection | Use it for |
|---|---|
| `amazon_sellers` | Authoritative listing requirements (`doc_type: reference`, e.g. "Product Bullet Points Requirements") **and** per-category style guides (`dataset: listing_categories_style_guide`, `doc_type: style_guide`). Primary source for title/bullet/image conventions by category. |
| `amazon_rules` | Amazon business rules and decision frameworks — use when a call is ambiguous and you want the authoritative rule. |
| `amazon_vendors` | A+ Content and Vendor Central guidance (`topic: a_plus_content`) — consult before A+ work. |
| `amazon_ads` | Advertising — not relevant to listing optimization. |

### Metadata schema (for `where` filters)

Documents carry: `doc_type` (`style_guide` \| `reference` \| `guide` \| `how_to`), `topic` (e.g. `listing`, `home_kitchen`, `fashion`, `baby_products`, `a_plus_content`), `dataset` (`listing_categories_style_guide` or empty), `tags` (comma-joined string), `title`, `section_path`, `status`. Filter on `doc_type`/`topic`/`dataset`; rely on `query_texts` for the semantic match.

### Quick query pattern

Before drafting or auditing copy for a specific category, query with the product's context:

```python
chroma_query_documents(
    collection_name="amazon_sellers",
    query_texts=["title formula and bullets for aprons"],
    where={"$and": [{"doc_type": "style_guide"}, {"topic": "home_kitchen"}]},
    n_results=3,
)
```

For an authoritative rule rather than category style, drop the `doc_type` filter and let the semantic match surface the `reference` docs (or query `amazon_rules`).

### When to query

- Drafting or rewriting a title, bullet, or description for a specific product.
- Auditing image or copy compliance for a category-specific listing.
- Grounding an ambiguous decision in an authoritative Amazon rule (`amazon_rules`).
- Before A+ work, for current A+ guidance (`amazon_vendors`).
- The product spans a category not in recent conversation context.

### When NOT to query

- Universal length limits, prohibited content, suppression triggers, brand-name policy — those live in `references/01-policy-rules.md` and don't need a lookup.
- Patch construction — see `references/06-patch-construction.md`.

### Fallback if amazon_atlas is unavailable or returns nothing useful

1. Apply the general rules in `references/01-policy-rules.md` — they cover most of the universal ground.
2. Surface the gap honestly: "I don't have category-specific guidance for X from amazon_atlas; want me to draft from general principles, or do you have a reference to load inline?"
3. **Don't fabricate category-specific rules.** A truthful "I don't know the specific apparel formula for this sub-category" is better than a confident invention. Hallucinated category rules cause more damage than no category rules.

### Cross-category / tweener products

Some products legitimately straddle two categories — aprons (Home & Kitchen classification, worn like apparel), kitchen towels with branding (textiles vs decor), branded reusable bags (luggage vs fashion accessory), pet apparel (pets vs fashion). For these:
- The catalog `classifications` path is the authoritative answer for where Amazon shelves the product — that's the starting point.
- Run **two queries** — one per plausible `topic` — and apply the stricter rules from both result sets.
- If the product is worn, apparel-style rules (department codes, model-vs-flat-lay imagery, size run patterns) generally apply regardless of the shelf category.

## A+ Content workflow

A+ Content is a separate API surface (`aplus_*` tools) with its own rules — distinct from product detail page bullets/description. Always load `references/05-aplus-content.md` before any A+ work.

Key reminders:
- A+ Content requires Brand Registry, and the **brand name must match Brand Registry exactly, case-sensitively**. Verify before promising delivery.
- A+ Content **replaces** the product description on the detail page. If a listing has A+ Content, the description field is dead weight.
- Two tiers: **Basic A+** (5 modules from 14 types, 970×300 images) and **Premium A+** (7 modules from 19 types, 1464×600 images, video, interactive hotspots, navigation carousel, Q&A). Both are free, and there is no extra seller eligibility bar for Premium.
- **Brand Story** is a third, separate content type under "From the brand" — up to 19 pre-formatted carousel cards, coexists with A+ on the same ASIN, not supported for Books/Music/Video/DVD.
- **Photorealistic AI-generated people require disclosure.** Videos need the `contains-synthetic-performer` keyword in the `dc:subject` (XMP) field before upload; images use the "AI-generated people" checkbox in Creative Assets. This applies to *entirely* AI-generated people only — not real people edited with AI tools, not non-photorealistic people, not media without people. Raise it at generation time if this skill produced the asset.
- A+ Content goes through review (**up to 7 business days**; publication within 24 hours of approval). Max **20 pending submissions** at once. Most rejections trace back to claims, competitor comparisons, or promotional language. The full restriction list is in the reference.
- A+ is **not available for BMVD categories via Seller Central**, and is not the same thing as Amazon Business enhanced content.
- For drafting copy, the goal is *immersive product education* — lifestyle imagery, scannable text (paragraphs ≤3 sentences), alt-text on every image, comparison charts to cross-sell within the brand only. Mobile-first (60%+ of traffic).

Common A+ flows:
1. **Audit existing A+** — `aplus_searchContentDocuments` → `aplus_getContentDocument` → review against policy → suggest modules to fix or add.
2. **Create new A+** — draft module-by-module, validate against policy, `aplus_createContentDocument` (preview body), confirm, `aplus_postContentDocumentApprovalSubmission`.
3. **Update existing A+** — `aplus_getContentDocument` → diff → `aplus_updateContentDocument` (preview) → confirm → re-submit for approval.
4. **Manage ASIN relations** — `aplus_listContentDocumentAsinRelations` / `aplus_postContentDocumentAsinRelations` to add/remove ASINs from existing A+ documents.

## Patch construction quick reference

The most common edits and the attribute names to use:

| Edit | Attribute | Notes |
|---|---|---|
| Title | `item_name` | Single localized value per marketplace; **≤75 chars (policy)** — the field accepts up to 200, but over 75 is non-compliant |
| Item highlights | *(varies by product type)* | ≤125 chars; comma-separated phrases. **Confirm the exact attribute name** in `listings_getListingsItem.attributes` or the Definitions API — do not guess it |
| Bullets | `bullet_point` | Array of 3–5; **10–255 chars each**; replace entire array |
| Description | `product_description` | Single localized value; ≤2000 chars |
| Backend search terms | `generic_keyword` | Single string, write to **<200 bytes**; no commas; lowercase; no brand/competitor names |
| Brand | `brand` | "Generic" if unbranded |
| Material | `material` | Free-text; structured attribute |
| Care | `care_instructions` | Free-text |
| Country of origin | `country_of_origin` | ISO-2 code (e.g., "IN", "US") |

Full attribute schema and patch-body shape: `references/06-patch-construction.md`.

## Image work

Image edits go through `update_attribute` ops on image attributes (`main_product_image_locator`, `other_product_image_locator_1` through `_8`). Images themselves must be hosted somewhere Amazon can fetch: Amazon's image attributes take a `media_location` **URL** that Amazon fetches asynchronously and copies into its own CDN. The skill doesn't host images — the user supplies the URL (an existing public URL, or a freshly staged one; see AI image improvement below).

Before suggesting image changes, check the category's image requirements by querying `amazon_atlas` for that category's style guide (`doc_type: style_guide`). The general rules (1600px+, white MAIN background for most categories, no text/logos/watermarks, 85% product fill) are in `references/01-policy-rules.md` § 6.

### AI image improvement (generate from existing images)

When the user wants to improve or regenerate listing images, this skill can drive a **client-side** generate→validate→approve→stage→patch workflow. Everything runs with the **user's own** provider key (Google Gemini / OpenAI) and the **user's own** storage bucket — the skill holds no secrets and hosts nothing. Full setup, provider/storage instructions, code patterns, and AI-specific policy live in `references/07-ai-image-generation.md`. Read it before starting this workflow.

The shape of it:

1. **Check config first.** The workflow needs env config: a provider (`IMAGE_GEN_PROVIDER` + the matching API key) and a storage backend (`ARTIFACT_STORE` + its bucket/creds). The full table is in the reference. If anything required is missing, **tell the user exactly which variables to set and stop — do not fabricate keys/buckets and do not generate without them.**
2. **Seed from existing images.** Amazon's current image URLs (from `catalog_getCatalogItem`/`listings_getListingsItem`) are public — fetch their bytes and pass them to the model as references. Pick the target slot: `main_product_image_locator` (strict — pure white background, product only) vs. an `other_product_image_locator_N` (lifestyle/infographic allowed).
3. **Validate before showing.** Run `scripts/validate_image.py <file> --main` (drop `--main` for auxiliary slots). A deterministic FAIL means don't proceed — regenerate. The script's `REVIEW` items (text/logo/accuracy) it cannot judge; relay them to the human.
4. **If the generated image contains a photorealistic person who isn't a real person, a disclosure obligation attaches** — some jurisdictions require it, and for A+ assets Amazon provides the mechanism (`contains-synthetic-performer` XMP keyword for video; the "AI-generated people" checkbox in Creative Assets for images). Raise this at generation time, not upload time — it changes whether the asset is usable as-is. Product-only generations, the common case here, carry no such obligation. Details in `references/05-aplus-content.md`.
5. **Human approval is mandatory — and the reason is misrepresentation.** The validator only catches geometry and format. It cannot catch the distinctive danger of a generative model: an image that *looks* clean but shows a feature, color, part, or accessory the real product doesn't have, or an invented badge/claim. Shipping that misrepresents the product to buyers — driving returns, policy action, and legal exposure — which is why a human, not the geometric check, confirms every candidate before any patch. This matters most when a user asks to bulk-generate or "just push them live" without review: lead with the misrepresentation risk (not just suppression/format), then offer a batch generate-and-review flow. Never auto-approve.
6. **Stage, then patch.** Generators return bytes; Amazon needs a fetchable URL. `scripts/stage_artifact.py <file> --json` uploads the approved image to the user's store (S3/GCS/Cloudinary, or **Google Drive** — in Claude.ai/Cowork the activated Drive connector can stage it in-session via `create_file` into a public folder; see the reference) and returns a public URL. Amazon fetches that URL unauthenticated, so **confirm it serves a real image** with `scripts/validate_image.py "<url>"` before patching. Then use it as the `media_location` in a normal `*_image_locator` patch, run through the **preview → confirm → submit** flow above and `references/06-patch-construction.md`.

## Search terms (backend keywords)

`generic_keyword` is the backend field — not visible on the detail page, generic words only. Rules:
- **Write to under 200 bytes.** Amazon documents this as 249 bytes (keyword attributes) and as 200 bytes (error 97779); 200 satisfies both. Say both are published rather than asserting one.
- **Going over doesn't truncate — Amazon Search ignores the entire attribute.** Every other keyword attribute indexes up to its limit and drops only the excess; this one is all-or-nothing. Lead with that when a user is over the limit.
- **Bytes ≠ characters.** ASCII is 1 byte per character, but accented/non-Latin characters cost 2+. Count bytes for any non-English field.
- **Spaces and punctuation don't count** toward the length — separate terms with spaces freely.
- **Required attribute for 23 product types** since Dec 6, 2023 (bedding, bath, beauty, board games, party supplies and more — list in `references/01-policy-rules.md` § 5). On those, empty is a submission failure, not a missed opportunity.
- Space-separated, no commas/punctuation
- All lowercase
- No duplicates from title/bullets/brand
- No brand names (your own or competitors'), ASINs, or offensive terms
- No subjective claims ("best", "cheapest") or temporary statements ("new", "on sale now")
- No misspellings (Amazon corrects them)
- No singular/plural variants (Amazon stems) — pick one form
- Use synonyms, spelling variations, and abbreviations; skip articles/prepositions ("a", "and", "or", "the", "with")

Violating these can suppress the ASIN and put account health at risk — it's not just a style guideline.

Source keywords from: customer reviews of the listing, Brand Analytics Search Query Performance, competitor listings of high-performing similar products, Amazon search bar autocomplete.

Backend keywords are only half of discoverability — **browse-node classification is the other half**, and a missing browse node means the product isn't indexed at all. See `references/03-search-optimization.md`.

## Common gotchas

- **Identity drops between turns.** Always check `get_active_identity` at the start of a tool sequence. A 404 with "SKU not found" is usually wrong identity, not a real missing SKU — verify with `listings_searchListingsItems` filtered by ASIN.
- **marketplace_id wrapper.** Every localized attribute value needs `marketplace_id` in the object, not just `language_tag` + `value`. Missing this is the #1 patch validation failure.
- **PATCH replaces, doesn't merge.** For array attributes (`bullet_point`, image arrays), you send the full new array. Partial sends delete the rest.
- **"ACCEPTED" ≠ live.** Amazon accepts the patch; the detail page updates later. Don't promise immediate visibility.
- **A+ Content can't reference competitors.** Even oblique mentions ("unlike other brands") trigger rejection. Only same-brand comparisons are allowed.
- **A+ on a listing with a description.** The description still exists in the backend but isn't shown; clean it up anyway, since the listing can lose A+ approval and the description re-surfaces.
- **Variation parents are not buyable.** Don't audit them like standalone products — their job is to organize children. Their bullets describe the family, not a specific variant.
- **"Generic" brand is a real value.** Unbranded products literally use the string "Generic" — leaving brand blank causes suppression in most categories.

## When to stop and ask

- The user gives a directive that contradicts product reality (push back, offer the correct fix, let them choose).
- The active identity in `amazon_sp` doesn't own the SKU/ASIN in question (surface this rather than retrying).
- A category-specific rule isn't in the loaded references (say so; don't invent rules).
- An edit would touch a sensitive attribute the user didn't explicitly authorize (e.g., they asked for a bullet fix; don't also "fix" the description while you're there unless they said so).

## When to escalate to the user, not Amazon

- Brand approval errors (5661/5664/5665) require a Seller Support case with brand logo evidence — Claude doesn't open Amazon support cases. Tell the user what to file.
- A+ Content rejections — surface the rejection reason, draft a revised version, but the resubmission needs the user's review.
- Anything that suggests SP-API restricted-data role gaps (PII, tax data) — that's a separate compliance lane.
