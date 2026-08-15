import { describe, expect, it } from 'vitest';
import {
  buildFetchToolParams,
  buildSearchToolParams,
  FETCH_TOOL,
  FETCH_TOOL_SCHEMA,
  MAX_QUERIES,
  SEARCH_TOOL,
  SEARCH_TOOL_SCHEMA,
  SERVER_INSTRUCTIONS,
  validateSearchToolArgs,
} from '../src/toolDefs.js';

/**
 * Parity guard. These are the tool contracts the hosted remote server publishes in
 * andi-search-api/src/routes/mcp.ts. A stdio client and an HTTP client must see the
 * same vocabulary — if the hosted server changes, update both it and this list together.
 */
const HOSTED_SEARCH_PARAMS = [
  'q',
  'queries',
  'limit',
  'offset',
  'searchMode',
  'country',
  'language',
  'safe',
  'dateRange',
  'includeDomains',
  'excludeDomains',
  'content',
  'maxContentLength',
  'effort',
];
const HOSTED_FETCH_PARAMS = ['url', 'query', 'maxContentLength'];

describe('tool schema parity with the hosted MCP server', () => {
  it('exposes exactly the hosted search params', () => {
    expect(Object.keys(SEARCH_TOOL_SCHEMA).sort()).toEqual([...HOSTED_SEARCH_PARAMS].sort());
  });

  it('exposes exactly the hosted fetch params', () => {
    expect(Object.keys(FETCH_TOOL_SCHEMA).sort()).toEqual([...HOSTED_FETCH_PARAMS].sort());
  });

  it('does not carry the retired depth param', () => {
    expect(SEARCH_TOOL_SCHEMA).not.toHaveProperty('depth');
    expect(SERVER_INSTRUCTIONS).not.toContain('depth');
  });

  it('keeps the tool names the hosted server publishes', () => {
    expect(SEARCH_TOOL.name).toBe('andi_web_search');
    expect(FETCH_TOOL.name).toBe('andi_fetch_url');
  });

  it('carries the when-to-use guidance on both descriptions', () => {
    expect(SEARCH_TOOL.description).toContain('Use for current events, facts, documentation lookup');
    expect(SEARCH_TOOL.description).toContain('Prefer default extracts first');
    expect(FETCH_TOOL.description).toContain('Use after andi_web_search to read a promising result in full');
  });

  it('names searchMode and dateRange in the server instructions', () => {
    expect(SERVER_INSTRUCTIONS).toContain('searchMode');
    expect(SERVER_INSTRUCTIONS).toContain('dateRange');
  });

  it('marks both tools read-only and open-world', () => {
    for (const tool of [SEARCH_TOOL, FETCH_TOOL]) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
    }
  });
});

describe('validateSearchToolArgs', () => {
  it('accepts exactly one of q or queries', () => {
    expect(validateSearchToolArgs({ q: 'cats' })).toBeUndefined();
    expect(validateSearchToolArgs({ queries: ['cats', 'dogs'] })).toBeUndefined();
  });

  it('rejects both together', () => {
    expect(validateSearchToolArgs({ q: 'cats', queries: ['dogs'] })).toContain('not both');
  });

  it('rejects neither', () => {
    expect(validateSearchToolArgs({})).toContain('Missing query');
    expect(validateSearchToolArgs({ q: '   ' })).toContain('Missing query');
  });
});

describe('buildSearchToolParams', () => {
  it('always requests context format', () => {
    expect(buildSearchToolParams({ q: 'cats' }).get('format')).toBe('context');
  });

  it('requests full metadata so agents can judge a result before fetching it', () => {
    expect(buildSearchToolParams({ q: 'cats' }).get('metadata')).toBe('full');
  });

  it('sends queries as a JSON array in q', () => {
    expect(buildSearchToolParams({ queries: ['a', 'b'] }).get('q')).toBe('["a","b"]');
  });

  it('caps the queries array at the API maximum', () => {
    expect(SEARCH_TOOL_SCHEMA.queries.safeParse(Array(MAX_QUERIES + 1).fill('q')).success).toBe(false);
    expect(SEARCH_TOOL_SCHEMA.queries.safeParse(Array(MAX_QUERIES).fill('q')).success).toBe(true);
  });

  it('forwards every optional param under its API name', () => {
    const params = buildSearchToolParams({
      q: 'x',
      limit: 5,
      offset: 10,
      searchMode: 'deep',
      effort: 'high',
      country: 'DE',
      language: 'de',
      safe: 'strict',
      dateRange: '7d',
      includeDomains: 'a.com',
      excludeDomains: 'b.com',
      content: true,
      maxContentLength: 4000,
    });
    expect(Object.fromEntries(params)).toEqual({
      q: 'x',
      format: 'context',
      metadata: 'full',
      limit: '5',
      offset: '10',
      searchMode: 'deep',
      effort: 'high',
      country: 'DE',
      language: 'de',
      safe: 'strict',
      dateRange: '7d',
      includeDomains: 'a.com',
      excludeDomains: 'b.com',
      content: 'true',
      maxContentLength: '4000',
    });
  });

  it('omits content when false rather than sending content=false', () => {
    expect(buildSearchToolParams({ q: 'x', content: false }).get('content')).toBeNull();
  });

  it('omits effort when absent', () => {
    expect(buildSearchToolParams({ q: 'x' }).get('effort')).toBeNull();
  });
});

describe('buildFetchToolParams', () => {
  it('forwards url, query, and maxContentLength', () => {
    const params = buildFetchToolParams({ url: 'https://example.com', query: 'pricing', maxContentLength: 5000 });
    expect(Object.fromEntries(params)).toEqual({
      url: 'https://example.com',
      format: 'context',
      query: 'pricing',
      maxContentLength: '5000',
    });
  });
});
