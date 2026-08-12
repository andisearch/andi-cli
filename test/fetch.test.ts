import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFetchParams, parseFetchArgs, runFetch } from '../src/fetch.js';
import { EXIT_CODES } from '../src/output.js';

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

  it('parses --no-retry', () => {
    expect(parseFetchArgs(['https://example.com', '--no-retry'])).toEqual({
      url: 'https://example.com',
      noRetry: true,
    });
  });

  it('parses --retry-max', () => {
    expect(parseFetchArgs(['https://example.com', '--retry-max', '10'])).toEqual({
      url: 'https://example.com',
      retryMaxSeconds: 10,
    });
  });

  it('rejects a negative --retry-max', () => {
    expect('error' in parseFetchArgs(['https://example.com', '--retry-max', '-5'])).toBe(true);
  });

  it('rejects a non-numeric --retry-max', () => {
    expect('error' in parseFetchArgs(['https://example.com', '--retry-max', 'lots'])).toBe(true);
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

/** A fetch response queue: each call consumes the next entry, sticking on the last once exhausted. */
function mockFetchSequence(responses: Array<{ status: number; body: string; headers?: Record<string, string> }>) {
  let call = 0;
  const spy = vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call++;
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      text: async () => r.body,
      headers: { get: (name: string) => (r.headers ?? {})[name.toLowerCase()] ?? null },
    };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('runFetch retry loop', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a 503 "content warming" response and succeeds once the page is ready', async () => {
    const spy = mockFetchSequence([
      { status: 503, body: JSON.stringify({ message: 'warming', retry_after_seconds: 0.01 }) },
      { status: 200, body: JSON.stringify({ content: 'page content' }) },
    ]);
    const code = await runFetch(['https://example.com', '--api-key', 'k', '--json']);
    expect(code).toBe(EXIT_CODES.ok);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('retrying'));
  });

  it('preserves exit code 7 once retries are exhausted (still warming)', async () => {
    // Always 503 with a small hint — exhausts on the 3-attempt cap, not the (default 30s) budget.
    const spy = mockFetchSequence([{ status: 503, body: JSON.stringify({ retry_after_seconds: 0.01 }) }]);
    const code = await runFetch(['https://example.com', '--api-key', 'k', '--json']);
    expect(code).toBe(EXIT_CODES.service_unavailable);
    expect(spy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries, then gives up
  });

  it('--no-retry fails on the first 503 without waiting', async () => {
    const spy = mockFetchSequence([{ status: 503, body: JSON.stringify({ retry_after_seconds: 5 }) }]);
    const start = Date.now();
    const code = await runFetch(['https://example.com', '--api-key', 'k', '--json', '--no-retry']);
    expect(Date.now() - start).toBeLessThan(500);
    expect(code).toBe(EXIT_CODES.service_unavailable);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('--retry-max caps cumulative wait, never sleeping past the remaining budget', async () => {
    // Retry-after asks for 100s every time; a 0.02s budget must clamp the sleep, not honor it.
    const spy = mockFetchSequence([{ status: 503, body: JSON.stringify({ retry_after_seconds: 100 }) }]);
    const start = Date.now();
    const code = await runFetch(['https://example.com', '--api-key', 'k', '--json', '--retry-max', '0.02']);
    const elapsed = Date.now() - start;
    expect(code).toBe(EXIT_CODES.service_unavailable);
    expect(elapsed).toBeLessThan(1000); // would be ~100s+ if the hint were honored unclamped
    expect(spy.mock.calls.length).toBeLessThan(3); // budget exhausted before the 3-attempt cap
  });
});
