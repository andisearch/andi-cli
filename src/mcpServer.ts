/**
 * `andi mcp` — native stdio MCP server. A thin bridge exposing the SAME two
 * tools as the hosted remote server (POST /mcp): andi_web_search and
 * andi_fetch_url. No local compute — each handler is a REST call to the
 * live API over HTTPS, authenticated with the caller's key. One tool
 * vocabulary whether a client speaks stdio (here) or Streamable HTTP
 * (the hosted endpoint).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { apiGet, CliError } from './apiClient.js';
import { SEARCH_MODES } from './commands.js';
import { resolveApiKey } from './config.js';

const SEARCH_TOOL_SCHEMA = {
  q: z.string().min(1).describe('Search query. Supports operators: site:, -term, filetype:, intitle:, "exact phrase".'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of results (default 10).'),
  searchMode: z.enum(SEARCH_MODES).optional().describe(
    'Cost/speed/coverage dial (default auto). fast ~1s lowest latency; low-cost budget-constrained; ' +
    'balanced everyday web search; deep ~2-3s adds spell correction and more engines; exhaustive ' +
    'multi-round agentic retrieval (up to ~15s); auto picks based on the query.'
  ),
  country: z.string().length(2).optional().describe('ISO-2 country code for localization (e.g. US, DE).'),
  language: z.string().min(2).max(5).optional().describe('ISO language code (e.g. en, de).'),
  dateRange: z.enum(['24h', '7d', '30d', '90d', '1y']).optional().describe('Restrict results to a recency window.'),
};

const FETCH_TOOL_SCHEMA = {
  url: z.string().url().describe('Full URL of the web page to fetch (https://...).'),
  maxContentLength: z.number().int().min(500).optional().describe('Maximum content characters to return (default 200000).'),
};

type SearchToolArgs = {
  q: string;
  limit?: number;
  searchMode?: (typeof SEARCH_MODES)[number];
  country?: string;
  language?: string;
  dateRange?: '24h' | '7d' | '30d' | '90d' | '1y';
};

type FetchToolArgs = { url: string; maxContentLength?: number };

async function runSearchTool(args: SearchToolArgs, apiKey: string): Promise<CallToolResult> {
  const params = new URLSearchParams({ q: args.q, format: 'context' });
  if (args.limit !== undefined) params.set('limit', String(args.limit));
  if (args.searchMode) params.set('searchMode', args.searchMode);
  if (args.country) params.set('country', args.country);
  if (args.language) params.set('language', args.language);
  if (args.dateRange) params.set('dateRange', args.dateRange);
  return callAndWrap(`/api/v1/search?${params.toString()}`, apiKey, 'Search');
}

async function runFetchTool(args: FetchToolArgs, apiKey: string): Promise<CallToolResult> {
  const params = new URLSearchParams({ url: args.url, format: 'context' });
  if (args.maxContentLength !== undefined) params.set('maxContentLength', String(args.maxContentLength));
  return callAndWrap(`/api/v1/fetch?${params.toString()}`, apiKey, 'Fetch');
}

/** Runs the REST call and translates outcomes into a CallToolResult — never a thrown protocol error. */
async function callAndWrap(path: string, apiKey: string, label: string): Promise<CallToolResult> {
  try {
    const { text } = await apiGet(path, apiKey);
    return { content: [{ type: 'text', text }], isError: false };
  } catch (error) {
    const message = error instanceof CliError ? error.message : error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `${label} failed: ${message}` }], isError: true };
  }
}

function buildServer(apiKey: string): McpServer {
  const server = new McpServer(
    { name: 'andi-cli', title: 'Andi Web Search (CLI)', version: '0.1.0' },
    {
      instructions:
        'Andi provides real-time web search and page fetching. Search results are pre-ranked, ' +
        'deduplicated, and returned as LLM-ready markdown — present them directly rather than ' +
        're-searching. Use andi_fetch_url to read a specific page in full.',
    }
  );

  const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

  // Untyped invocation: matches the same TS2589 workaround used by the hosted server
  // (src/routes/mcp.ts in andi-search-api) — registerTool's generics hit "excessively
  // deep" instantiation under strict mode with this schema shape.
  const registerTool = server.registerTool.bind(server) as (name: string, config: object, cb: unknown) => unknown;

  registerTool(
    'andi_web_search',
    {
      title: 'Andi Web Search',
      description:
        'Real-time web search via the Andi Search API. Aggregates 40+ search engines and returns ' +
        'ranked results with instant answers as LLM-ready markdown.',
      inputSchema: SEARCH_TOOL_SCHEMA,
      annotations: readOnlyAnnotations,
    },
    (args: SearchToolArgs) => runSearchTool(args, apiKey)
  );

  registerTool(
    'andi_fetch_url',
    {
      title: 'Andi Fetch URL',
      description: 'Fetch and read a specific web page by URL, returning its content as LLM-ready markdown.',
      inputSchema: FETCH_TOOL_SCHEMA,
      annotations: readOnlyAnnotations,
    },
    (args: FetchToolArgs) => runFetchTool(args, apiKey)
  );

  return server;
}

export async function runMcp(argv: string[]): Promise<number> {
  let apiKey: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--api-key') apiKey = argv[++i];
  }
  const key = resolveApiKey(apiKey);
  if (!key) {
    process.stderr.write('No API key found. Set ANDI_API_KEY, pass --api-key, or write ~/.andi/config.json.\n');
    return 3;
  }

  const server = buildServer(key);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stays alive on stdio until the client disconnects/closes stdin.
  return new Promise<number>((resolve) => {
    process.stdin.on('close', () => resolve(0));
  });
}
