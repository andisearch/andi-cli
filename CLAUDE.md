# CLAUDE.md

Project instructions for Claude Code when working in this repository.

## What this is

`@andiai/cli` — a thin CLI client for the hosted [Andi Search API](https://api.andiai.com).
Every command (`search`, `fetch`, `mcp`) is a REST/HTTP call to the live API. **No local
compute, no forked/duplicated content.** If a change would mean re-implementing something the
API already does, it belongs upstream in `andi-search-api`, not here.

## Hard rules

- **NEVER `npm publish` without the user's explicit word.** Publishing is irreversible on a
  given version (npm does not allow republishing a deleted version number).
- **NEVER `git commit` / `git push` without the user explicitly saying so in the most recent
  turn.** Passing tests, a finished feature, or `/done` do not authorize a commit — propose the
  message and wait.
- **Never bundle hosted content locally.** `andi init` (if/when built) fetches the hosted
  `SKILL.md` / `install.md` at runtime — it never ships a local copy that can drift.
- **Keep it small.** This is a thin client, not a platform. Resist adding commands or flags the
  hosted API doesn't already support.
- Patch version bumps only (`0.1.N`) unless the user explicitly asks for a minor/major bump.
- No `Co-Authored-By` lines in commit messages.

## Architecture

- `src/cli.ts` — entry point / dispatcher (shebang, `process.exit` with the resolved code).
- `src/commands.ts` — single source of truth for the command table (name, usage, flags, enums).
  Both `--help` (`src/help.ts`) and `andi schema` derive from it — never maintain either by hand.
- `src/search.ts`, `src/fetch.ts` — arg parsing (pure functions, unit-tested) + the REST call.
- `src/toolDefs.ts` — MCP tool names, descriptions, argument schemas, and arg→REST-param
  mapping. **Must stay identical to the hosted `/mcp` server's definitions in
  `andi-search-api/src/routes/mcp.ts`** — a stdio client and an HTTP client have to see the same
  tool vocabulary. `test/toolDefs.test.ts` pins the expected param set as a drift guard; when the
  hosted contract changes, update this file and that list together.
- `src/mcpServer.ts` — stdio MCP bridge: server wiring plus the in-flight tracker that drains
  running tool calls when the client disconnects (never exit on stdin close with work pending —
  the API has already been billed for it).
- `src/apiClient.ts` — the one place HTTP status codes get translated into `CliError` (which
  carries the exit code). Every command's error handling should route through this + `src/errors.ts`.
- `src/output.ts` — the JSON envelope shape and the exit-code table. Single source for both.

## Testing

- `npm test` runs `vitest` — arg parsing and request construction with `fetch` mocked. No live
  API calls in the test suite, ever.
- `npm run typecheck` — must be clean (strict mode).
- A one-off manual smoke test against the real API (`npx -y @andiai/cli search "..." --json`
  with a real key) is fine when explicitly asked for, but is not part of the automated suite.

## Release process

On a version bump: update `package.json` `version`, `VERSION`, and `src/version.ts`
(`CLI_VERSION`) together — they are not derived from one another at build time. Everything else
reads `CLI_VERSION` (the MCP server's advertised version, the `User-Agent` header), so those
three files are the whole checklist. Add a `CHANGELOG.md` entry in the same change.

Publish is npm **trusted publishing** (GitHub Actions OIDC), triggered manually via
`workflow_dispatch` in `.github/workflows/release.yml` — never automatic on push. The trusted
publisher must be configured on npmjs.com for this package after the first manual `npm publish`
establishes it (npm requires the package to exist before you can register a trusted publisher
for it).
