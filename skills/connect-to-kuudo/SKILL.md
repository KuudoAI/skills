---
name: connect-to-kuudo
description: Use when an AI agent needs to connect to a human's Kuudo account before calling any Kuudo capability — registering a delegated Agent Auth connection, presenting the human's approval link, and reading account/organization data once approved. Covers the connect/approve/execute flow, approval timeouts and expiry, and the one-installation-per-human rule. Do not use to design or modify the Agent Auth protocol itself, to request capabilities beyond read_account and read_organization, or to approve, deny, or sign in on the human's behalf.
license: PolyForm-Shield-1.0.0 (see LICENSE.txt)
compatibility: Requires running `npx @auth/agent-cli@0.5.1` (Node.js and outbound network access) and a way to show the human a link — an auto-opened browser or a link printed for them to open themselves.
metadata:
  version: "0.1.0"
---

# Connect to Kuudo

## Overview

Kuudo authenticates AI agents through Agent Auth's delegated mode: an agent registers, a human approves the connection from their browser, and the agent then acts as that human inside the one organization they approved. This skill covers connecting for the first time, presenting the approval link, and reading data once approved — not building an integration against the protocol itself.

The agent never creates a Kuudo account, signs in, or approves its own request, and never sees the human's password or the contents of their verification email. A human without a Kuudo account yet creates one from the approval link.

## Connect

Use `@auth/agent-cli`, pinned to `0.5.1`, against `https://app.kuudo.com`. Request exactly two capabilities: `read_account` and `read_organization`. Never request more.

### Preferred: MCP

If the agent's host (Claude Code, Cursor, Codex, etc.) supports MCP, add Kuudo as a server once:

```bash
claude mcp add kuudo -- npx @auth/agent-cli@0.5.1 mcp --url https://app.kuudo.com
```

```bash
codex mcp add kuudo -- npx @auth/agent-cli@0.5.1 mcp --url https://app.kuudo.com
```

Cursor has no add command; add the same server to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kuudo": {
      "command": "npx",
      "args": ["@auth/agent-cli@0.5.1", "mcp", "--url", "https://app.kuudo.com"]
    }
  }
}
```

Call the MCP server's `connect_agent` tool once — its input schema requires `provider`; everything else is optional but should still be set deliberately:

```json
{
  "provider": "https://app.kuudo.com",
  "capabilities": ["read_account", "read_organization"],
  "mode": "delegated",
  "name": "Claude Code – acme/ads-reporting",
  "reason": "Read the organization ID for the ads-reporting pipeline",
  "login_hint": "you@example.com"
}
```

Pass `mode: "delegated"` explicitly — never `"autonomous"` — even though Kuudo only offers delegated mode: omitting `mode` makes the tool return a mode-selection prompt instead of connecting when it can't assume a single mode. `name` (the tool and the project) and `reason` (what the connection is for, in plain language) appear on the approval page and later at `/developers/agent-connections` — they're the human's only way to recognize this connection, so make them specific. Only set `login_hint` to the human's email if the human has actually given it in this conversation; never guess or invent one. Never pass `force_approval: true` — see [One connection per human](#one-connection-per-human).

### Fallback: direct CLI

Without MCP, call `connect` directly:

```bash
npx @auth/agent-cli@0.5.1 connect \
  --provider https://app.kuudo.com \
  --url https://app.kuudo.com \
  --capabilities read_account read_organization \
  --mode delegated \
  --name "Claude Code – acme/ads-reporting" \
  --reason "Read the organization ID for the ads-reporting pipeline" \
  --login-hint you@example.com
```

`--login-hint` is optional and only a hint shown on the approval page — omit it if the human hasn't given an email. `--mode delegated` is the default; never pass `--mode autonomous`. Add `--no-browser` to print the link instead of opening it.

`--url` is a variadic top-level flag, not a `connect` option: it swallows every bare word after it until the next `--flag`. Always give it after the subcommand name, as in the command above — `auth-agent --url https://app.kuudo.com connect ...` swallows `connect` itself and breaks the command. If a wrapper needs `--url` before a subcommand, follow it immediately with another flag (e.g. `--host-name`) so it can't consume the subcommand word.

## Present the approval link

Registering returns an approval URL (and, for device authorization, a short user code) valid for **15 minutes**. Show it to the human exactly as returned — verbatim, not paraphrased, not shortened. Tell them:

- If they don't have a Kuudo account yet, the link lets them create one and verify their email first; they land back on the same approval request afterward.
- The link is only good for 15 minutes.

Then wait. Never open, follow, fill in, or approve the link yourself, and never ask the human for their password or the contents of their verification email — connecting only ever needs their approval, not their credentials.

## If the wait times out

`@auth/agent-cli@0.5.1` stops waiting after about 5 minutes (`approval_timeout`) even though the link is good for 15. A timeout is not the same as expiry, and neither is the same as denial — the human may still be signing up or about to approve. Before doing anything else, check status.

Over MCP, call `agent_status` with the `agent_id` `connect_agent` returned:

```json
{ "agent_id": "<agent-id>" }
```

With the CLI:

```bash
npx @auth/agent-cli@0.5.1 status <agent-id>
```

- Still pending and unexpired: keep waiting (check status again, or let the human know the link is still live) — do not reconnect.
- `approval_expired`, or the human explicitly denied it (`agent_rejected`): only now reconnect — call `connect_agent` (or the CLI's `connect`) again. Reconnecting registers a new agent with a new link; the old link stops working. Only do this if the human still wants to connect; a denial is a "no," not a glitch to retry past.
- `agent_revoked`: this was an approved, active connection that later got revoked — a different situation from the wait timing out. Reconnect only if the agent still needs access.

## One connection per human

One local Agent Auth installation belongs to one human — whoever approves its first connection becomes its permanent owner. A different human approving a later connection from the same installation is refused with `capability_request_owner_mismatch`. Never pass `connect_agent`'s `force_approval: true` (the plain CLI has no equivalent flag) to move an installation to a different person — it exists specifically to reset the existing binding so a different user can authenticate, which is exactly the switch this rule forbids. If a second human needs to connect, they need their own installation (their own `--storage-dir`, machine, or account profile), not this one.

## After connecting: read account and organization

Once approved, call `execute_capability` with the `agent_id` `connect_agent` returned:

```json
{ "agent_id": "<agent-id>", "capability": "read_account" }
```

```json
{
  "agent_id": "<agent-id>",
  "capability": "read_organization",
  "arguments": { "organization_id": "<organization-id-from-read_account>" }
}
```

With the CLI:

```bash
npx @auth/agent-cli@0.5.1 execute <agent-id> read_account
npx @auth/agent-cli@0.5.1 execute <agent-id> read_organization \
  --args '{"organization_id":"<organization-id-from-read_account>"}'
```

`read_account` returns the human's account ID, name, email, and the ID of the organization they approved. `read_organization` needs that exact `organization_id` (in `arguments` over MCP, in `--args` on the CLI) and returns the organization's name and slug.

## Errors

| Error | Meaning | What to do |
| --- | --- | --- |
| `approval_timeout` | This client's own wait gave up before the 15-minute link expired. | Check status; the approval may still complete. Don't reconnect yet. |
| `approval_expired` | The 15-minute link actually ran out. | Reconnect — a new agent and link. |
| `agent_rejected` | The human explicitly denied the approval request. | Reconnect only if the human still wants to connect; don't treat a "no" as a retry-able glitch. |
| `agent_revoked` | An approved, active connection was later revoked. | Reconnect from the agent if it still needs access. |
| `capability_request_owner_mismatch` | A different human than this installation's owner tried to approve it. | Use a separate installation per human; never force it. |
| `agent_access_denied` | The connection lost access (membership or binding changed) after being active. | Reconnect from the agent. |
| `organization_not_found` | The `organization_id` passed to `read_organization` doesn't match the approved one. | Use the `organization_id` `read_account` returned; don't guess one. |
| `agent_access_unavailable` | Kuudo couldn't serve the request right now. | Retry. |

## Common mistakes

- Requesting capabilities beyond `read_account` and `read_organization`.
- Paraphrasing, shortening, or partially retyping the approval link or code.
- Reconnecting on a plain `approval_timeout` without checking status first.
- Treating `agent_rejected` (the human said no) the same as `approval_timeout` or `approval_expired` (nobody has answered yet) and reconnecting anyway.
- Approving, denying, or signing in on the human's behalf, or asking for their password or verification email.
- Putting `--url` directly before a subcommand name with nothing else in between.
- Passing `force_approval: true` to move a connection to a different human instead of using a separate installation.
