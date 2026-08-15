/** `andi search` — GET /api/v1/search. */
import { apiGet } from './apiClient.js';
import { DATE_RANGES, EFFORT_LEVELS, METADATA_LEVELS, SAFE_LEVELS, SEARCH_MODES } from './commands.js';
import { resolveApiKey } from './config.js';
import { reportError } from './errors.js';
import {
  EXIT_CODES,
  FORMAT_CHOICES,
  ok,
  printErrorLine,
  printHuman,
  printJson,
  resolveFormat,
  type FormatChoice,
} from './output.js';
import { MAX_QUERIES } from './toolDefs.js';

export interface SearchArgs {
  /** One or more queries; more than one is fused into a single ranked set by the API. */
  queries: string[];
  mode?: string;
  effort?: string;
  limit?: number;
  offset?: number;
  country?: string;
  language?: string;
  safe?: string;
  dateRange?: string;
  includeDomains?: string;
  excludeDomains?: string;
  content?: boolean;
  maxContentLength?: number;
  /** Metadata tier override. Unset means "take the format's own default" (see buildSearchParams). */
  metadata?: 'basic' | 'full';
  /** Opts out of the context-format extracts default (the API otherwise defaults extracts=true there). */
  noExtracts?: boolean;
  format?: FormatChoice;
  apiKey?: string;
}

export type ParsedSearchArgs = SearchArgs | { error: string };

/** Reads a flag's value and validates it as a positive (or, with min 0, non-negative) integer. */
function parseIntFlag(name: string, raw: string | undefined, min: number): number | { error: string } {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    return { error: `${name} must be an integer >= ${min}, got "${raw ?? ''}"` };
  }
  return parsed;
}

function invalidEnum(name: string, value: string | undefined, valid: readonly string[]): string {
  return `Invalid ${name} "${value ?? ''}". Valid values: ${valid.join(', ')}`;
}

export function parseSearchArgs(argv: string[]): ParsedSearchArgs {
  const queries: string[] = [];
  const args: Omit<SearchArgs, 'queries'> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--mode':
        args.mode = argv[++i];
        break;
      case '--effort':
        args.effort = argv[++i];
        break;
      case '--limit': {
        const value = parseIntFlag('--limit', argv[++i], 1);
        if (typeof value !== 'number') return value;
        args.limit = value;
        break;
      }
      case '--offset': {
        const value = parseIntFlag('--offset', argv[++i], 0);
        if (typeof value !== 'number') return value;
        args.offset = value;
        break;
      }
      case '--max-content-length': {
        const value = parseIntFlag('--max-content-length', argv[++i], 1);
        if (typeof value !== 'number') return value;
        args.maxContentLength = value;
        break;
      }
      case '--country':
        args.country = argv[++i];
        break;
      case '--language':
        args.language = argv[++i];
        break;
      case '--safe':
        args.safe = argv[++i];
        break;
      case '--date-range':
        args.dateRange = argv[++i];
        break;
      case '--include-domains':
        args.includeDomains = argv[++i];
        break;
      case '--exclude-domains':
        args.excludeDomains = argv[++i];
        break;
      case '--content':
        args.content = true;
        break;
      case '--metadata': {
        const raw = argv[++i];
        if (!(METADATA_LEVELS as readonly string[]).includes(raw)) {
          return { error: invalidEnum('--metadata', raw, METADATA_LEVELS) };
        }
        args.metadata = raw as 'basic' | 'full';
        break;
      }
      case '--no-extracts':
        args.noExtracts = true;
        break;
      case '--format': {
        const raw = argv[++i];
        if (!(FORMAT_CHOICES as readonly string[]).includes(raw)) {
          return { error: invalidEnum('--format', raw, FORMAT_CHOICES) };
        }
        args.format = raw as FormatChoice;
        break;
      }
      case '--json':
        args.format = 'json';
        break;
      case '--api-key':
        args.apiKey = argv[++i];
        break;
      default:
        if (arg.startsWith('--')) return { error: `Unknown flag: ${arg}` };
        queries.push(arg);
    }
  }

  if (queries.length === 0) return { error: 'Missing required argument: <query>' };
  if (queries.length > MAX_QUERIES) {
    return { error: `At most ${MAX_QUERIES} queries may be given at once, got ${queries.length}.` };
  }
  if (args.mode && !(SEARCH_MODES as readonly string[]).includes(args.mode)) {
    return { error: invalidEnum('--mode', args.mode, SEARCH_MODES) };
  }
  if (args.effort && !(EFFORT_LEVELS as readonly string[]).includes(args.effort)) {
    return { error: invalidEnum('--effort', args.effort, EFFORT_LEVELS) };
  }
  if (args.safe && !(SAFE_LEVELS as readonly string[]).includes(args.safe)) {
    return { error: invalidEnum('--safe', args.safe, SAFE_LEVELS) };
  }
  if (args.dateRange && !(DATE_RANGES as readonly string[]).includes(args.dateRange)) {
    return { error: invalidEnum('--date-range', args.dateRange, DATE_RANGES) };
  }
  if (args.country && args.country.length !== 2) {
    return { error: `--country must be a 2-letter ISO code, got "${args.country}"` };
  }
  return { queries, ...args };
}

/** Maps parsed args to /api/v1/search query params (exported for tests). */
export function buildSearchParams(args: SearchArgs, format: 'json' | 'context'): URLSearchParams {
  // Multi-query rides the same `q` param as a JSON array — the REST endpoint parses either shape.
  const q = args.queries.length > 1 ? JSON.stringify(args.queries) : args.queries[0];
  const params = new URLSearchParams({ q, format });
  if (args.mode) params.set('searchMode', args.mode);
  if (args.effort) params.set('effort', args.effort);
  if (args.limit !== undefined) params.set('limit', String(args.limit));
  if (args.offset !== undefined) params.set('offset', String(args.offset));
  if (args.country) params.set('country', args.country);
  if (args.language) params.set('language', args.language);
  if (args.safe) params.set('safe', args.safe);
  if (args.dateRange) params.set('dateRange', args.dateRange);
  if (args.includeDomains) params.set('includeDomains', args.includeDomains);
  if (args.excludeDomains) params.set('excludeDomains', args.excludeDomains);
  if (args.content) params.set('content', 'true');
  if (args.maxContentLength !== undefined) params.set('maxContentLength', String(args.maxContentLength));
  // Context format is the agent/LLM-consumption shape (mirrors the MCP tool's self-call in
  // toolDefs.ts): default to metadata=full so agents get content_type/word_count/lang/publisher
  // per result. extracts=true is already the REST route's own default for format=context, so it
  // only needs to be sent explicitly for --no-extracts to opt out. json format keeps the REST
  // route's plain defaults (metadata=basic, extracts=false) unless the caller asks for --metadata.
  if (format === 'context') {
    params.set('metadata', args.metadata ?? 'full');
    if (args.noExtracts) params.set('extracts', 'false');
  } else if (args.metadata) {
    params.set('metadata', args.metadata);
  }
  return params;
}

export async function runSearch(argv: string[]): Promise<number> {
  const parsed = parseSearchArgs(argv);
  if ('error' in parsed) {
    printErrorLine(parsed.error);
    return EXIT_CODES.invalid_args;
  }

  const useJson = resolveFormat(parsed.format) === 'json';
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
