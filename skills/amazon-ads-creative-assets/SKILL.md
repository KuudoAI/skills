---
name: amazon-ads-creative-assets
description: >-
  Build and ship Amazon Ads creative assets end to end: generate compliant
  images (custom and lifestyle images, brand logos, display banners) and ad
  copy, then register them through the Amazon Ads MCP creative assets API. IF
  the user wants ad creative for Sponsored Brands, Sponsored Display, Amazon
  DSP, or eCommerce display — asks what size or file format an ad image must
  be, wants a lifestyle image for an ad, needs one image resized into
  square/wide/tall, asks whether text or a logo may appear in the creative,
  wants ad headline copy inside Amazon's limits, or has a rejected ad — OR
  wants to upload, register, version, search, or check the status of a
  creative asset (assetId, assetSubType, failedSpecChecks, PROCESSING, upload
  URL, creative asset library) — THEN invoke this skill. DO NOT invoke for
  retail product listing photos on a detail page (that is the
  amazon-product-image skill), or for campaign structure, bidding, budgets,
  or reporting.
compatibility: Creative specs and policy work standalone. Registering assets requires the Amazon Ads MCP (code-mode meta-tools) plus an out-of-band HTTP PUT for the upload step; image generation requires an image tool.
license: PolyForm-Shield-1.0.0 (see LICENSE.txt)
metadata:
  version: "0.3.1"
---

# Amazon Ads creative assets

Amazon reviews every self-service ad before it runs, and review takes up to 72
hours. So the goal here is not "make a nice image" — it is **make an asset
that passes the first time**, because every rejection costs another cycle and
launches slip.

This skill covers the whole asset lifecycle: what to build, at what
dimensions, with what allowed inside the pixels, how to check it, and how to
get it registered through the Amazon Ads MCP so a campaign can use it.
Campaign structure, targeting, and reporting belong to other skills.

## Account-context recovery

If Amazon account scope, identifier type, marketplace mapping, or account relationships become unclear, consult `amazon-ads-accounts` when it is available. Resume this skill after resolving the ambiguity. If it is unavailable, use equivalent read-only discovery and ask the user when multiple valid choices remain. Never guess or interchange identifier types.

## Ask this first: which program?

The image rules **invert** between programs. This is the highest-stakes
question in the workflow and it decides everything downstream.

| Program | You deliver | Text or logo inside the image? |
|---|---|---|
| Sponsored Brands | Custom image + separate logo + separate headline | **No** |
| Sponsored Display | Custom image + separate logo + separate headline | **No** |
| Amazon DSP component-based | Three-ratio image set + logo + copy fields | **No** |
| eCommerce (REC) display | A composed image per ad size | **Yes** — ≤ 10 words, ≤ 2 logos |
| DSP banner / standard media | A finished, composed ad unit | **Yes** — it is a finished ad |

A lifestyle photo with the brand name burned in is an automatic rejection for
Sponsored Brands and a requirement for a mobile banner. Same pixels, opposite
verdict. If the user hasn't said which program, ask — don't guess from the
dimensions, because several programs share the 1200 × 628 shape.

Full routing table and every spec: [`references/01-asset-specs.md`](references/01-asset-specs.md).

## Workflow

1. **Classify.** Program, asset role (custom image, logo, banner, copy),
   marketplace, and the ASINs or landing page the ad points at.
2. **Pull the spec.** Read the relevant section of
   [`01-asset-specs.md`](references/01-asset-specs.md) and state the target
   dimensions, format, and file-size cap before generating anything. Build to
   the *recommended* size, not the minimum — upscaling later reads as low
   quality to a reviewer.
3. **Gather real product references.** Any asset showing the product needs the
   seller's actual photos as reference images. A generated product that
   differs from the one on the detail page is misleading content, which is a
   policy violation and not a stylistic choice.
4. **Generate.** Use the prompt patterns and the negative list in
   [`03-image-generation.md`](references/03-image-generation.md). For custom
   images produce all three aspect ratios — square, wide, and tall — since one
   upload serves up to 12,000 size variations and Amazon crops toward centre.
5. **Validate the pixels, not the prompt.** Run the checklist in
   [`03-image-generation.md`](references/03-image-generation.md). Image models
   add text even when told not to; look at the output.
6. **Hand off** with an asset manifest so the next step knows which spec each
   file was built to and what was actually verified —
   [`06-handoff-contract.md`](references/06-handoff-contract.md).
7. **Register** through the Ads MCP: get an upload location, move the bytes,
   register the asset with its ASINs as tags. The upload step needs a plain
   HTTP PUT the MCP cannot perform — establish who does it *before* minting a
   URL that expires in 15 minutes.
   [`07-assets-api-mcp.md`](references/07-assets-api-mcp.md).
8. **Track.** Poll to `ACTIVE` (up to 30 minutes, longer for video), read
   `failedSpecChecks` against the target program rather than as pass/fail, and
   remember that `ACTIVE` is not moderation approval.

## The numbers you will reach for most

| Asset | Recommended | Minimum | Max file |
|---|---|---|---|
| Custom image, square 1:1 | 1200 × 1200 | 600 × 600 | 5 MB |
| Custom image, wide 1.91:1 | 1200 × 628 | 600 × 314 | 5 MB |
| Custom image, tall 9:16 | 900 × 1600 | 338 × 600 | 5 MB |
| Brand logo (SB / SD / DSP) | 1:1, ≥ 400 × 400 | 400 × 400 | not published |
| Logo (eCommerce REC) | ≥ 600 × 100 | 600 × 100 | 1,000 KB |
| Mobile banner 320 × 50 | 640 × 100 @2X | required @2X | 50 kb |
| Mobile banner 414 × 125 | 828 × 250 @2X, 640 × 250 safe zone | required @2X | 100 kb |
| Desktop 300 × 250 / 728 × 90 / 160 × 600 | exact size | — | 40 kb static, 200 kb HTML |
| Desktop 300 × 600 | exact size | — | 50 kb static, 200 kb HTML |

Static file caps drop to **50 kb in France, Italy, Spain, and Japan**. Copy
limits: headline 50 characters, brand name 25, body 100, disclaimer 60 (JP
roughly half). Banner text sits at 16 pt or larger at 2X.

A logo is not just a size. Whenever you quote logo dimensions — on a spec
sheet especially — carry the content rules with them, because they reject just
as fast: it must be the brand's **registered** logo with rights to use it, it
**fills the frame or sits on a white or transparent background**, its text is
legible on mobile and desktop, and it stays consistent across ads. It may not
combine multiple logos, sit on a complex graphical background, be a product
image or ASIN, or act as a headline extension.

## What may never appear in an ad image

True across every program, including finished banners:

- Prices, discounts, savings percentages, or deal badges
- Star ratings, review counts, or quoted reviews
- Amazon branding, boxes, smile marks, or references to Amazon products
- Award seals or certifications you cannot substantiate
- Anything that looks clickable but isn't
- Letterboxing, pillarboxing, or padding bars
- Blurry, pixelated, stretched, cluttered, or collaged imagery
- A white, off-white, or transparent background on a custom image or a
  borderless unit

And two positive requirements that get missed: the product must be
**prominently displayed**, in use or on its own, and campaign imagery must use
**diverse models** — Amazon names races, ages, body types, ethnicities, and
gender identities as a requirement.

Copy rules, claims, prohibited categories, and the full policy:
[`references/02-creative-policy.md`](references/02-creative-policy.md).

## Copy that passes

Sentence case only — capitalize the first word, proper nouns, and trademarks.
No title case, no ALL CAPS. At most two repeated punctuation marks. No
superiority claims ("best", "biggest", "most") without substantiation, no
naming competitors, no pressuring language.

Savings language is narrow: "[Product] savings", "Save now", "Great prices on
[Product]", "Buy [Product] and get [additional Product] free" are acceptable;
"Save 50%" and "Huge savings" are not. The word "Deal" requires an actual
Amazon deal live for the campaign's duration.

Calls to action split by program: Sponsored Brands takes a direct
two-to-three-word CTA; display ads generate their own, so do not add one.

## When something gets rejected

Read the rejection reason before touching the file, then fix every
co-occurring defect in one pass — a second rejection costs another 72 hours.
The reason-to-fix table is in
[`references/04-rejection-triage.md`](references/04-rejection-triage.md).

Cheapest habit available: pre-moderate assets in bulk before building
campaigns. Amazon supports submitting assets for approval ahead of use, which
turns a campaign-blocking rejection into an early signal.

## Getting assets into Amazon

Registration runs through the Ads MCP's code-mode meta-tools
(`amazon_ads_v4:search`, `get_schema`, `execute`). Call `get_schema` before
the first use of an unfamiliar tool rather than assuming parameter names. Four
things trip people up, and all four are worth saying before they bite:

- **The MCP cannot upload the bytes.** The flow is
  `creat_getUploadLocation` → **HTTP PUT** → `creat_registerAsset`, and no
  tool in the catalog performs that PUT. Agree how the bytes will move before
  minting a URL, because it expires in 15 minutes. `registerAsset` then takes
  that *same* URL, so keep it.
- **`failedSpecChecks` is usually non-empty on success.** It lists the
  programs the asset is *not* eligible for. An asset built for Sponsored
  Brands routinely fails DSP and Stores checks and is still perfectly good.
  Read it against the target program; calling that "validation failed" is a
  false alarm.
- **A new version needs a new filename.** Same filename returns the existing
  `assetId` with no new version and a 200 — a silent no-op that bites
  generated-creative pipelines writing `hero.png` every run.
- **`ACTIVE` is not approved.** Library processing takes up to 30 minutes and
  is separate from ad policy moderation, which takes up to 72 hours and can
  still reject the creative.

Pass the ASINs at registration; they become searchable tags and are the join
key you will want later. Full parameter tables, versioning, search filters,
and the documented discrepancies:
[`references/07-assets-api-mcp.md`](references/07-assets-api-mcp.md).

## Honest limits

- Amazon revises these pages without notice, and a few published numbers
  conflict with each other. The conflicts are listed at the end of
  [`01-asset-specs.md`](references/01-asset-specs.md) with the safe choice for
  each. When a number decides whether an asset gets built, say where it came
  from and offer to re-check it.
- Some values are simply not published — Sponsored Brands logo file format and
  maximum size among them. The console validates on upload. Say "not
  published, the console enforces it" rather than inventing a number.
- Prohibited and restricted category decisions belong to Amazon's policy
  pages, not to a summary. For a category call, go to the source.

## Resources

- [`references/01-asset-specs.md`](references/01-asset-specs.md) — every
  dimension, file size, and format, grouped by program; conflicting numbers
- [`references/02-creative-policy.md`](references/02-creative-policy.md) —
  creative acceptance policy: images, logos, copy, claims, prohibited content
- [`references/03-image-generation.md`](references/03-image-generation.md) —
  prompt patterns, the negative list, fidelity protocol, validation checklist
- [`references/04-rejection-triage.md`](references/04-rejection-triage.md) —
  rejection reason to fix
- [`references/05-video-assets.md`](references/05-video-assets.md) — Sponsored
  Brands and display video specs (image work is the primary focus here)
- [`references/06-handoff-contract.md`](references/06-handoff-contract.md) —
  the asset manifest for downstream agents and the Ads MCP
- [`references/07-assets-api-mcp.md`](references/07-assets-api-mcp.md) — the
  creative assets API through the Ads MCP: the three-call flow and the upload
  gap, registration parameters, `failedSpecChecks`, status, versioning,
  search, known discrepancies, permissions
