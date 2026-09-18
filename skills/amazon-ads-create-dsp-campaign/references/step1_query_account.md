# Step 1: Query Advertiser Account

**Tool:** `allv1_QueryAdvertiserAccount`

The purpose of this step is to resolve the **DSP advertiser ID** (a numeric ID like `580455376359067392`) for the user's account. That ID becomes the value of `Amazon-Ads-AccountId` on every subsequent v1 tool call in this workflow, so it has to be right — passing the wrong one will produce confusing `UNAUTHORIZED` errors later that look like a token problem but are actually a scoping problem.

## Request

```json
{
  "isGlobalAccountFilter": {
    "include": [false]
  }
}
```

Pass `isGlobalAccountFilter.include = [false]` to get non-global advertiser accounts only. Global accounts (account IDs starting with `amzn1.ads-account.g.`) are the umbrella structure, not the per-marketplace DSP advertiser; the DSP ID lives on the non-global child.

This op does **not** require `Amazon-Ads-AccountId` — the active profile (set via `set_active_profile`) is sufficient scoping for the account query itself.

## Response → extract

From `advertiserAccounts[]`:
- `alternateIds[].dspAdvertiserId` — this is what you pass as `Amazon-Ads-AccountId` on every subsequent DSP-scoped tool call.
- `alternateIds[].region` — used to disambiguate when multiple accounts come back.

### When multiple accounts are returned

Select the one whose region matches the user's marketplace:

| Marketplace codes | Region |
|---|---|
| US, CA, MX, BR | `NA` |
| UK, DE, FR, ES, IT, NL, SE, TR, AE, SA, IN | `EU` |
| JP, AU | `FE` |

If exactly one non-global account is returned, use it without prompting. If none have a `dspAdvertiserId` in `alternateIds`, the account isn't DSP-enrolled — stop and tell the user.

## Sample response (non-global)

```json
{
  "advertiserAccounts": [
    {
      "advertiserAccountId": "amzn1.ads1.aa1.us.ENTITY...",
      "alternateIds": [
        {
          "dspAdvertiserId": "580455376359067392",
          "region": "NA"
        }
      ],
      "displayName": "Acme Co — US",
      "isGlobalAccount": false
    }
  ]
}
```

On failure: stop and report the error. If the response is empty, surface that the active profile may not have a DSP-enrolled account associated with it and suggest verifying with `get_active_profile`.
