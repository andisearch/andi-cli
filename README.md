# @andiai/cli

Command-line interface for the [Andi Search API](https://api.andiai.com) — web search, page
fetch, and a local MCP server, all hitting the live hosted API directly. No local search index,
no local ranking: this is a thin client.

## Quick Start

```bash
npx -y @andiai/cli search "andi search api" --json
```

Or install it globally:

```bash
npm install -g @andiai/cli
andi search "current weather in san francisco"
```

## Auth

Get a key: https://console.andiai.com/signup — full auth details: https://api.andiai.com/auth.md

Precedence: `--api-key <key>` flag > `ANDI_API_KEY` env var > `~/.andi/config.json` (`{"apiKey":
"..."}`) > none. `andi --help` and `andi schema` work without a key.

```bash
export ANDI_API_KEY=sk-...
andi search "typescript satisfies operator"
```

## Commands

### `andi search "<query>" [flags]`

```bash
andi search "who won the 2026 f1 championship" --mode deep --limit 5
```

- `--mode <mode>` — `auto` (default) `low-cost` `fast` `balanced` `deep` `exhaustive`
- `--limit <n>` — number of results (default 10)
- `--json` — force JSON output
- `--api-key <key>`

### `andi fetch <url> [flags]`

```bash
andi fetch https://example.com/article --json
echo "https://example.com/article" | andi fetch
```

- `--max-content-length <n>` — cap returned content characters (default 200000)
- `--json`, `--api-key <key>`

### `andi mcp`

Runs a local stdio MCP server exposing the same two tools as the hosted remote server
(`andi_web_search`, `andi_fetch_url`) — useful for MCP clients that only speak stdio.
For HTTP-capable clients, prefer the hosted endpoint directly (no CLI install needed):

```json
{
  "mcpServers": {
    "andi": {
      "url": "https://api.andiai.com/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

stdio via this CLI:

```json
{
  "mcpServers": {
    "andi": {
      "command": "npx",
      "args": ["-y", "@andiai/cli", "mcp"],
      "env": { "ANDI_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### `andi schema`

Prints machine-readable JSON describing every command, flag, enum, and exit code — for agents
that want to introspect the CLI instead of scraping `--help`.

## Output format

- TTY (interactive terminal): human-readable markdown (`format=context`).
- Piped or `--json`: a JSON envelope, never a bare array —
  `{"ok": true, "data": ..., "error": null, "meta": {...}}`.
- Errors: `{"code", "message", "hint", "retryable"}`, printed to stderr in human mode or as
  `{"ok": false, "error": {...}}` on stdout in JSON mode.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | generic error |
| 2 | invalid arguments |
| 3 | auth failure (401 / missing key) |
| 4 | payment required (402 / credits exhausted) |
| 5 | rate limited (429) |
| 6 | timeout |

## Environment variables

- `ANDI_API_KEY` — API key
- `ANDI_API_BASE` — override the API base URL (default `https://api.andiai.com`)
- `NO_COLOR` — respected; ANSI stripped automatically when stdout is not a TTY

## Links

- API reference: https://docs.andiai.com
- Agent install guide: https://api.andiai.com/install.md
- Auth guide: https://api.andiai.com/auth.md
- Machine-readable API description: https://api.andiai.com/llms.txt

## Local development

```bash
npm install
npm run dev -- search "test query" --json   # runs src/cli.ts directly via tsx
npm run typecheck
npm test
npm run build                               # emits dist/cli.js (ESM) + dist/cli.cjs (CJS)
```
