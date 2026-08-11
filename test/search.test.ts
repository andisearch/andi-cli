import { describe, expect, it } from 'vitest';
import { buildSearchParams, parseSearchArgs } from '../src/search.js';

describe('parseSearchArgs', () => {
  it('parses a bare query', () => {
    const parsed = parseSearchArgs(['hello world']);
    expect(parsed).toEqual({ query: 'hello world', mode: undefined, limit: undefined, json: false, apiKey: undefined });
  });

  it('parses all flags', () => {
    const parsed = parseSearchArgs(['test', '--mode', 'deep', '--limit', '5', '--json', '--api-key', 'k1']);
    expect(parsed).toEqual({ query: 'test', mode: 'deep', limit: 5, json: true, apiKey: 'k1' });
  });

  it('rejects a missing query', () => {
    const parsed = parseSearchArgs(['--json']);
    expect(parsed).toEqual({ error: 'Missing required argument: <query>' });
  });

  it('rejects an invalid --mode value and enumerates the valid set', () => {
    const parsed = parseSearchArgs(['q', '--mode', 'nonsense']);
    expect('error' in parsed && parsed.error).toContain('auto, low-cost, fast, balanced, deep, exhaustive');
  });

  it('rejects an invalid --limit value', () => {
    const parsed = parseSearchArgs(['q', '--limit', 'abc']);
    expect('error' in parsed).toBe(true);
  });

  it('rejects an unknown flag', () => {
    const parsed = parseSearchArgs(['q', '--bogus']);
    expect(parsed).toEqual({ error: 'Unknown flag: --bogus' });
  });

  it('rejects a second positional argument', () => {
    const parsed = parseSearchArgs(['first', 'second']);
    expect('error' in parsed).toBe(true);
  });
});

describe('buildSearchParams', () => {
  it('builds context-format params by default', () => {
    const params = buildSearchParams({ query: 'cats', json: false }, 'context');
    expect(params.get('q')).toBe('cats');
    expect(params.get('format')).toBe('context');
    expect(params.get('searchMode')).toBeNull();
    expect(params.get('limit')).toBeNull();
  });

  it('forwards mode and limit when set', () => {
    const params = buildSearchParams({ query: 'cats', mode: 'balanced', limit: 20, json: true }, 'json');
    expect(params.get('searchMode')).toBe('balanced');
    expect(params.get('limit')).toBe('20');
    expect(params.get('format')).toBe('json');
  });
});
