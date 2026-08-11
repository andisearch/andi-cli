/** `andi search` — GET /api/v1/search. */
import { apiGet } from './apiClient.js';
import { SEARCH_MODES } from './commands.js';
import { resolveApiKey } from './config.js';
import { reportError } from './errors.js';
import { EXIT_CODES, ok, printErrorLine, printHuman, printJson, wantsJson } from './output.js';

export interface SearchArgs {
  query: string;
  mode?: string;
  limit?: number;
  json: boolean;
  apiKey?: string;
}

export type ParsedSearchArgs = SearchArgs | { error: string };

export function parseSearchArgs(argv: string[]): ParsedSearchArgs {
  let query: string | undefined;
  let mode: string | undefined;
  let limit: number | undefined;
  let json = false;
  let apiKey: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--mode':
        mode = argv[++i];
        break;
      case '--limit': {
        const raw = argv[++i];
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return { error: `--limit must be a positive integer, got "${raw ?? ''}"` };
        }
        limit = parsed;
        break;
      }
      case '--json':
        json = true;
        break;
      case '--api-key':
        apiKey = argv[++i];
        break;
      default:
        if (arg.startsWith('--')) return { error: `Unknown flag: ${arg}` };
        if (query !== undefined) return { error: `Unexpected extra argument: ${arg}` };
        query = arg;
    }
  }

  if (!query) return { error: 'Missing required argument: <query>' };
  if (mode && !(SEARCH_MODES as readonly string[]).includes(mode)) {
    return { error: `Invalid --mode "${mode}". Valid values: ${SEARCH_MODES.join(', ')}` };
  }
  return { query, mode, limit, json, apiKey };
}

/** Maps parsed args to /api/v1/search query params (exported for tests). */
export function buildSearchParams(args: SearchArgs, format: 'json' | 'context'): URLSearchParams {
  const params = new URLSearchParams({ q: args.query, format });
  if (args.mode) params.set('searchMode', args.mode);
  if (args.limit !== undefined) params.set('limit', String(args.limit));
  return params;
}

export async function runSearch(argv: string[]): Promise<number> {
  const parsed = parseSearchArgs(argv);
  if ('error' in parsed) {
    printErrorLine(parsed.error);
    return EXIT_CODES.invalid_args;
  }

  const useJson = wantsJson(parsed.json);
  const key = resolveApiKey(parsed.apiKey);
  const params = buildSearchParams(parsed, useJson ? 'json' : 'context');

  try {
    const { text } = await apiGet(`/api/v1/search?${params.toString()}`, key);
    if (useJson) {
      printJson(ok(JSON.parse(text)));
    } else {
      printHuman(text);
    }
    return EXIT_CODES.ok;
  } catch (error) {
    return reportError(error, useJson);
  }
}
