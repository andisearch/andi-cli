# Changelog

## 0.1.2 — 2026-08-12
- MCP stdio bridge: `andi_fetch_url` now absorbs short content-warming 503s (2 bounded retries, hints ≤8s) and its description documents the retry behavior; `--version`/schema/serverInfo version string corrected to match the package.

- `andi fetch` retries automatically on a 503 "content warming" response: up to 3 total
  attempts, waiting the API's `Retry-After` hint each time, capped at 30 cumulative seconds.
  `--no-retry` disables it (fails immediately, as before); `--retry-max <seconds>` overrides the
  cumulative wait budget. Every other error, including 408/504 (which also map to
  `service_unavailable`), passes straight through unretried.
- `andi_web_search` tool description rewritten: drops engine-internals detail in favor of
  Andi's own index scale ("tens of billions of pages") and fallback-search framing.
- `--max-content-length` default corrected to 100000 (was documented as 200000; 200000 remains
  the max) across `andi fetch` help text, `andi mcp` tool schema, and the README.

## 0.1.1 — 2026-08-11

- `andi mcp` tool schemas now match the hosted `/mcp` server exactly: adds `queries` (up to 5,
  mutually exclusive with `q`), `offset`, `safe`, `includeDomains`, `excludeDomains`, `content`,
  `maxContentLength` on search and `query` on fetch; drops the retired `depth`. Definitions moved
  to `src/toolDefs.ts` so the hosted counterpart is a single-file diff.
- `--format auto|json|markdown` on `search` and `fetch`. `auto` keeps the old TTY heuristic;
  an explicit value now wins, so `andi search x --format markdown > out.md` writes markdown
  instead of silently switching to JSON. `--json` is an alias for `--format json`.
- `andi search` gains `--offset`, `--country`, `--language`, `--safe`, `--date-range`,
  `--include-domains`, `--exclude-domains`, `--content`, `--max-content-length`, and multi-query
  (repeat the positional query, up to 5). `andi fetch` gains `--query` for query-focused extracts.
- Honest retryability: 503/408/504 now report `service_unavailable` (exit 7, `retryable: true`)
  with the API's own `message` and `retry_after_seconds`; 422 reports `unprocessable` (exit 8,
  `retryable: false`) with the page-level `reason`. Previously both fell into a flat
  non-retryable `request_failed`.
- `andi mcp` drains in-flight tool calls on client disconnect (30s cap) instead of exiting
  immediately — a killed client no longer orphans a call the API has already been billed for.
- Calls send `x-andi-surface: cli` (or `cli-mcp` from the stdio bridge) and a
  `User-Agent: andi-cli/<version>` header.
- The MCP server reports the real CLI version instead of a hardcoded `0.1.0`.

## 0.1.0 — 2026-08-11

Initial release.

- `andi search "<query>" [--mode auto|low-cost|fast|balanced|deep|exhaustive] [--limit N] [--json]`
- `andi fetch <url> [--json] [--max-content-length N]` (URL also accepted on stdin)
- `andi mcp` — local stdio MCP server exposing `andi_web_search` and `andi_fetch_url`
- `andi schema` — machine-readable command/flag/exit-code description
- TTY-aware output (human markdown vs. JSON envelope), stable exit code taxonomy,
  `--api-key` / `ANDI_API_KEY` / `~/.andi/config.json` auth precedence
