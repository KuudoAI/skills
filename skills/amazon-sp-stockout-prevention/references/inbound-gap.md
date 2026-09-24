# Inbound gap: will stock land before the SKU runs out?

Inventory already tells you **how many** units are on the way for each SKU
(`inboundShippedQuantity`, `inboundReceivingQuantity`). This file covers
**when** they arrive. Run it only for OUT_OF_STOCK, CRITICAL, and WARNING SKUs
that have shipped or receiving units.

## Finding the shipments that hold a SKU

`listInboundPlans` returns plan summaries only: no SKUs and no dates. A real
account can hold hundreds of stale ACTIVE drafts, so narrow the search:

1. **List plans.** Call `fba-inbound_listInboundPlans` with
   `{"status": "ACTIVE", "sortBy": "LAST_UPDATED_TIME", "sortOrder": "DESC",
   "pageSize": 30}`. To page, pass the response's `pagination.nextToken` as
   the request's **`paginationToken`**.
2. **Find plans that hold the SKU.** The cheapest way is
   `listInboundPlanItems(inboundPlanId)`, one call per plan: match on `msku`,
   then open only the matching plans with `getInboundPlan`. Cover plans
   updated in the last 90 days, 45 or fewer calls per `execute`. Skip this
   entirely if inventory shows no inbound units.
   - A 400 saying "not supported for Amazon Warehousing and Distribution"
     means an AWD plan. Skip it.
   - Keep shipments whose status is `READY_TO_SHIP`, `SHIPPED`, `IN_TRANSIT`,
     `DELIVERED`, `CHECKED_IN`, or `RECEIVING`.
3. **Match the SKU.** For each kept shipment, call
   `listShipmentItems(inboundPlanId, shipmentId)` and match on `msku`.
   Record the quantity.
4. **Find the arrival date.** `getShipment(inboundPlanId, shipmentId)`
   provides it:
   - `selectedDeliveryWindow.startDate` / `endDate` is the confirmed arrival
     window. Own-carrier shipments always have one.
   - `status`: `RECEIVING` means the units are at the FC but not sellable
     yet, which usually means days, not weeks.
   - If there's no window, say the arrival date is unknown. Don't estimate
     one.

Summarize inside the sandbox: SKU, shipment name or FBA ID, units, status, and
window. Don't return raw items.

## Computing the gap

```
stockout_date   = snapshot_date + days_of_cover          (Amazon's DOS, else the estimate)
arrival_start   = earliest selectedDeliveryWindow.startDate among its shipments
gap_days        = arrival_start - stockout_date
```

- **`gap_days > 0`:** the SKU runs out about `gap_days` before stock lands.
  Say so plainly, with dates.
- **`gap_days <= 0`:** stock should land in time. Say so; it isn't a risk.
- **Several shipments:** use the earliest window, and note whether that
  shipment alone covers demand until the next one lands.
- **`READY_TO_SHIP`:** the shipment hasn't left. Its window is a plan, not a
  promise. Flag it: "not yet shipped; the window assumes it leaves on time".

## Edge cases

- **OUT_OF_STOCK SKUs:** the stockout is now. The gap is simply the days
  until `arrival_start`.
- **Inbound units but no matching shipment in the 90-day window:** say that
  some inbound units couldn't be traced to a dated shipment, and offer to
  look further back.
- **Send to Amazon plans:** they're readable once placement and
  transportation are confirmed. Earlier drafts are invisible to the API.
- **Changing shipments:** creating a shipment, moving a delivery window, or
  adding units is outside this skill. Hand off to `amazon-sp-fba-inbound`.
