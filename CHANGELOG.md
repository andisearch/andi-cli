# Changelog

## 0.1.0 — 2026-08-11

Initial release.

- `andi search "<query>" [--mode auto|low-cost|fast|balanced|deep|exhaustive] [--limit N] [--json]`
- `andi fetch <url> [--json] [--max-content-length N]` (URL also accepted on stdin)
- `andi mcp` — local stdio MCP server exposing `andi_web_search` and `andi_fetch_url`
- `andi schema` — machine-readable command/flag/exit-code description
- TTY-aware output (human markdown vs. JSON envelope), stable exit code taxonomy,
  `--api-key` / `ANDI_API_KEY` / `~/.andi/config.json` auth precedence
