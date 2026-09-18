# MCP configuration

Kuudo follows the standard client-owned MCP connection model:

```text
user/client config -> client connects -> MCP discovery -> skill uses actual exposed names/schemas
```

The client owns configuration, authentication, connection, and discovery of native tools, resources, and prompts. The suite does not read or modify client config files, store credentials, or guess tool names. Credentials remain in the client's supported secret or configuration system.

## Configure the client

- Claude Desktop users configure MCP servers in `claude_desktop_config.json`; on macOS the standard location is `/Users/<username>/Library/Application Support/Claude/claude_desktop_config.json`.
- Claude Code users configure servers through `.mcp.json` or the client's native MCP commands.
- Codex users configure servers through Codex's native MCP configuration.

Use the current official documentation for schema and command details:

- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Codex MCP](https://developers.openai.com/codex/mcp/)
- [Model Context Protocol architecture](https://modelcontextprotocol.io/docs/learn/architecture)

After connecting, the client discovers the server's native tools, resources, and prompts. Skills use the actual names and schemas exposed in that session. The harness supplies no synthetic `ads.*` aliases, capability registry, MCP proxy, or MCP server.

MCP is independent of skill discovery. A client can discover and select Kuudo skills without an MCP connection, although a selected skill cannot perform a connected operation when its required server or authorization is unavailable.
