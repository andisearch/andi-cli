import { describe, expect, it } from 'vitest';
import { buildFetchParams, parseFetchArgs } from '../src/fetch.js';

describe('parseFetchArgs', () => {
  it('parses a bare url', () => {
    expect(parseFetchArgs(['https://example.com'])).toEqual({ url: 'https://example.com' });
  });

  it('allows a missing url (stdin fallback is handled by the caller)', () => {
    expect(parseFetchArgs(['--json'])).toEqual({ format: 'json' });
  });

  it('parses --max-content-length', () => {
    const parsed = parseFetchArgs(['https://example.com', '--max-content-length', '1000']);
    expect(parsed).toEqual({ url: 'https://example.com', maxContentLength: 1000 });
  });

  it('parses --query for query-focused extracts', () => {
    const parsed = parseFetchArgs(['https://example.com', '--query', 'what is the refund policy']);
    expect(parsed).toEqual({ url: 'https://example.com', query: 'what is the refund policy' });
  });

  it('parses --format', () => {
    expect(parseFetchArgs(['https://example.com', '--format', 'markdown'])).toEqual({
      url: 'https://example.com',
      format: 'markdown',
    });
  });

  it('rejects an invalid --format value', () => {
    const parsed = parseFetchArgs(['https://example.com', '--format', 'yaml']);
    expect('error' in parsed && parsed.error).toContain('auto, json, markdown');
  });

  it('rejects a non-numeric --max-content-length', () => {
    expect('error' in parseFetchArgs(['https://example.com', '--max-content-length', 'lots'])).toBe(true);
  });

  it('rejects an unknown flag', () => {
    expect(parseFetchArgs(['https://example.com', '--bogus'])).toEqual({ error: 'Unknown flag: --bogus' });
  });
});

describe('buildFetchParams', () => {
  it('builds params with format and url', () => {
    const params = buildFetchParams({ url: 'https://example.com' }, 'context');
    expect(params.get('url')).toBe('https://example.com');
    expect(params.get('format')).toBe('context');
    expect(params.get('maxContentLength')).toBeNull();
    expect(params.get('query')).toBeNull();
  });

  it('forwards maxContentLength and query when set', () => {
    const params = buildFetchParams({ url: 'https://example.com', query: 'pricing', maxContentLength: 5000 }, 'json');
    expect(params.get('maxContentLength')).toBe('5000');
    expect(params.get('query')).toBe('pricing');
  });
});
