# agenticket + any MCP client

agenticket exposes a **stateless Streamable HTTP** MCP endpoint:

- URL: `http://HOST:3547/mcp` (`POST`; the endpoint also answers `GET` for
  clients that probe it)
- Auth: `Authorization: Bearer agt_...` header on every request
  (`npx agenticket token create <name>` prints the token exactly once)
- No session establishment required; every request is independent, so any
  number of agents can talk to one instance concurrently.

Generate a ready-to-paste config (mints a token automatically; JSON goes to
stdout, notes to stderr, so it pipes cleanly):

```sh
npx agenticket install json          # or: … install json > .mcp.json
```

Typical JSON client config (Cursor, Windsurf, and most `mcpServers`-style
configs):

```json
{
  "mcpServers": {
    "agenticket": {
      "type": "http",
      "url": "http://localhost:3547/mcp",
      "headers": {
        "Authorization": "Bearer agt_..."
      }
    }
  }
}
```

For stdio-only clients, bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "agenticket": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "http://localhost:3547/mcp",
        "--header", "Authorization: Bearer agt_..."
      ]
    }
  }
}
```

## Smoke test with curl

```sh
curl -s http://localhost:3547/mcp \
  -H "Authorization: Bearer agt_..." \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should get 11 tools back: `list_projects`, `create_project`, `create_issue`,
`get_issue`, `update_issue`, `list_issues`, `ready_work`, `link_issues`,
`unlink_issues`, `add_comment`, `close_issue`.
