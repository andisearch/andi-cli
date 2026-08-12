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

### `andi search "<query>" ["<query>" ...] [flags]`

```bash
andi search "who won the 2026 f1 championship" --mode deep --limit 5
andi search "rust async runtime" "tokio vs async-std" --limit 8   # one call, fused ranking
```

- `--mode <mode>` — `auto` (default) `low-cost` `fast` `balanced` `deep` `exhaustive`
- `--limit <n>` — number of results (default 10)
- `--offset <n>` — result offset for pagination (default 0)
- `--country <iso2>` — ISO-2 country code for localization (e.g. `US`, `DE`)
- `--language <code>` — ISO language code (e.g. `en`, `de`)
- `--safe <level>` — `off` `moderate` `strict`
- `--date-range <range>` — `24h` `7d` `30d` `90d` `1y`
- `--include-domains <list>` / `--exclude-domains <list>` — comma-separated domains
- `--content` — fetch full page content for top results instead of extracts (slower, costs more)
- `--max-content-length <n>` — cap content characters per result when `--content` is set
- `--format <format>`, `--json`, `--api-key <key>`

Up to 5 queries may be given at once. They are answered in a single API call and fused into
one ranked result set.

### `andi fetch <url> [flags]`

```bash
andi fetch https://example.com/article --json
andi fetch https://example.com/pricing --query "what does the team plan cost"
echo "https://example.com/article" | andi fetch
```

- `--query <text>` — question or topic to focus the extracts on
- `--max-content-length <n>` — cap returned content characters (default 100000, max 200000)
- `--no-retry` — disable retrying on a 503 "content warming" response (fail immediately, as before)
- `--retry-max <seconds>` — cumulative wait budget across retries of a 503 (default 30)
- `--format <format>`, `--json`, `--api-key <key>`

On a 503 "content warming" response (the page is still being retrieved), `fetch` retries
automatically: up to 3 total attempts, waiting the API's `Retry-After` hint each time, capped so
it never waits past 30 total seconds (or `--retry-max`). If retries are exhausted, the error is
the same one you'd have gotten without retrying — same message, exit code 7.

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

`--format auto|json|markdown` decides the shape. `auto` (the default) writes human-readable
markdown (`format=context`) on an interactive terminal and the JSON envelope when stdout is
piped or redirected. An explicit value always wins, so this writes real markdown to a file:

```bash
andi search "postgres index types" --format markdown > notes.md
```

- JSON: an envelope, never a bare array — `{"ok": true, "data": ..., "error": null, "meta": {...}}`.
- Errors: `{"code", "message", "hint", "retryable", "reason?", "retryAfterSeconds?"}`, printed
  to stderr in markdown mode or as `{"ok": false, "error": {...}}` on stdout in JSON mode.
- `--json` is an alias for `--format json`.

## Exit codes

| Code | Name | Meaning |
|---|---|---|
| 0 | ok | success |
| 1 | generic | unclassified failure |
| 2 | invalid_args | bad arguments, or a 400 from the API |
| 3 | auth | auth failure (401 / missing key) |
| 4 | payment | payment required (402 / credits exhausted) |
| 5 | rate_limit | rate limited (429) — `retryAfterSeconds` when the API sent one |
| 6 | timeout | the request exceeded the client timeout |
| 7 | service_unavailable | 503/408/504 — temporary, **retryable**; carries the API's `message` and `retryAfterSeconds` (a 503 on `fetch` usually means the page is still being retrieved) |
| 8 | unprocessable | 422 from `fetch` — the page itself failed, **not retryable**; `reason` is `not_found`, `blocked`, or `unextractable` |

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
