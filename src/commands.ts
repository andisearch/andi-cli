/**
 * Command table — the single source `--help` and `andi schema` both derive
 * from ("run once, use everywhere"). Add a flag here and both surfaces
 * pick it up.
 */
import { EXIT_CODES } from './output.js';

// Public searchMode values (config/engine-pricing.json `searchModes` keys minus the two
// non-public modes: `free` — andi-internal only, 403s public callers — and `fan-out` —
// internal sub-search dispatch, never caller-selected). Mirrors PUBLIC_SEARCH_MODES in
// andi-search-api's src/routes/mcp.ts; re-verify there if this list ever looks stale.
export const SEARCH_MODES = ['auto', 'low-cost', 'fast', 'balanced', 'deep', 'exhaustive'] as const;

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

const JSON_FLAG: FlagSpec = {
  name: '--json',
  description: 'Force JSON output (default automatically when stdout is not a TTY).',
};

export const COMMANDS: CommandSpec[] = [
  {
    name: 'search',
    usage: 'andi search "<query>" [flags]',
    description: 'Search the web via the Andi Search API.',
    flags: [
      { name: '--mode', arg: '<mode>', description: 'Cost/speed/coverage dial.', enum: SEARCH_MODES, default: 'auto' },
      { name: '--limit', arg: '<n>', description: 'Number of results.', default: '10' },
      JSON_FLAG,
      API_KEY_FLAG,
    ],
  },
  {
    name: 'fetch',
    usage: 'andi fetch <url> [flags]',
    description: 'Fetch a single web page as clean, LLM-ready content. URL may also be piped via stdin.',
    flags: [
      JSON_FLAG,
      { name: '--max-content-length', arg: '<n>', description: 'Maximum content characters to return (default 200000).' },
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
