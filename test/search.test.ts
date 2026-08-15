import { describe, expect, it } from 'vitest';
import { buildSearchParams, parseSearchArgs } from '../src/search.js';

describe('parseSearchArgs', () => {
  it('parses a bare query', () => {
    expect(parseSearchArgs(['hello world'])).toEqual({ queries: ['hello world'] });
  });

  it('parses every flag', () => {
    const parsed = parseSearchArgs([
      'test',
      '--mode', 'deep',
      '--effort', 'high',
      '--limit', '5',
      '--offset', '10',
      '--country', 'DE',
      '--language', 'de',
      '--safe', 'strict',
      '--date-range', '7d',
      '--include-domains', 'a.com,b.com',
      '--exclude-domains', 'spam.com',
      '--content',
      '--max-content-length', '4000',
      '--format', 'markdown',
      '--api-key', 'k1',
    ]);
    expect(parsed).toEqual({
      queries: ['test'],
      mode: 'deep',
      effort: 'high',
      limit: 5,
      offset: 10,
      country: 'DE',
      language: 'de',
      safe: 'strict',
      dateRange: '7d',
      includeDomains: 'a.com,b.com',
      excludeDomains: 'spam.com',
      content: true,
      maxContentLength: 4000,
      format: 'markdown',
      apiKey: 'k1',
    });
  });

  it('accepts repeated positional queries as a multi-query search', () => {
    const parsed = parseSearchArgs(['first', 'second', 'third', '--limit', '3']);
    expect(parsed).toEqual({ queries: ['first', 'second', 'third'], limit: 3 });
  });

  it('rejects more than five queries', () => {
    const parsed = parseSearchArgs(['a', 'b', 'c', 'd', 'e', 'f']);
    expect('error' in parsed && parsed.error).toContain('At most 5 queries');
  });

  it('treats --json as an alias for --format json', () => {
    expect(parseSearchArgs(['q', '--json'])).toEqual({ queries: ['q'], format: 'json' });
  });

  it('rejects a missing query', () => {
    expect(parseSearchArgs(['--json'])).toEqual({ error: 'Missing required argument: <query>' });
  });

  it('rejects an invalid --mode value and enumerates the valid set', () => {
    const parsed = parseSearchArgs(['q', '--mode', 'nonsense']);
    expect('error' in parsed && parsed.error).toContain('auto, low-cost, fast, balanced, deep, exhaustive');
  });

  it('rejects an invalid --effort value and enumerates the valid set', () => {
    const parsed = parseSearchArgs(['q', '--effort', 'nonsense']);
    expect('error' in parsed && parsed.error).toContain('low, medium, high, max');
  });

  it('rejects an invalid --safe value', () => {
    const parsed = parseSearchArgs(['q', '--safe', 'sortof']);
    expect('error' in parsed && parsed.error).toContain('off, moderate, strict');
  });

  it('rejects an invalid --date-range value', () => {
    const parsed = parseSearchArgs(['q', '--date-range', 'lastweek']);
    expect('error' in parsed && parsed.error).toContain('24h, 7d, 30d, 90d, 1y');
  });

  it('rejects an invalid --format value', () => {
    const parsed = parseSearchArgs(['q', '--format', 'yaml']);
    expect('error' in parsed && parsed.error).toContain('auto, json, markdown');
  });

  it('rejects a --country that is not two letters', () => {
    const parsed = parseSearchArgs(['q', '--country', 'DEU']);
    expect('error' in parsed).toBe(true);
  });

  it('rejects an invalid --limit value', () => {
    expect('error' in parseSearchArgs(['q', '--limit', 'abc'])).toBe(true);
  });

  it('accepts --offset 0 but rejects a negative offset', () => {
    expect(parseSearchArgs(['q', '--offset', '0'])).toEqual({ queries: ['q'], offset: 0 });
    expect('error' in parseSearchArgs(['q', '--offset', '-1'])).toBe(true);
  });

  it('rejects an unknown flag', () => {
    expect(parseSearchArgs(['q', '--bogus'])).toEqual({ error: 'Unknown flag: --bogus' });
  });

  it('parses --metadata and --no-extracts', () => {
    expect(parseSearchArgs(['q', '--metadata', 'basic', '--no-extracts'])).toEqual({
      queries: ['q'],
      metadata: 'basic',
      noExtracts: true,
    });
  });

  it('rejects an invalid --metadata value', () => {
    const parsed = parseSearchArgs(['q', '--metadata', 'dev']);
    expect('error' in parsed && parsed.error).toContain('basic, full');
  });
});

describe('buildSearchParams', () => {
  it('builds context-format params by default', () => {
    const params = buildSearchParams({ queries: ['cats'] }, 'context');
    expect(params.get('q')).toBe('cats');
    expect(params.get('format')).toBe('context');
    expect(params.get('searchMode')).toBeNull();
    expect(params.get('limit')).toBeNull();
  });

  it('forwards mode and limit when set', () => {
    const params = buildSearchParams({ queries: ['cats'], mode: 'balanced', limit: 20 }, 'json');
    expect(params.get('searchMode')).toBe('balanced');
    expect(params.get('limit')).toBe('20');
    expect(params.get('format')).toBe('json');
  });

  it('forwards effort when set, and omits it when absent', () => {
    expect(buildSearchParams({ queries: ['cats'], effort: 'max' }, 'json').get('effort')).toBe('max');
    expect(buildSearchParams({ queries: ['cats'] }, 'json').get('effort')).toBeNull();
  });

  it('sends multiple queries as a JSON array in q', () => {
    const params = buildSearchParams({ queries: ['a', 'b'] }, 'json');
    expect(params.get('q')).toBe('["a","b"]');
  });

  it('forwards every optional filter to its API param name', () => {
    const params = buildSearchParams(
      {
        queries: ['x'],
        offset: 10,
        country: 'DE',
        language: 'de',
        safe: 'strict',
        dateRange: '7d',
        includeDomains: 'a.com,b.com',
        excludeDomains: 'spam.com',
        content: true,
        maxContentLength: 4000,
      },
      'json'
    );
    expect(Object.fromEntries(params)).toMatchObject({
      offset: '10',
      country: 'DE',
      language: 'de',
      safe: 'strict',
      dateRange: '7d',
      includeDomains: 'a.com,b.com',
      excludeDomains: 'spam.com',
      content: 'true',
      maxContentLength: '4000',
    });
  });

  it('omits content entirely when the flag is absent', () => {
    expect(buildSearchParams({ queries: ['x'] }, 'json').get('content')).toBeNull();
  });

  it('defaults metadata=full for context format, matching the MCP tool self-call', () => {
    const params = buildSearchParams({ queries: ['cats'] }, 'context');
    expect(params.get('metadata')).toBe('full');
    expect(params.get('extracts')).toBeNull(); // API already defaults extracts=true for format=context
  });

  it('lets --metadata override the context-format default', () => {
    const params = buildSearchParams({ queries: ['cats'], metadata: 'basic' }, 'context');
    expect(params.get('metadata')).toBe('basic');
  });

  it('sends extracts=false only when --no-extracts is set on context format', () => {
    const params = buildSearchParams({ queries: ['cats'], noExtracts: true }, 'context');
    expect(params.get('extracts')).toBe('false');
  });

  it('does not default metadata or extracts for json format', () => {
    const params = buildSearchParams({ queries: ['cats'] }, 'json');
    expect(params.get('metadata')).toBeNull();
    expect(params.get('extracts')).toBeNull();
  });

  it('forwards an explicit --metadata even on json format', () => {
    const params = buildSearchParams({ queries: ['cats'], metadata: 'full' }, 'json');
    expect(params.get('metadata')).toBe('full');
  });
});
