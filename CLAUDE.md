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

## Release process (agents: follow exactly)

The trusted publisher IS configured on npmjs.com (since 2026-08-13, v0.1.2): package
`@andiai/cli` ← repo `andisearch/andi-cli`, workflow `release.yml`, GitHub Actions OIDC.
Publishing requires no token and happens ONLY through that workflow.

Steps for a release (each gated on the user's explicit word — see Hard rules):

1. Bump the version in `package.json` (`version`), `VERSION`, and `src/version.ts`
   (`CLI_VERSION`) **together** — they are not derived from one another at build time, and the
   release workflow fails the publish if the three disagree. Everything else reads
   `CLI_VERSION` (the MCP server's advertised version, the `User-Agent` header), so those three
   files are the whole version checklist. Patch bumps (`0.1.N`) only.
2. Add a `CHANGELOG.md` entry in the same change.
3. Run `npm run typecheck` and `npm test`. Then STOP and propose the commit — do not commit,
   push, or publish without the user's word.
4. On the user's word to commit/push: commit on the current branch, push to `main`.
5. On the user's word to publish/release (a separate authorization): trigger the workflow with
   `gh workflow run release.yml` (or the user runs it from the GitHub Actions tab). It never
   fires on push. The workflow re-checks version consistency, runs typecheck + tests, builds,
   and runs `npm publish --provenance`.

**NEVER run `npm publish` locally.** Version numbers are burned forever on npm even if the
version is unpublished, and local publishes skip OIDC provenance. The only sanctioned publish
path is the `release.yml` workflow. (`dist/` is gitignored; `prepack` rebuilds it on every
`npm pack`/`npm publish`, which is what makes the workflow's clean-checkout publish ship a real
binary.)

Provenance note: `npm publish --provenance` requires the GitHub repo to be **public**. If the
publish step fails with a provenance error, check repo visibility before anything else.

## Package metadata (keep aligned)

- `license`: `MIT` — LICENSE file carries the full legal name `LazyWeb Inc DBA Andi
  (https://andiai.com)`. Branding-facing spots (`author` field, README footer) use the short
  brand form `Andi AI`. Never change the license without the user's explicit direction.
- `homepage`: `https://andiai.com/api` — the human-readable product page, NOT the API base URL
  (npm shows it as the "Homepage" link and `npm docs` opens it).
- `repository`: `git+https://github.com/andisearch/andi-cli.git` — must match GitHub exactly
  or provenance verification fails.
