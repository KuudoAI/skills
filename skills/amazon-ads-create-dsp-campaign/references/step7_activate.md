# Step 7: Activate Campaign and Ad Groups

After the campaign and ad groups are created in `PAUSED` state and verified, activate them by updating `state` to `ENABLED`.

All calls in this step require `Amazon-Ads-AccountId = <dspAdvertiserId>` as a top-level tool argument (header parameter).

## Strict activation order — parent first

The campaign must be `ENABLED` before its ad groups are activated. Activating an ad group under a `PAUSED` campaign is technically allowed, but the ad group still won't deliver until the campaign is enabled — and a partially-activated state is harder to reason about for the user. Always: campaign first, then ad groups.

**Failure propagation rule:** if the campaign update fails, do **not** attempt to update its ad groups. Stop, report what was activated and what wasn't, and let the user decide whether to retry.

## Update sequence

### 1. Activate campaign — `allv1_UpdateCampaign`

```json
{
  "Amazon-Ads-AccountId": "<dspAdvertiserId>",
  "campaigns": [
    {
      "campaignId": "<campaignId>",
      "state": "ENABLED"
    }
  ]
}
```

### 2. Activate ad groups — `allv1_UpdateAdGroup` (one call per ad group)

```json
{
  "Amazon-Ads-AccountId": "<dspAdvertiserId>",
  "adGroups": [
    {
      "adGroupId": "<adGroupId>",
      "state": "ENABLED"
    }
  ]
}
```

Repeat for each `adGroupId` from Step 5.

## Why one ad group per call

`adGroups[]` accepts an array, so you *can* batch all activations in a single update. But:
- A single-batch failure aborts the whole batch — you lose the per-item attribution.
- Per-ad-group activation makes the summary cleaner: every line either succeeded or failed, individually.

For DSP P+/B+ workflows, the number of ad groups is usually small (one per `(inventoryType, tactic)` combo, often 3–6 total), so the overhead is negligible.

## Why no separate "activate ad" or "activate association" step

Ads are created in `state: "ENABLED"` in Step 6a. Associations are created in `state: "ENABLED"` in Step 6b. There's nothing further to activate — delivery is gated by the parent ad group's state, which Step 7 already handles.

## On failure

Report each step's result clearly:

```
- Campaign "X" — ACTIVATED ✓
- Ad Group "Y" (DISPLAY/REMARKETING) — ACTIVATED ✓
- Ad Group "Z" (DISPLAY/RETENTION) — FAILED (error: <code>)
```

If campaign activation failed, do **not** attempt ad group activation — the report should show "Skipped (parent failed)" for each ad group instead. This makes it obvious to the user what state the system was left in.
