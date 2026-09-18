# Request and delivery workflow

Use this reference after selecting a catalog template or validating an ad-hoc field list.

## 1. Resolve scope

Unified/v1 reporting addresses an Amazon Ads advertiser account with an `amzn1.ads-account.g.*` identifier. Numeric profile IDs identify marketplace profiles used by other endpoint families and cannot be substituted into a unified/v1 request.

If the user supplies only a profile ID, use `amazon-ads-accounts` or the available account-discovery API to resolve and confirm the related advertiser account and marketplace. If more than one account or marketplace matches, show the candidates and ask rather than choosing silently.

Record the resolved advertiser account, marketplace/region, requested time zone, and reporting currency when available. Do not embed credentials, internal identity IDs, or customer names in reusable examples.

## 2. Materialize the request

Every bundled request body has this shape:

```json
{
  "accessRequestedAccounts": [
    {"advertiserAccountId": "amzn1.ads-account.g.REPLACE_ME"}
  ],
  "reports": [{
    "format": "GZIP_JSON",
    "periods": [{
      "datePeriod": {
        "startDate": "START_DATE",
        "endDate": "END_DATE"
      }
    }],
    "query": {
      "fields": ["date.value", "campaign.id", "metric.impressions"],
      "filter": {"on": {
        "comparisonOperator": "EQUALS",
        "field": "adProduct.value",
        "not": false,
        "values": ["SPONSORED_PRODUCTS"]
      }}
    }
  }]
}
```

Replace the account and date placeholders in every request. For an optional prior-year report, derive its dates from the confirmed primary period and replace `PRIOR_YEAR_START_DATE` and `PRIOR_YEAR_END_DATE` consistently. Confirm how leap day should map before generating a year-over-year comparison that crosses February 29.

The directly submittable request contains only `accessRequestedAccounts` and `reports` at the top level. Each report contains `format`, `periods`, and `query`. Documentation-only `_comment` keys may exist on wrapper files; omit them from submitted bodies.

## 3. Preserve or validate fields

An unmodified bundled template has a package-tested request shape and field set. If the user adds, removes, or supplies fields, validate the complete proposed list against the current reporting-field catalog before submission. Resolve unknown fields, missing required dimensions, and incompatible pairs; then validate again.

Every ad-hoc list needs:

- exactly one supported time dimension;
- at least one level-of-detail dimension;
- at least one metric;
- the required currency dimension when monetary metrics need it.

Compatibility can force multiple reports. Keep each request internally compatible and state the client-side join keys and cardinality. Avoid promising a lossless join when one report has coarser grain.

## 4. Handle wrapper templates

The SP Campaign, SP Targeting, and SB Keyword wrapper files contain named CreateReport bodies beside a top-level `_comment`. The wrapper itself is not an API request. Extract and submit each named body independently:

- SP Campaign year-over-year: current-period and prior-year requests; align dates and join on campaign identity plus the shifted reporting date.
- SP Targeting top-of-search: targeting-grain main request plus campaign-grain impression-share request; join on reporting date and campaign ID.
- SB Keyword top-of-search: keyword-grain main request plus campaign-grain impression-share request; join on reporting date and campaign ID.

Return separate JSON blocks when the user needs copy-pasteable requests.

## 5. Submit safely

Use the deployment’s current tool schema. Capability names differ across MCP servers and SDKs, so discover the account-query, field-validation, CreateReport, RetrieveReport, and download operations at runtime rather than assuming a particular wrapper or meta-tool.

Creating a report job changes external state. Before submission, bind the action to the confirmed advertiser account, marketplace, period, field list, filters, and number of requests. If any of these changed since the user approved the request, show the new request and obtain approval again.

Record every returned report ID with the request it represents. If a multi-report submission partially fails, preserve successful IDs, report the failed request separately, and retry only that request after correcting the cause.

## 6. Retrieve and download

Treat reporting as asynchronous. Read the integration’s documented terminal and non-terminal statuses; do not assume a fixed completion time. Poll using bounded backoff, a background task, or the host’s wait facility. Stop at the configured timeout or user deadline and return the report ID so retrieval can resume later.

For a completed report:

1. Inspect every completed part, not only index zero.
2. Download with the authenticated or signed URL provided by the API.
3. Decode according to the declared format and content encoding.
4. Preserve the raw result when the user asks for an auditable artifact.
5. Treat `[]` as a valid empty result; distinguish it from failed retrieval or parsing.

Signed URLs may expire. Obtain a fresh URL through the retrieval operation when needed instead of assuming a fixed lifetime. Keep access tokens and signed URLs out of logs and reusable artifacts.

## 7. Report the outcome

State the lifecycle stage reached: generated, submitted, processing, completed, downloaded, failed, or timed out. Include report IDs for live jobs, the resolved account scope, and the report-specific caveats from the linked mapping reference.
