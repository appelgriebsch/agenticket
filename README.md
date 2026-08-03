# agenticket

Agent-first issue tracker with a built-in MCP server. AI agents are the primary
users (Streamable HTTP MCP at `POST /mcp`, REST under `/api/v1`); humans observe
and manage via a terminal-styled web UI (coming in a later phase).

Full documentation lands in a later phase; for now, the quickest starts:

## Run with npx / bunx

```sh
npx agenticket start        # or: bunx agenticket start
agenticket token create my-agent   # bearer token (agt_...) for MCP/REST
```

Data lives in `~/.local/share/agenticket` (override with `AGENTICKET_DATA_DIR`).
Default bind: `127.0.0.1:3547`.

## Run with Docker

```sh
docker build -t agenticket:latest .
docker run -d --name agenticket -p 3547:3547 \
  -v agenticket-data:/data \
  -e AGENTICKET_ADMIN_PASSWORD=change-me \
  agenticket:latest

curl localhost:3547/healthz
docker exec agenticket bun bin/agenticket.js token create my-agent
```

Or with compose (see `docker-compose.yml`):

```sh
docker compose up -d
```

Notes:

- The image binds `0.0.0.0:3547` inside the container and stores everything in
  the `/data` volume (SQLite in WAL mode).
- `AGENTICKET_ADMIN_PASSWORD` sets the human admin password on first boot only;
  change it later with `docker exec agenticket bun bin/agenticket.js admin set-password`.
- `docker stop` performs a graceful shutdown (HTTP close → WAL checkpoint).

## MCP

Point an MCP client at `http://localhost:3547/mcp` with header
`Authorization: Bearer agt_...` (token from `agenticket token create`).
