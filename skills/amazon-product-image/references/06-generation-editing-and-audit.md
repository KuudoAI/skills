# Generation, editing, and audit

Use this reference when producing prompts, operating a client-provided image tool, editing an existing image, or reporting an image audit.

## Tool selection

Use the image-generation or editing capability actually available in the client. Inspect its supported inputs and outputs rather than assuming a provider, model, tool name, mask format, or file type.

If no image tool is available, provide a production-ready prompt and validation plan. Do not claim that an image was generated or inspected when it was not.

## Source-of-truth inputs

Ground the work in the best available evidence:

- original product photography;
- verified logo or label artwork;
- accurate dimensions, color, material, quantity, and included contents;
- listing title and variation context; and
- the intended image role and marketplace/category requirements.

When the source does not establish a product fact, ask or leave it unchanged. Do not invent unseen surfaces, accessories, packaging, labels, or capabilities.

## Main-image prompt pattern

```text
Create or edit an Amazon listing MAIN image for [exact product and variant].

Preserve: product shape, proportions, color, material, quantity, included contents,
and all verified physical details from the source.
Composition: one clear product view; entire product visible; approximately 85% frame fill.
Background: seamless pure white open field, RGB 255,255,255.
Exclude: unrelated props, extra accessories, lifestyle scenery, added text, badges,
prices, reviews, watermarks, borders, inset views, Amazon marks, and unsupported claims.
Category constraints: [verified marketplace/category requirements].
```

For an edit, define the mask or changed region and state the invariant pixels:

```text
Change only: [specific region and correction].
Retain from source: [product edges, logo/label region, texture, hardware, color references].
```

## Brand marks and printed text

Generative tools can alter lettering and logos even when prompted not to. “Preserve exactly” is a required outcome, not proof that the model achieved it.

Prefer, in order:

1. leave verified logo and text pixels outside the edited mask;
2. composite verified source artwork after generation; or
3. route the result for human correction and review.

Compare the final pixels with the source. If exact fidelity cannot be verified, report the image as needing review rather than compliant.

## Alternate-image patterns

### Lifestyle

```text
Show [exact product] in realistic use by [user/context]. Preserve product identity,
scale, color, material, and included contents. Use a plausible environment.
Avoid unsupported outcomes, endorsements, badges, pricing, reviews, and Amazon marks.
```

### Infographic

```text
Show [exact product] with factual labels for [verified dimensions/materials/
compatibility/contents]. Keep labels readable and tied to visible product features.
Avoid rankings, deals, warranties, certifications, medical claims, and unsupported copy.
```

### Detail

```text
Show a close view of [verified feature]. Preserve its real construction, texture,
color, and scale. Do not hide defects or invent internal structure.
```

## Validation after generation or editing

Inspect the final artifact at original resolution:

- compare product identity, geometry, color, quantity, and included contents with sources;
- compare labels, logos, and printed text pixel-for-pixel where accuracy matters;
- verify dimensions, format, and color mode from file metadata;
- sample open-background pixels for a main image instead of judging white by eye;
- inspect edges, reflections, shadows, repeated textures, hands, and small hardware for generation artifacts;
- verify the product bounds and frame fill; and
- reapply the relevant policy, special-case, or fashion requirements.

Use deterministic image processing when an exact measurable correction—such as background normalization, sizing, or color-profile conversion—is required. Reinspect after processing.

## Audit reporting

Use the response contract in `SKILL.md`. For each finding, record:

- requirement class: current, general, category-specific, archived, or recommendation;
- evidence inspected;
- result: pass, fail, or unverified; and
- exact remediation when failed.

An image-only review cannot verify hidden file metadata, delivered contents, listing identity, category eligibility, or live Amazon acceptance unless those inputs are also available.

## Mutation boundary

Generating or editing the requested artifact does not authorize uploading it, replacing a live listing image, or changing listing data. Obtain explicit approval immediately before any live Amazon mutation and report the resulting status separately from the local image audit.
