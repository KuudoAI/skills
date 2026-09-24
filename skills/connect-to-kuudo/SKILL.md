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

Then call the MCP server's connect tool with `capabilities: ["read_account", "read_organization"]`, a `name` (the tool and the project, e.g. `"Claude Code – acme/ads-reporting"`), and a `reason` (what the connection is for, in plain language). Both appear on the approval page and later at `/developers/agent-connections` — they're the human's only way to recognize this connection, so make them specific. Pass `login_hint` set to the human's email only if the human has actually given it in this conversation; never guess or invent one.

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

`@auth/agent-cli@0.5.1` stops waiting after about 5 minutes (`approval_timeout`) even though the link is good for 15. A timeout is not the same as expiry — the human may still be signing up or about to approve. Before doing anything else, check status:

```bash
npx @auth/agent-cli@0.5.1 status <agent-id>
```

- Still pending and unexpired: keep waiting (poll `status` again, or let the human know the link is still live) — do not reconnect.
- `approval_expired`, or the connection was denied or revoked: only now reconnect. Reconnecting registers a new agent with a new link; the old link stops working.

## One connection per human

One local Agent Auth installation belongs to one human — whoever approves its first connection becomes its permanent owner. A different human approving a later connection from the same installation is refused with `capability_request_owner_mismatch`. Never try to work around this (for example, with a `force_approval` option) to move an installation to a different person; if a second human needs to connect, they need their own installation (their own `--storage-dir`, machine, or account profile), not this one.

## After connecting: read account and organization

Once approved, execute the two granted capabilities:

```bash
npx @auth/agent-cli@0.5.1 execute <agent-id> read_account
npx @auth/agent-cli@0.5.1 execute <agent-id> read_organization \
  --args '{"organization_id":"<organization-id-from-read_account>"}'
```

`read_account` returns the human's account ID, name, email, and the ID of the organization they approved. `read_organization` needs that exact organization ID and returns its name and slug. Use the MCP host's own connect/execute tools instead of the CLI when running through MCP.

## Errors

| Error | Meaning | What to do |
| --- | --- | --- |
| `approval_timeout` | This client's own wait gave up before the 15-minute link expired. | Run `status`; the approval may still complete. Don't reconnect yet. |
| `approval_expired` | The 15-minute link actually ran out. | Reconnect — a new agent and link. |
| `agent_revoked` | The human denied or later revoked the connection. | Reconnect from the agent if it still needs access. |
| `capability_request_owner_mismatch` | A different human than this installation's owner tried to approve it. | Use a separate installation per human; never force it. |
| `agent_access_denied` | The connection lost access (membership or binding changed) after being active. | Reconnect from the agent. |
| `organization_not_found` | The `organization_id` passed to `read_organization` doesn't match the approved one. | Use the `organization_id` `read_account` returned; don't guess one. |
| `agent_access_unavailable` | Kuudo couldn't serve the request right now. | Retry. |

## Common mistakes

- Requesting capabilities beyond `read_account` and `read_organization`.
- Paraphrasing, shortening, or partially retyping the approval link or code.
- Reconnecting on a plain `approval_timeout` without checking `status` first.
- Approving, denying, or signing in on the human's behalf, or asking for their password or verification email.
- Putting `--url` directly before a subcommand name with nothing else in between.
