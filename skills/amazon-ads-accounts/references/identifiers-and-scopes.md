# Identifiers and scopes

## Account model

An advertiser account is the unified advertiser identity across sponsored ads, Amazon DSP, and supported regions. Its `alternateIds` connect that global identity to marketplace profiles and other platform-specific identifiers. A profile is a marketplace-specific compatibility scope used by APIs that still request `profileId`.

| Identifier | Shape | Use |
|---|---|---|
| `advertiserAccountId` | `amzn1.ads-account.g.*` for global accounts; regional segment for legacy accounts, such as `amzn1.ads1.aa1.us.*` | Advertiser-account APIs and account-level access |
| `profileId` | Numeric | Marketplace-specific alternate scope when explicitly requested by a campaign, eligibility, or reporting tool |
| `entityId` | Often `ENTITY...` | Alternate or legacy reference; never substitute it for an advertiser account ID |
| `dspAdvertiserId` | Returned in `alternateIds` when applicable | DSP operations that explicitly request this identifier |
| `countryCode` | Two-letter country code in `alternateIds` | Selects the marketplace-specific profile |

A `profileId` is globally unique, but it represents one advertiser in one marketplace. A multi-marketplace advertiser therefore has multiple profile IDs.

The advertiser account is the primary account concept. Start with it, then translate to a profile or alternate identifier only when the downstream tool's contract requires one.

## Discover advertiser accounts

Use `allv1_QueryAdvertiserAccount` for advertiser-account discovery. It returns `advertiserAccounts[]`, and each row has `advertiserAccountId`, `displayName`, `isGlobalAccount`, `status`, and `alternateIds`.

- With no `isGlobalAccountFilter`, it returns global accounts by default, so a non-global account never appears unless you ask for it.
- `isGlobalAccountFilter: { "include": [true] }` explicitly requests global accounts.
- `isGlobalAccountFilter: { "include": [false] }` requests non-global legacy or regional accounts.
- `advertiserAccountIdFilter.include` accepts global `amzn1.ads-account.g.*` IDs only. Any other ID returns a 400, which says nothing about whether the account exists.
- `nextToken` appears on some responses and not others, and row order changes between calls. Follow it until it is absent, and dedupe by `advertiserAccountId` before counting.
- There is no server-side account-name filter; match names client-side after listing.

To show all account types, list global and non-global accounts, then label the combined results:

```python
async def list_accounts(filters):
    accounts, token = {}, None
    while True:
        page = await call_tool("allv1_QueryAdvertiserAccount",
                               {"maxResults": 100, **filters, **({"nextToken": token} if token else {})})
        for account in page["advertiserAccounts"]:
            accounts[account["advertiserAccountId"]] = account
        token = page.get("nextToken")
        if not token:
            return list(accounts.values())

global_accounts = await list_accounts({})
non_global_accounts = await list_accounts({"isGlobalAccountFilter": {"include": [False]}})
return {"global": global_accounts, "non_global": non_global_accounts}
```

## Read `alternateIds`

| Entry | Keys | Meaning |
|---|---|---|
| Marketplace | `countryCode`, `entityId`, `profileId` | The profile for that marketplace |
| DSP | `dspAdvertiserId`, `region` | A DSP advertiser; there is no profile here |
| Non-global | `countryCode`, `dspAdvertiserId`, `region` | A regional account's DSP identifier; there is no profile here |

An account can have no marketplace entries at all, such as a DSP-only account or a non-global account. Say that no profile is listed. A `dspAdvertiserId` or `entityId` is not a stand-in for one.

## Select the correct scope

### Starting from an account name

1. Query global advertiser accounts and paginate.
2. If the account is absent, query non-global accounts and paginate.
3. Present multiple plausible matches rather than choosing by fuzzy name similarity.
4. Retain the selected account for the current session.

Say an account was not found only after both lists are exhausted, and say which lists you searched.

### Starting from a global advertiser account ID

Query with `advertiserAccountIdFilter.include`, then use the returned account. This filter cannot resolve a non-global ID.

### Starting from a non-global advertiser account ID

Query non-global accounts without `advertiserAccountIdFilter`, paginate, and match the returned ID client-side.

### Resolving a profile ID

1. Resolve the advertiser account.
2. Inspect its `alternateIds` entries.
3. Select the entry matching the requested `countryCode`.
4. If the marketplace is not known and several entries exist, ask the user to choose.
5. Use the selected entry's numeric `profileId` only where the downstream tool requests profile scope.

The account query already returns `alternateIds`; a second lookup is unnecessary when the desired entry is present.

### Starting from a profile or entity ID

1. List global and non-global accounts, and find the `alternateIds` entry holding the ID. Compare as strings.
2. Return that row's `advertiserAccountId`, its name, and the entry's `countryCode`.
3. If no account holds the ID, say so and do not offer another ID as its account.

`ac_getProfileById` can describe a profile, but only in the connection's region. A profile from another region returns a 404, even when an account's `alternateIds` lists it. A profile can also belong to no advertiser account, such as one whose `accountInfo.type` is `agency`, and `accountInfo.id` is not an `advertiserAccountId`.

## When a profile looks missing

`ac_listProfiles` covers only the connection's region, while `alternateIds` can list other regions, such as a GB profile on a North America connection. Check the account's `alternateIds` before concluding anything.

- **The entry exists:** give the profile ID, explain that the profile list is regional, and warn that using it may need a connection for that region. `list_identities` shows which connections are available.
- **No entry exists:** say the account has no profile for that marketplace and name the marketplaces it does have. Offer no stand-in ID. Suggest confirming that the account is registered in that marketplace and that the user has access to it.

## Presenting choices

Show enough information to distinguish accounts without exposing unrelated details:

- Display name
- Advertiser account ID
- Global or non-global status
- Available marketplace country codes
- Profile ID only when it helps make the requested selection

If exactly one account or marketplace profile is valid, select it and tell the user what will be used. If multiple remain valid, ask the user to choose.

## Authoritative reference

- [Amazon Ads advertiser account guide](https://advertising.amazon.com/en-gb/library/guides/advertiser-account)
