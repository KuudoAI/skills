---
name: amazon-sp-fba-inbound
description: >-
  Create, run, and manage Amazon FBA inbound shipments with the SP-API
  Fulfillment Inbound v2024-03-20 workflow: build an inbound plan, pack, pick
  placement and carrier, confirm delivery windows, get labels, add tracking,
  check status, edit, or cancel. Pauses at every fee-charging or irreversible
  step for the seller's explicit choice and confirms each async operation
  before moving on. Use whenever a seller wants to send or ship inventory to
  Amazon or FBA, create or check an inbound plan or shipment, compare
  placement fees or partnered-carrier quotes, get FNSKU, box, or pallet
  labels or a bill of lading, set prep or label owners, enter tracking or PRO
  numbers, book an FC drop-off appointment, or cancel a shipment, even if
  they only say "send stock to Amazon". Do not use for replenishment
  forecasting or stockout risk, FBA inventory health, outbound or
  multi-channel orders, AWD, Vendor (1P) shipments, listings, or advertising.
license: PolyForm-Shield-1.0.0 (see LICENSE.txt)
compatibility: Requires an SP-API MCP server exposing Fulfillment Inbound v2024-03-20 operations, plus the v0 getLabels and getBillOfLading operations for shipment labels. On the KuudoAI Amazon SP MCP, enable the fulfillment-inbound and fulfillment-inbound-v0 packages. Without a server the skill can only explain the process.
metadata:
  version: "0.1.0"
---

# Amazon FBA inbound

Sending inventory to FBA is a pipeline of asynchronous API writes, several of
which spend the seller's money or cannot be undone. The job is to move the
seller through it quickly without ever committing something they did not
choose. So:

- Do the plumbing yourself: discover tools, poll operations, page through
  lists, and turn raw responses into short summaries.
- Stop at each decision and show the choice with its real cost.

Scope: Seller (3P) accounts on the Fulfillment Inbound API v2024-03-20.
Plans created in Send to Amazon become readable through the API once their
placement and transportation are confirmed. Vendors (1P) ship through a
different API.

## 1. Connect to the tools

This skill names operations by their Amazon `operationId`, for example
`createInboundPlan`. The MCP server exposes each operation under its own tool
name. Resolve the name once per session and reuse it:

- **KuudoAI Amazon SP MCP.** The top-level tools are `search`,
  `get_schema`, and `execute`.
  - Run `search` with the operationId.
  - Inbound tools are named `fba-inbound_<operationId>`, for example
    `fba-inbound_createInboundPlan`. The v0 label and bill-of-lading tools
    are `fulfillment-inbound-v0_getLabels` and
    `fulfillment-inbound-v0_getBillOfLading`.
  - Call them inside `execute` with `await call_tool(name, params)`. Body
    fields are top-level arguments.
  - Names must match exactly. There is no fuzzy matching.
- **Other servers** use other prefixes; Amazon's hosted server, for example,
  uses `fbaInbound_*`. Use whatever that server's discovery returns.

Read the schema for each write tool before its first call. Use
`get_schema(tools=[…], detail="full")`: the default detail hides nested body
fields. One call can take every tool for the stage ahead. The schema is the
authority. [references/tool-access.md](references/tool-access.md) has the
KuudoAI server specifics:

- batching and summarizing inside `execute`
- error strings
- identity and region
- 403 and AWD cases

**If search finds no inbound tools** for the operationId or for
`fba inbound`, the package is not loaded; stop there. Tell the user to enable
`fulfillment-inbound` (and `fulfillment-inbound-v0` for labels and bills of
lading) in the server's package setting (`SP_API_PACKAGES` or
`AMAZON_SP_PACKAGES`), then restart the server. Do not substitute other tools
and do not invent results.

**Account context. Nothing works until an identity is selected.**

1. Call `list_identities` (no arguments). It returns
   `{"result": [{id, label, …}]}`, where `label` is the merchant ID. Filter
   by label **inside** `execute` and return only the match. Agency tokens
   list 150+ sellers; don't pull the whole list into context.
2. Agency tokens can see many sellers. If the token has exactly one
   identity, use it and say which one. Otherwise, if the user hasn't said
   which seller, give counts by country (never the list) and ask for the
   merchant ID or store name. Never pick for them, and never
   answer with whatever seller happens to be active. If one merchant ID
   maps to several regions, ask which marketplace.
3. **Call `set_active_identity` at the top of every `execute` block that
   touches seller data.** On the live server the selection is shared across
   MCP sessions, not isolated. Another session can change it, and a session
   that never selected anyone can silently get another seller's data.
   Re-selecting in the same block keeps each call pinned to the right
   seller.
4. A 403 `Unauthorized` means the seller's app authorization is inactive or
   lacks the Amazon Fulfillment role. Don't retry. Tell the seller to
   re-authorize in Seller Central (Manage Your Apps) or reconnect through
   the provider.

- Don't pass `entityId` or merchant IDs in operation params. They aren't in
  the schema; the server may silently ignore them, so they prove nothing.
- Marketplace IDs are never injected for you. Pass them only where an
  operation asks for one: `createInboundPlan`, prep, compliance, and item
  labels.
- The marketplace must sit in the active region. Check with
  `get_active_region` and `list_marketplaces`. India (`A21TJRUUN4KGV`) is
  `eu`.
- `listInboundPlans` also returns **AWD** plans. `getInboundPlan` rejects
  those with a 400 ("not supported for Amazon Warehousing and
  Distribution"). Label them AWD and leave them out; this skill doesn't
  manage AWD.

## 2. Async operations: write, check, continue

Most writes return an `operationId`. The exceptions are renames, item
labels, and self-ship slot booking; the full list is in
[operations-and-limits.md](references/operations-and-limits.md). Nothing has
happened until `getInboundOperationStatus` says `SUCCESS`.

- **Chain in one `execute`.** Put the write, one status check, and the
  follow-up reads (if it already succeeded) in a single block. Return a
  compact summary, not raw JSON. Most generate calls finish within seconds,
  so this usually saves a full round trip per stage.
- **`IN_PROGRESS`:** check again in a later call, with a real pause between
  checks when the host allows one (about 10s, then 20s, then 40s). The
  sandbox cannot sleep, so do not loop inside it; burning the rate limit
  (2 requests/second) gains nothing.
- **Stop after about five checks.** Placement and transportation generation
  can take a few minutes. Give the seller the `operationId` and offer to
  check back.
- **`FAILED`:** read `operationProblems[]` (`code`, `message`, `severity`).
  Report the ERROR entries plainly, fix the input, and do not advance. Mention
  WARNING entries, but they do not block.
- Tell the seller what is happening in one line ("Placement options
  generated. 2 to compare."), not a narration of every poll.

## 3. The pipeline (pack first, the common case)

Detect the variant before step 1:

- The seller doesn't know box contents yet: **Pack Later** (pallets only).
- The destination is India: the **India** flow.

Both change the order. See
[references/special-workflows.md](references/special-workflows.md).

Exact request bodies for every write are in
[references/request-shapes.md](references/request-shapes.md). Nested keys are
case-sensitive, so copy them.

1. **Create the plan.** Collect everything in one ask:
   - ship-from address, including the contact `name` and `phoneNumber` (both
     required)
   - destination marketplace
   - each item's `msku`, `quantity`, `prepOwner`, and `labelOwner`
   - expiration dates if the items have them

   Amazon's own prep and labeling ended in the US on 2026-01-01, so US items
   are `SELLER` or `NONE`, never `AMAZON`. Unsure which? `listPrepDetails`
   returns each MSKU's owner constraints.

   Call `createInboundPlan`. Keep `inboundPlanId` (38 characters).

   If an item is new to FBA, or the plan fails on an item, check it with
   `getItemEligibilityPreview(asin, program="INBOUND",
   marketplaceIds=[…])`. On the KuudoAI server that tool is
   `fba-inbound-eligibility_getItemEligibilityPreview`. It takes an ASIN,
   not an MSKU.
2. **Packing options.** `generatePackingOptions`, then `listPackingOptions`
   and `listPackingGroupItems` for each group.
   - **One option with no fees:** there is nothing to choose, so confirm it
     and tell the seller you did.
   - **Several options, or any fee:** show the groups and the fees, ask which
     one, then confirm.

   Call `confirmPackingOption` before the option's `expiration`.
3. **Box contents.** For each confirmed `packingGroupId`, collect the boxes:
   dimensions, weight, items per box, and a quantity of identical boxes. Call
   `setPackingInformation`. Pack-first uses `BOX_CONTENT_PROVIDED`.
   - Box data cannot be discarded later without a new plan.
   - Changing boxes after placement is generated means regenerating
     placement.
4. **Placement and transport quotes (read-only so far).**
   - Run `generatePlacementOptions`, then `listPlacementOptions`.
   - For the option or options the seller is considering, run
     `generateTransportationOptions` with a candidate `placementOptionId`,
     then `listTransportationOptions`. **Read every page.**
   - Transportation needs the seller's ready-to-ship date. It needs contact
     info for partnered LTL, and pallets and freight info for any pallet
     quote. Without pallets, no LTL options come back.
   - A date with no time becomes `YYYY-MM-DDT00:00Z`. Say so in the reply.
   - Amazon's documented flow quotes transportation *before* placement is
     confirmed. This lets the seller see the total landed cost before
     committing to anything.
   - **No ready-to-ship date yet?** Don't hold the placement comparison
     hostage. Show the placement options now and ask for the date in the
     same message. Offer both next steps: quotes first, or confirm placement
     alone.
   - **"Cheapest"** means the lowest net placement fee until you have
     transport quotes; then it means the lowest placement fee plus transport.
     Say which one you used. More shipments usually means more freight.
5. **Decide. This is the hard gate** (section 4). Present each placement
   option:
   - FC split: `getShipment` for each shipment shows the destination.
   - Net placement fee: `fees[]` minus `discounts[]`, in the returned
     currency code.
   - The carrier quotes per shipment:
     - `shippingMode`
     - `shippingSolution` (partnered or your own carrier)
     - `quote.cost`
     - whether `preconditions` lists `CONFIRMED_DELIVERY_WINDOW`

   Also show each option's `expiration`. Then run the commits in this order:
   1. `confirmPlacementOption`.
   2. If any chosen transportation option has the delivery-window
      precondition (always true for your own carrier): run
      `generateDeliveryWindowOptions`, then `listDeliveryWindowOptions`. The
      seller picks a window per shipment. Then run
      `confirmDeliveryWindowOptions`. Delivery windows can only be generated
      *after* placement is confirmed. So in this case the hard gate splits
      in two: `CONFIRM` placement, show the windows, then `CONFIRM`
      transportation.
   3. `confirmTransportationOptions`, with one selection per shipment.

   With a partnered carrier and no precondition, one itemized `CONFIRM` can
   cover placement and transport together.
6. **After confirmation.** `getShipment` gives the `shipmentConfirmationId`
   (FBA…), `amazonReferenceId`, and `selectedTransportationOptionId`. That
   option's `quote.voidableUntil` (from `listTransportationOptions`) is the
   free-cancellation deadline. Then:
   - Box labels: v0 `getLabels`, keyed by the `shipmentConfirmationId`.
   - Partnered pallet shipments: `getBillOfLading`. Partnered small parcel:
     the seller schedules the UPS pickup.
   - Your own carrier: collect tracking and call
     `updateShipmentTrackingDetails`.
   - Carrier specifics are in
     [references/carriers-and-shipping.md](references/carriers-and-shipping.md).
7. **Summarize.** Give:
   - plan and shipment IDs
   - destinations
   - carrier and cost committed
   - the free-cancellation deadline (`voidableUntil`)
   - the one next action the seller owns

For a status question, answer with the fewest reads, and summarize inside
`execute`.

| Question | Read |
|---|---|
| "What plans do I have / what's in progress?" | `listInboundPlans` with `status=ACTIVE`, `sortBy=LAST_UPDATED_TIME`, `sortOrder=DESC`, paged, de-duplicated by ID (see the note below) |
| "What's in plan X / which shipments?" | `getInboundPlan` (shipments plus packing and placement option statuses) |
| "Where is shipment X?" | `getShipment`: `destination.warehouseId`, `status`, `shipmentConfirmationId` |
| "What carrier?" | `getShipment.selectedTransportationOptionId`, matched in `listTransportationOptions(shipmentId=…)` |
| "When must it arrive?" | `getShipment.selectedDeliveryWindow` (`startDate`, `endDate`, `editableUntil`). `dates` is often empty |
| "Is tracking in?" | `getShipment.trackingDetails`, which is **always present, even when empty**. Tracking exists only if `spdTrackingDetail.spdTrackingItems` is non-empty or `ltlTrackingDetail.freightBillNumber` has a value. Never test the object itself for truthiness |
| "What's in it?" | `listShipmentItems`; `listShipmentBoxes` (can be hundreds, so return counts) |

**About the plan list.** On a real account, the ACTIVE list is mostly stale
drafts; one test account had 183 going back to 2023. It also includes AWD
plans. Page through it until `nextToken` is empty, and count unique
`inboundPlanId`s; paging can repeat rows.

1. Count the full list, and return only a summary from the sandbox. State
   the total as a bare number, for example "187 ACTIVE plans". Don't add a
   guess about what they are. The
   raw list overflows the roughly 30 KB output limit.
2. Open plans with `getInboundPlan` in `lastUpdatedAt` order, **not
   `createdAt`**. A plan created months ago can still hold a live shipment,
   and live shipments keep updating. Open every plan updated in the last 60
   days, 45 or fewer per `execute` (the per-block limit is 50 calls). Sort
   each into one bucket:
   - **draft:** no shipments.
   - **awaiting a decision:** a placement option is `OFFERED` and not yet
     past its `expiration`.
   - **stalled:** every `OFFERED` option has expired. Continuing means
     regenerating options.

   `getInboundPlan` lists placement options without their `expiration`.
   For plans with an `OFFERED` option, call `listPlacementOptions` to see
   whether they have expired.
   - **in flight:** a shipment is `READY_TO_SHIP`, `SHIPPED`, `IN_TRANSIT`,
     `DELIVERED`, `CHECKED_IN`, or `RECEIVING`.
   - **done:** every shipment is `CLOSED`.
   - **AWD:** a 400 "not supported for Amazon Warehousing and
     Distribution".
3. Say how many older plans you didn't open, and state the cutoff date.
   A plan's `lastUpdatedAt` doesn't always move with shipment activity, so
   an old plan can still hold a live shipment. If completeness matters,
   offer to open the rest. Don't characterize plans you didn't open, for
   example as "mostly old drafts". Report only their count and date
   range.
   Never present a partial count as the total. Write "7 in flight among
   plans updated since Jul 26", not "you have 7 shipments".

"In progress" means in flight plus awaiting a decision.

For in-flight shipments in an overview, a `getShipment` fan-out (45 or
fewer per block) adds the FBA ID, the FC, and the delivery window. Give
carrier-specific next steps only after you've checked `shippingSolution`
on the selected transportation option.

**Next actions for a `READY_TO_SHIP` own-carrier shipment:**

- labels: v0 `getLabels` with the `shipmentConfirmationId`
- have the carrier book the FC delivery appointment inside the window,
  quoting `amazonReferenceId`
- after pickup, add the PRO number with `updateShipmentTrackingDetails`
  (a write)
- move the window before `editableUntil` if the date will slip

## 4. Decision gates

Match the gate to the blast radius. Nothing in this API has a dry run.

| Action | Why it matters | Gate |
|---|---|---|
| `confirmPlacementOption` | Permanent for the plan; charges the placement fee | **Hard** |
| `confirmTransportationOptions` | Locks carrier and quote; one confirmation per plan. Irreversible even at no charge (own carrier) | **Hard** |
| `cancelInboundPlan` | Voids every shipment; carrier charges after `voidableUntil`. The API cannot cancel a single shipment | **Hard** |
| `confirmShipmentContentUpdatePreview` | Accepts the changed transport cost | **Hard** |
| `confirmPackingOption`, `confirmDeliveryWindowOptions`, `scheduleSelfShipAppointment` | Shape the plan; no direct fee | Explicit choice. A single fee-free packing option needs no choice |
| Everything else (creates, sets, generates, reads) | Reversible or read-only | Proceed with the seller's given data |

**Hard gate:**

1. The seller explicitly picks.
2. Restate each irreversible call with its exact amount and currency, and say
   it is permanent or chargeable.
3. The seller types `CONFIRM`.

"Just go with the cheapest", "ok", or "yes" is a preference, not a
confirmation. Present the pick and ask for `CONFIRM`. The reason is that the
seller must see the number they are agreeing to at the moment they agree.

One `CONFIRM` may cover a package that you itemized in full, for example
placement at $X plus transport at $Y. Never let it cover anything you did not
list.

Before a cancel, run one read block:

1. `getInboundPlan` to list the shipments.
2. `getShipment` for each, to get its `selectedTransportationOptionId`.
3. `listTransportationOptions` filtered by `shipmentId`, to get that
   option's `quote.voidableUntil`.
4. `listPlacementOptions`, to show the placement fee already committed.
5. `listShipmentItems`, reduced to a count, so the seller can check it's the
   right plan.

Then say which shipments are inside or outside their free window, with each
carrier and cost. An own-carrier option has no `quote` and no carrier charge. Past the window, say charges *may* apply, up to the quote.
Amazon sets the final amount. Non-partnered carriers are never charged.

Do not promise that placement fees come back. Tell the seller to check
Seller Central for fees already assessed. Cancelling is plan-wide: the only
way to keep some shipments is not to cancel.

## 5. Guardrails

- **Never invent data.** Use only the addresses, dimensions, quantities, dates,
  and tracking numbers the seller gave you, and only options the API
  returned. If a required field is missing, ask for it. Batch the missing
  fields into one question.
- **Never auto-pick an option.** The one exception is a single fee-free
  packing option (step 2), and even then say you picked it.
- **Respect expirations.** Placement options, packing options, quotes,
  delivery windows, and content-update previews all expire. If one has
  expired, regenerate it; never confirm a stale ID.
- **Keep the IDs straight.** `shipmentId` (sh…) is the v2024 ID.
  `shipmentConfirmationId` (FBA…) is what v0 `getLabels` and
  `getBillOfLading` take. `inboundPlanId` is wf….
- **Protect the seller's contact data.** Keep contact names and phone numbers
  inside the API calls. Don't echo them back in summaries beyond what the
  seller needs to verify.

## References

- [tool-access.md](references/tool-access.md): KuudoAI SP MCP code mode,
  `execute` patterns, errors, identity and region, and label downloads.
- [request-shapes.md](references/request-shapes.md): exact bodies for every
  write.
- [carriers-and-shipping.md](references/carriers-and-shipping.md): partnered
  vs own carrier, shipping modes, mixing rules, delivery windows, tracking,
  and void windows.
- [special-workflows.md](references/special-workflows.md): Pack Later, India,
  self-ship appointments, and content updates after confirmation.
- [operations-and-limits.md](references/operations-and-limits.md): all 45
  operations, status values, limits, rate limits, and common errors.
