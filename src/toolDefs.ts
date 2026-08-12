/**
 * MCP tool definitions — names, descriptions, argument schemas, and the
 * argument→REST-param mapping for both tools.
 *
 * ⚠ These MUST stay identical to the hosted remote MCP server's definitions in
 * `andi-search-api/src/routes/mcp.ts`. A client that adds Andi over stdio (this
 * CLI) and one that adds it over Streamable HTTP (the hosted endpoint) must see
 * the same tool vocabulary, or model behaviour diverges by transport. Everything
 * a drift would touch lives in this one file so the diff against the hosted
 * counterpart is a single-file read.
 */
import { z } from 'zod';
import { SEARCH_MODES } from './commands.js';

/** The API truncates beyond this (MAX_MULTI_QUERIES); reject early instead of silently dropping. */
export const MAX_QUERIES = 5;

export const SERVER_INSTRUCTIONS =
  'Andi provides real-time web search and page fetching. Search results are pre-ranked, ' +
  'deduplicated, and returned as LLM-ready markdown — present them directly rather than ' +
  're-searching. Use searchMode=deep or exhaustive for higher-quality results at added ' +
  'latency; use dateRange for time-sensitive queries. Use andi_fetch_url to read a ' +
  'specific page in full.';

/** Read-only live web access — clients use these to parallelise and to skip write confirmations. */
export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

export const SEARCH_TOOL_SCHEMA = {
  q: z.string().min(1).optional().describe(
    'Search query. Supports operators: site:, -term, filetype:, intitle:, "exact phrase". ' +
    'Required unless queries is supplied.'
  ),
  queries: z.array(z.string().min(1)).min(1).max(MAX_QUERIES).optional().describe(
    `Run up to ${MAX_QUERIES} related queries in one call and get fused, deduplicated results. ` +
    'Alternative to q — supply exactly one of the two.'
  ),
  // Cap 50 (REST allows 100) — deliberate: MCP tool output lands in a model context window.
  limit: z.number().int().min(1).max(50).optional().describe('Number of results (default 10).'),
  offset: z.number().int().min(0).optional().describe(
    'Skip this many results (default 0) — paginate deeper into an existing result set without re-searching.'
  ),
  searchMode: z.enum(SEARCH_MODES).optional().describe(
    'Cost/speed/coverage dial (default auto). fast ~1s lowest latency; low-cost budget-constrained; ' +
    'balanced everyday web search; deep ~2-3s adds spell correction and more engines; exhaustive ' +
    'multi-round agentic retrieval (up to ~15s); auto picks based on the query.'
  ),
  content: z.boolean().optional().describe(
    'Include cleaned page content for each result; increases cost and tokens (default false).'
  ),
  maxContentLength: z.number().int().min(500).optional().describe(
    'Maximum content characters per result when content=true.'
  ),
  country: z.string().length(2).optional().describe('ISO-2 country code for localization (e.g. US, DE).'),
  language: z.string().min(2).max(5).optional().describe('ISO language code (e.g. en, de).'),
  safe: z.enum(['off', 'moderate', 'strict']).optional().describe('Safe-search level.'),
  dateRange: z.enum(['24h', '7d', '30d', '90d', '1y']).optional().describe('Restrict results to a recency window.'),
  includeDomains: z.string().optional().describe('Comma-separated list of domains to restrict results to.'),
  excludeDomains: z.string().optional().describe('Comma-separated list of domains to exclude.'),
};

export const FETCH_TOOL_SCHEMA = {
  url: z.string().url().describe('Full URL of the web page to fetch (https://...).'),
  query: z.string().min(1).optional().describe(
    'What you want from the page — returns query-focused extracts instead of only full content.'
  ),
  maxContentLength: z.number().int().min(500).optional()
    .describe('Maximum content characters to return (default 200000).'),
};

export type SearchToolArgs = {
  q?: string;
  queries?: string[];
  limit?: number;
  offset?: number;
  searchMode?: (typeof SEARCH_MODES)[number];
  content?: boolean;
  maxContentLength?: number;
  country?: string;
  language?: string;
  safe?: 'off' | 'moderate' | 'strict';
  dateRange?: '24h' | '7d' | '30d' | '90d' | '1y';
  includeDomains?: string;
  excludeDomains?: string;
};

export type FetchToolArgs = { url: string; query?: string; maxContentLength?: number };

export const SEARCH_TOOL = {
  name: 'andi_web_search',
  title: 'Andi Web Search',
  description:
    'Real-time web search via the Andi Search API. Aggregates 40+ search engines and returns ' +
    'ranked results with instant answers as LLM-ready markdown. Use for current events, facts, ' +
    'documentation lookup, and any question needing up-to-date web information. Results carry ' +
    'extracts by default; set content=true for full page content (costs more tokens). Prefer ' +
    'default extracts first; set content=true or follow up with andi_fetch_url only when ' +
    'extracts are insufficient.',
  inputSchema: SEARCH_TOOL_SCHEMA,
  annotations: READ_ONLY_ANNOTATIONS,
} as const;

export const FETCH_TOOL = {
  name: 'andi_fetch_url',
  title: 'Andi Fetch URL',
  description:
    'Fetch and read a specific web page by URL, returning its content as LLM-ready markdown. ' +
    'Use after andi_web_search to read a promising result in full, or whenever you already ' +
    'know the exact URL you need.',
  inputSchema: FETCH_TOOL_SCHEMA,
  annotations: READ_ONLY_ANNOTATIONS,
} as const;

/**
 * Exactly-one-of q/queries. zod's raw-shape `inputSchema` has no object-level
 * refinement hook, so the mutual exclusion is enforced here and surfaced as a
 * tool error the model can correct, not a protocol error.
 */
export function validateSearchToolArgs(args: SearchToolArgs): string | undefined {
  const hasQ = typeof args.q === 'string' && args.q.trim().length > 0;
  const hasQueries = Array.isArray(args.queries) && args.queries.length > 0;
  if (hasQ && hasQueries) {
    return `Supply either q (single query) or queries (up to ${MAX_QUERIES} related queries), not both.`;
  }
  if (!hasQ && !hasQueries) {
    return `Missing query. Supply q (single query) or queries (up to ${MAX_QUERIES} related queries).`;
  }
  if (hasQueries && args.queries!.length > MAX_QUERIES) {
    return `Too many queries: ${args.queries!.length}. Supply at most ${MAX_QUERIES}.`;
  }
  return undefined;
}

/** Maps search tool args to /api/v1/search query params (exported for tests). */
export function buildSearchToolParams(args: SearchToolArgs): URLSearchParams {
  // Multi-query rides the REST route's JSON-array form of `q`; single query passes through.
  const q = args.queries?.length ? JSON.stringify(args.queries) : (args.q ?? '');
  // metadata=full: agents need content_type/word_count/lang/publisher/summary to decide whether a
  // result is worth a follow-up fetch. The extra frontmatter is worth the tokens on this surface.
  const params = new URLSearchParams({ q, format: 'context', metadata: 'full' });
  if (args.limit !== undefined) params.set('limit', String(args.limit));
  if (args.offset !== undefined) params.set('offset', String(args.offset));
  if (args.searchMode) params.set('searchMode', args.searchMode);
  if (args.content) params.set('content', 'true');
  if (args.maxContentLength !== undefined) params.set('maxContentLength', String(args.maxContentLength));
  if (args.country) params.set('country', args.country);
  if (args.language) params.set('language', args.language);
  if (args.safe) params.set('safe', args.safe);
  if (args.dateRange) params.set('dateRange', args.dateRange);
  if (args.includeDomains) params.set('includeDomains', args.includeDomains);
  if (args.excludeDomains) params.set('excludeDomains', args.excludeDomains);
  return params;
}

/** Maps fetch tool args to /api/v1/fetch query params (exported for tests). */
export function buildFetchToolParams(args: FetchToolArgs): URLSearchParams {
  const params = new URLSearchParams({ url: args.url, format: 'context' });
  if (args.query) params.set('query', args.query);
  if (args.maxContentLength !== undefined) params.set('maxContentLength', String(args.maxContentLength));
  return params;
}
