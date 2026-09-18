---
name: amazon-ads-budget-pacing
description: Use when an Amazon Ads advertiser needs to pace sponsored-ads campaign budgets against a monthly spend plan, calculate or review a daily budget change set, reforecast remaining spend, or explain account-level pacing variance. Do not use for general performance reporting, campaign creation, or account selection without a pacing objective.
license: PolyForm-Shield-1.0.0 (see LICENSE.txt)
compatibility: Requires Python 3.10+. Offline proposals use bundled JSON inputs; live reads and writes require an Amazon Ads integration. Optional warehouse and sandbox runners may supply actuals or scheduled execution.
metadata:
  version: "0.2.1"
---

# Amazon Ads Budget Pacing

Produce reproducible daily Sponsored Ads budget proposals that track an approved
monthly spend plan. The bundled allocator owns the arithmetic; the agent owns
account resolution, input provenance, review, and explicitly authorized writes.

## Scope

Use this skill for campaign-level daily budgets classified as SP, SB, SBV, or
SD. Do not apply its formulas to Amazon DSP, lifetime budgets, portfolio budgets,
or campaigns whose budget type is not confirmed as daily monetary spend.

## Account-context recovery

If Amazon account scope, identifier type, marketplace mapping, or account relationships become unclear, consult `amazon-ads-accounts` when it is available. Resume this skill after resolving the ambiguity. If it is unavailable, use equivalent read-only discovery and ask the user when multiple valid choices remain. Never guess or interchange identifier types.

Never copy an account, profile, marketplace, currency, or timezone from an example.

## Safety Invariants

- Run `scripts/allocate.py`; do not calculate or adjust its dollar outputs by
  hand.
- Propose first. A live write requires approval of the displayed proposal.
- Approval is bound to the proposal ID, advertiser account, profile, marketplace,
  currency, run date, and displayed changes or actions.
- Re-read account context, campaign states, current budgets, Amazon overdelivery
  settings, and active budget rules immediately before writing. Abort on drift.
- Budget updates and campaign pauses are different mutations. Never represent a
  pause as a zero-dollar budget.
- Do not execute an approved proposal after its account-local `as_of` date.

## Workflow

### 1. Resolve account scope

Resolve the exact advertiser and marketplace profile required by the campaign
tools. If multiple choices remain, show their names, IDs, and marketplaces and
ask the user to choose. Record:

- `advertiser_account_id`
- `profile_id`
- `marketplace`
- `currency_code`
- IANA `timezone`

State this context in the proposal and again before any commit.

### 2. Collect live state and provenance

Read enabled campaigns, state, budget type, and current daily budget. Also read:

- the account's average-daily-budget overdelivery setting;
- every active schedule- or performance-based budget rule;
- month-to-date spend through the last completed account-local day;
- trailing spend and attributed sales for each campaign;
- day-of-week seasonality and time-in-budget data when configured.

The allocator blocks when active Amazon budget rules are present because their
cumulative increases are not modeled. Disable them with separate authorization,
or stop and explain the conflict.

Amazon attributed sales can remain incomplete after the spend date. End ROAS
lookback windows at least two completed days before `as_of`; record that cutoff
as `roas_data_through`. Mark preliminary spend explicitly rather than presenting
it as settled.

Record the source and retrieval time for current budgets and performance data.
Do not claim an MCP or warehouse source when the input came from a fixture,
upload, or manual entry.

### 3. Collect operator controls

Confirm these values for the selected account; never invent them:

- monthly plan and month-to-date actual spend;
- one exact target-ROAS rule per Ad Type × Strategy × Product Line;
- the confirmed portfolio name/ID → product-line mapping;
- product-line and strategy ceilings;
- per-campaign floor, change cap, seasonality toggle, exhaustion boost, and
  overdelivery reserve;
- run and collection cadence when scheduling is requested.

Missing or ambiguous configuration stops the run. A target rule from another
product line is not a fallback.

### 4. Assemble and validate the run bundle

Read [the run-input schema](references/run-input.schema.md), then map the sources
into one JSON object. Start from
[the synthetic sample](references/sample_run_input.json) only for shape; replace
every example value.

The allocator validates account context, provenance, month alignment, currency,
unique campaign IDs, non-negative finite numbers, exact target rules, ceilings,
actuals reconciliation, reporting maturity, overdelivery settings, and active
budget rules. Surface validation errors instead of weakening them.

### 5. Generate the proposal

```bash
python3 scripts/allocate.py run_input.json plan.json
```

`today_spend_target` is the unconstrained account pacing target. `todays_pool`
reserves the configured overdelivery headroom. `total_proposed` is the executable
sum after campaign floors, ceilings, and change caps. These values may differ;
surface the difference and its warnings.

When the monthly hard ceiling is reached, the plan contains
`proposed_actions[]` with `pause_campaign` actions. It does not emit zero-dollar
budget updates.

### 6. Render the report

```bash
python3 scripts/report.py plan.json out_dir/
```

The renderer creates `report.html` and `report.md`. Today's forward value uses
the constrained proposal; later values remain planning targets recalculated on
future runs. Preserve the Source, Confidence, Freshness, and Limitations footer
in any summary.

### 7. Review with the user

Show:

- proposal ID and full account context;
- monthly budget, actuals, freshness, pacing status, and overdelivery reserve;
- `today_spend_target`, `todays_pool`, and `total_proposed`;
- each current → proposed budget and each proposed state action;
- capped or constrained moves, unallocated pool, exclusions, and alerts;
- preliminary-data and forecast limitations.

Ask for approval of that specific proposal. An earlier request such as “just run
it” does not approve unseen values.

### 8. Commit an approved proposal

Before mutation, re-resolve the account and re-read the live state. Stop if the
profile, currency, campaign state, current budget, overdelivery setting, or
budget rules differ from the approved snapshot.

Discover the integration's current schemas at runtime:

- use the campaign budget-update operation for `proposed_changes[]`, passing the
  selected profile's currency;
- use the campaign state-update operation for `pause_campaign` actions;
- batch only when the tool documents atomic or per-item results.

Record proposal ID and per-campaign result. On partial failure, list succeeded,
failed, and unattempted operations; do not retry mutations without renewed
authorization after showing the resulting live state.

## Scheduling

A scheduler may gather data, run the allocator, and deliver proposals. It must
not turn scheduled proposals into live writes unless the user separately defines
and authorizes an unattended execution policy. Read
[integration guidance](references/integration.md) when connecting live sources or
schedulers.

## References

- [Run-input schema](references/run-input.schema.md) — required bundle fields and
  output contract.
- [Phase math](references/phase-math.md) — pacing, delivery reserve, and
  constraint behavior.
- [Integration guidance](references/integration.md) — live discovery, source
  ownership, and commit checks.
- [Decisions](references/DECISIONS.md) — maintained design decisions and
  limitations.

## Verification

After changing the allocator or renderer:

```bash
python3 -m pytest tests/ -q
```
