/**
 * Command table — the single source `--help` and `andi schema` both derive
 * from ("run once, use everywhere"). Add a flag here and both surfaces
 * pick it up.
 */
import { EXIT_CODES, FORMAT_CHOICES } from './output.js';

// Public searchMode values (config/engine-pricing.json `searchModes` keys minus the two
// non-public modes: `free` — andi-internal only, 403s public callers — and `fan-out` —
// internal sub-search dispatch, never caller-selected). Mirrors PUBLIC_SEARCH_MODES in
// andi-search-api's src/routes/mcp.ts; re-verify there if this list ever looks stale.
export const SEARCH_MODES = ['auto', 'low-cost', 'fast', 'balanced', 'deep', 'exhaustive'] as const;

// Thoroughness dial, independent of --mode. Mirrors EFFORT_LEVELS in andi-search-api's
// src/utils/effortLevels.ts (the server also accepts lenient synonyms — minimal, xhigh,
// ultrahigh — but the CLI exposes only the four canonical values).
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const;

export const SAFE_LEVELS = ['off', 'moderate', 'strict'] as const;
export const DATE_RANGES = ['24h', '7d', '30d', '90d', '1y'] as const;

// CLI-facing metadata tiers only — 'dev' is andi-internal and never exposed here. Mirrors the
// `metadata` values accepted by the REST route (src/routes/search.ts).
export const METADATA_LEVELS = ['basic', 'full'] as const;

export interface FlagSpec {
  name: string;
  arg?: string;
  description: string;
  enum?: readonly string[];
  default?: string;
}

export interface CommandSpec {
  name: string;
  usage: string;
  description: string;
  flags: FlagSpec[];
}

const API_KEY_FLAG: FlagSpec = {
  name: '--api-key',
  arg: '<key>',
  description: 'API key (overrides ANDI_API_KEY env / ~/.andi/config.json).',
};

const FORMAT_FLAG: FlagSpec = {
  name: '--format',
  arg: '<format>',
  description: 'Output format. auto = markdown on a terminal, JSON when piped.',
  enum: FORMAT_CHOICES,
  default: 'auto',
};

const JSON_FLAG: FlagSpec = {
  name: '--json',
  description: 'Alias for --format json.',
};

const EFFORT_FLAG: FlagSpec = {
  name: '--effort',
  arg: '<level>',
  description:
    'Thoroughness dial, independent of --mode (low favors speed, max favors thoroughness). ' +
    'Omit for adaptive; an explicit --mode wins.',
  enum: EFFORT_LEVELS,
};

export const COMMANDS: CommandSpec[] = [
  {
    name: 'search',
    usage: 'andi search "<query>" ["<query>" ...] [flags]',
    description:
      'Search the web via the Andi Search API. Up to 5 queries may be given at once; they are ' +
      'answered in one call and fused into a single ranked result set.',
    flags: [
      { name: '--mode', arg: '<mode>', description: 'Cost/speed/coverage dial.', enum: SEARCH_MODES, default: 'auto' },
      EFFORT_FLAG,
      { name: '--limit', arg: '<n>', description: 'Number of results.', default: '10' },
      { name: '--offset', arg: '<n>', description: 'Result offset for pagination.', default: '0' },
      { name: '--country', arg: '<iso2>', description: 'ISO-2 country code for localization (e.g. US, DE).' },
      { name: '--language', arg: '<code>', description: 'ISO language code (e.g. en, de).' },
      { name: '--safe', arg: '<level>', description: 'Safe-search level.', enum: SAFE_LEVELS },
      { name: '--date-range', arg: '<range>', description: 'Restrict results to a recency window.', enum: DATE_RANGES },
      { name: '--include-domains', arg: '<list>', description: 'Comma-separated domains to restrict results to.' },
      { name: '--exclude-domains', arg: '<list>', description: 'Comma-separated domains to exclude.' },
      { name: '--content', description: 'Fetch full page content for top results instead of extracts (slower, costs more).' },
      { name: '--max-content-length', arg: '<n>', description: "Cap content characters per result when --content is set. Unset uses the search mode's own ceiling.", default: "mode's ceiling" },
      {
        name: '--metadata',
        arg: '<level>',
        description: 'Metadata tier. context format (the default for agent/markdown output) uses full ' +
          'by default — content_type, word_count, lang, publisher, and more per result.',
        enum: METADATA_LEVELS,
        default: "full for context format, basic for json",
      },
      {
        name: '--no-extracts',
        description: 'Disable query-relevant passage extracts on context-format output (on by default there).',
      },
      FORMAT_FLAG,
      JSON_FLAG,
      API_KEY_FLAG,
    ],
  },
  {
    name: 'fetch',
    usage: 'andi fetch <url> [flags]',
    description: 'Fetch a single web page as clean, LLM-ready content. URL may also be piped via stdin.',
    flags: [
      { name: '--query', arg: '<text>', description: 'Question or topic to focus the extracts on.' },
      EFFORT_FLAG,
      { name: '--max-content-length', arg: '<n>', description: 'Maximum content characters to return (200000 max).', default: '100000' },
      {
        name: '--no-retry',
        description: 'Disable retrying on a 503 "content warming" response (fail immediately, as before).',
      },
      {
        name: '--retry-max',
        arg: '<seconds>',
        description: 'Cumulative wait budget across retries of a 503 "content warming" response.',
        default: '30',
      },
      FORMAT_FLAG,
      JSON_FLAG,
      API_KEY_FLAG,
    ],
  },
  {
    name: 'mcp',
    usage: 'andi mcp',
    description: 'Run a local MCP stdio server exposing andi_web_search and andi_fetch_url.',
    flags: [API_KEY_FLAG],
  },
  {
    name: 'schema',
    usage: 'andi schema',
    description: 'Print machine-readable JSON describing every command, flag, enum, and exit code.',
    flags: [],
  },
];

/** Exposed for `andi schema` and for tests asserting the taxonomy stays in sync with output.ts. */
export const EXIT_CODE_TABLE = EXIT_CODES;
