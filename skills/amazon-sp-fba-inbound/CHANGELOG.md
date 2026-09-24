# Changelog

All notable changes to this skill are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com). Versions are semver and must
match `metadata.version` in SKILL.md.

Bump rules:

- **patch:** non-behavioral changes (typos, formatting, reference-only
  edits).
- **minor:** behavioral additions (new sections, rules, triggers).
- **major:** contract changes (response shape, output format, scope).

Every bump also updates the `evals/evals.json` `skill_version`.

## [0.1.0] - 2026-09-24

### Added

- First KuudoAI release. Adapted from the Amazon Selling Partner
  `fba-inbound-management` skill (Apache-2.0) and substantially rewritten to
  work with the KuudoAI Amazon SP MCP. The rewrite was verified against the
  Fulfillment Inbound v2024-03-20 OpenAPI model and Amazon's use-case guides.

### Changed (compared with the upstream skill)

- **Tool resolution.** The skill now resolves tools by `operationId` through
  server discovery, instead of hard-coding the `fbaInbound_*` names. On the
  KuudoAI server the names are `fba-inbound_<operationId>` and
  `fulfillment-inbound-v0_<operationId>`.
- **No `entityId`.** The skill no longer asks for or passes `entityId`. The
  seller comes from the server's active identity, and the marketplace is
  passed only where an operation takes one.
- **Pack-first order.** Corrected to: generate and confirm the packing
  option, then `setPackingInformation(packingGroupId)`, then placement.
- **Transport quotes before placement.** Transportation is quoted for a
  candidate placement *before* placement is confirmed, following Amazon's
  documented flow. The seller sees the placement fee and the carrier quote
  together.
- **Transportation inputs.** Corrected to `readyToShipWindow.start`, plus
  contact, pallets, and freight info where needed. There is no ship-from
  field.
- **Delivery windows.** The decision now keys off each option's
  `preconditions` (`CONFIRMED_DELIVERY_WINDOW`) rather than a program
  enrollment.
- **Fees.** Now net `fees[]` minus `discounts[]`, in the returned currency,
  instead of "dollars".
- **Void windows.** Now read from `quote.voidableUntil` instead of hard-coded
  hours.
- **Pack Later.** Corrected to `setPackingInformation(shipmentId)` after
  placement, with any content source (`MANUAL_PROCESS` carries a fee).
- **Self-ship appointments.** Documented beyond India (MX, BR, EG, SA, AE).
- **Polling.** Now sized for code mode: chain the write, one status check,
  and the follow-up reads in one `execute` block. Re-check across calls, cap
  at about five checks, and read `operationProblems[]`.

### Removed

- The non-existent `updateBoxIdentifiers` operation.
- The 500K-units-per-SKU limit. The real limits are 1,500 SKUs and 10,000
  units per SKU per plan.
- The claim that `setPrepDetails` sets owners. It sets prep category and
  types.
- Non-spec frontmatter: the top-level `version` key and list-valued
  `metadata`.

### Validated live

- Validated read-only against the running KuudoAI Amazon SP MCP (4.0.3).
  Server specifics now match that server: three meta-tools with no `tags`;
  a required `set_active_identity`; plain-string errors; `entityId` silently
  ignored; 403 when a seller lacks inbound access; AWD plans in
  `listInboundPlans`; `get_schema` needs `detail="full"`.

### Also added

- Request shapes for every write.
- A KuudoAI server access guide.
- `getBillOfLading` for partnered pallet shipments.
- Status enums and rate limits.
- Content-update limits.
