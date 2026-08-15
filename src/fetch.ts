/** `andi fetch` — GET /api/v1/fetch. URL may come from argv or piped stdin. */
import { apiGet, CliError } from './apiClient.js';
import { EFFORT_LEVELS } from './commands.js';
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

// Retry policy for 503 "content warming" (the reader is still retrieving the page).
// Bounded on two independent axes — total attempts and cumulative wait — whichever
// limit is hit first stops the loop and the last CliError is thrown as-is, so the
// exhausted-retry case looks identical to today's non-retrying failure.
const DEFAULT_RETRY_MAX_SECONDS = 30;
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_WAIT_SECONDS = 5; // used only if the API gives neither a header nor a body hint

export interface FetchArgs {
  url?: string;
  query?: string;
  effort?: string;
  maxContentLength?: number;
  format?: FormatChoice;
  apiKey?: string;
  noRetry?: boolean;
  retryMaxSeconds?: number;
}

export type ParsedFetchArgs = FetchArgs | { error: string };

export function parseFetchArgs(argv: string[]): ParsedFetchArgs {
  const args: FetchArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--max-content-length': {
        const raw = argv[++i];
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return { error: `--max-content-length must be a positive integer, got "${raw ?? ''}"` };
        }
        args.maxContentLength = parsed;
        break;
      }
      case '--query':
        args.query = argv[++i];
        break;
      case '--effort': {
        const raw = argv[++i];
        if (!(EFFORT_LEVELS as readonly string[]).includes(raw)) {
          return { error: `Invalid --effort "${raw ?? ''}". Valid values: ${EFFORT_LEVELS.join(', ')}` };
        }
        args.effort = raw;
        break;
      }
      case '--format': {
        const raw = argv[++i];
        if (!(FORMAT_CHOICES as readonly string[]).includes(raw)) {
          return { error: `Invalid --format "${raw ?? ''}". Valid values: ${FORMAT_CHOICES.join(', ')}` };
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
      case '--no-retry':
        args.noRetry = true;
        break;
      case '--retry-max': {
        const raw = argv[++i];
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return { error: `--retry-max must be a non-negative number of seconds, got "${raw ?? ''}"` };
        }
        args.retryMaxSeconds = parsed;
        break;
      }
      default:
        if (arg.startsWith('--')) return { error: `Unknown flag: ${arg}` };
        if (args.url !== undefined) return { error: `Unexpected extra argument: ${arg}` };
        args.url = arg;
    }
  }

  return args;
}

async function readStdinUrl(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text || undefined;
}

export function buildFetchParams(
  args: { url: string; query?: string; effort?: string; maxContentLength?: number },
  format: 'json' | 'context'
): URLSearchParams {
  const params = new URLSearchParams({ url: args.url, format });
  if (args.query) params.set('query', args.query);
  if (args.effort) params.set('effort', args.effort);
  if (args.maxContentLength !== undefined) params.set('maxContentLength', String(args.maxContentLength));
  return params;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls apiGet and retries on 503 "content warming" only — every other error (including
 * 408/504, which also map to the service_unavailable code) passes straight through.
 * Waits the API's Retry-After hint per attempt, clamped so it never sleeps past the
 * remaining budget; stops at MAX_RETRY_ATTEMPTS total attempts or once the budget is
 * used up, whichever comes first.
 */
async function fetchWithRetry(
  path: string,
  key: string | undefined,
  retryMaxSeconds: number
): Promise<{ text: string }> {
  let waited = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      return await apiGet(path, key);
    } catch (error) {
      if (!(error instanceof CliError) || error.status !== 503 || attempt >= MAX_RETRY_ATTEMPTS) throw error;

      const remaining = retryMaxSeconds - waited;
      if (remaining <= 0) throw error;

      const wait = Math.min(error.retryAfterSeconds ?? DEFAULT_RETRY_WAIT_SECONDS, remaining);
      process.stderr.write(`Page still warming — retrying in ${wait}s (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})...\n`);
      await sleep(wait * 1000);
      waited += wait;
    }
  }
}

export async function runFetch(argv: string[]): Promise<number> {
  const parsed = parseFetchArgs(argv);
  if ('error' in parsed) {
    printErrorLine(parsed.error);
    return EXIT_CODES.invalid_args;
  }

  const useJson = resolveFormat(parsed.format) === 'json';
  let url = parsed.url;
  if (!url) url = await readStdinUrl();
  if (!url) {
    printErrorLine('Missing required argument: <url> (or pipe a URL via stdin)');
    return EXIT_CODES.invalid_args;
  }

  const key = resolveApiKey(parsed.apiKey);
  const params = buildFetchParams(
    { url, query: parsed.query, effort: parsed.effort, maxContentLength: parsed.maxContentLength },
    useJson ? 'json' : 'context'
  );

  try {
    const path = `/api/v1/fetch?${params.toString()}`;
    const { text } = parsed.noRetry
      ? await apiGet(path, key)
      : await fetchWithRetry(path, key, parsed.retryMaxSeconds ?? DEFAULT_RETRY_MAX_SECONDS);
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
