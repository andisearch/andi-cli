import { describe, expect, it } from 'vitest';
import { buildFetchParams, parseFetchArgs } from '../src/fetch.js';

describe('parseFetchArgs', () => {
  it('parses a bare url', () => {
    const parsed = parseFetchArgs(['https://example.com']);
    expect(parsed).toEqual({ url: 'https://example.com', maxContentLength: undefined, json: false, apiKey: undefined });
  });

  it('allows a missing url (stdin fallback is handled by the caller)', () => {
    const parsed = parseFetchArgs(['--json']);
    expect(parsed).toEqual({ url: undefined, maxContentLength: undefined, json: true, apiKey: undefined });
  });

  it('parses --max-content-length', () => {
    const parsed = parseFetchArgs(['https://example.com', '--max-content-length', '1000']);
    expect('error' in parsed).toBe(false);
    expect((parsed as { maxContentLength?: number }).maxContentLength).toBe(1000);
  });

  it('rejects a non-numeric --max-content-length', () => {
    const parsed = parseFetchArgs(['https://example.com', '--max-content-length', 'lots']);
    expect('error' in parsed).toBe(true);
  });

  it('rejects an unknown flag', () => {
    const parsed = parseFetchArgs(['https://example.com', '--bogus']);
    expect(parsed).toEqual({ error: 'Unknown flag: --bogus' });
  });
});

describe('buildFetchParams', () => {
  it('builds params with format and url', () => {
    const params = buildFetchParams({ url: 'https://example.com' }, 'context');
    expect(params.get('url')).toBe('https://example.com');
    expect(params.get('format')).toBe('context');
    expect(params.get('maxContentLength')).toBeNull();
  });

  it('forwards maxContentLength when set', () => {
    const params = buildFetchParams({ url: 'https://example.com', maxContentLength: 5000 }, 'json');
    expect(params.get('maxContentLength')).toBe('5000');
  });
});
