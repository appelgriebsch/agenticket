# agenticket + Codex CLI

Codex configures MCP servers in `~/.codex/config.toml`. agenticket speaks
Streamable HTTP, which Codex supports directly:

```toml
[mcp_servers.agenticket]
url = "http://localhost:3547/mcp"
http_headers = { "Authorization" = "Bearer agt_..." }
```

If your Codex version only supports stdio MCP servers, bridge with
`mcp-remote`:

```toml
[mcp_servers.agenticket]
command = "npx"
args = ["-y", "mcp-remote", "http://localhost:3547/mcp", "--header", "Authorization: Bearer agt_..."]
```

Mint the token with `npx agenticket token create my-agent` (printed exactly
once). Restart Codex and confirm the `agenticket` tools are listed.

To teach Codex the working conventions, paste the "The work loop" and
"Conventions" sections of [`skill/SKILL.md`](../skill/SKILL.md) into your
project's `AGENTS.md`.
