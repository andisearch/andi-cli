/** `andi fetch` — GET /api/v1/fetch. URL may come from argv or piped stdin. */
import { apiGet } from './apiClient.js';
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

export interface FetchArgs {
  url?: string;
  query?: string;
  maxContentLength?: number;
  format?: FormatChoice;
  apiKey?: string;
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
  args: { url: string; query?: string; maxContentLength?: number },
  format: 'json' | 'context'
): URLSearchParams {
  const params = new URLSearchParams({ url: args.url, format });
  if (args.query) params.set('query', args.query);
  if (args.maxContentLength !== undefined) params.set('maxContentLength', String(args.maxContentLength));
  return params;
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
    { url, query: parsed.query, maxContentLength: parsed.maxContentLength },
    useJson ? 'json' : 'context'
  );

  try {
    const { text } = await apiGet(`/api/v1/fetch?${params.toString()}`, key);
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
