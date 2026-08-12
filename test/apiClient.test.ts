import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, CliError } from '../src/apiClient.js';
import { CLI_VERSION } from '../src/version.js';

function mockFetchOnce(status: number, body: string, headers: Record<string, string> = {}) {
  const spy = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** The request headers of the Nth (default first) call the mocked fetch received. */
function sentHeaders(spy: ReturnType<typeof mockFetchOnce>, index = 0): Record<string, string> {
  const call = spy.mock.calls[index];
  if (!call) throw new Error('fetch was not called');
  return call[1].headers;
}

/** Runs the call and returns the CliError it threw (failing the test if it didn't throw). */
async function captureError(path = '/api/v1/search?q=x', key = 'key1'): Promise<CliError> {
  try {
    await apiGet(path, key);
  } catch (error) {
    return error as CliError;
  }
  throw new Error('expected apiGet to throw');
}

describe('apiGet', () => {
  beforeEach(() => {
    delete process.env.ANDI_API_BASE;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws auth_required (exit 3) with no key, before making a network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(apiGet('/api/v1/search?q=x', undefined)).rejects.toMatchObject({ code: 'auth_required', exitCode: 3 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the body text on 200', async () => {
    mockFetchOnce(200, '{"ok":true}');
    const result = await apiGet('/api/v1/search?q=x', 'key1');
    expect(result.text).toBe('{"ok":true}');
  });

  it('sends the CLI surface header and User-Agent by default', async () => {
    const spy = mockFetchOnce(200, 'ok');
    await apiGet('/api/v1/search?q=x', 'key1');
    expect(sentHeaders(spy)).toEqual({
      'x-api-key': 'key1',
      'x-andi-surface': 'cli',
      'User-Agent': `andi-cli/${CLI_VERSION}`,
    });
  });

  it('sends surface cli-mcp when the call comes from the stdio bridge', async () => {
    const spy = mockFetchOnce(200, 'ok');
    await apiGet('/api/v1/search?q=x', 'key1', { surface: 'cli-mcp' });
    expect(sentHeaders(spy)['x-andi-surface']).toBe('cli-mcp');
  });

  it('maps 401 to unauthorized (exit 3)', async () => {
    mockFetchOnce(401, '{"error":"Unauthorized"}');
    await expect(apiGet('/api/v1/search?q=x', 'bad-key')).rejects.toMatchObject({ code: 'unauthorized', exitCode: 3 });
  });

  it('maps 402 to payment_required (exit 4)', async () => {
    mockFetchOnce(402, '{"error":"Payment required"}');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'payment_required', exitCode: 4 });
  });

  it('maps 429 to rate_limited (exit 5) and includes retry-after', async () => {
    mockFetchOnce(429, '{"error":"rate limited"}', { 'retry-after': '30' });
    const error = await captureError();
    expect(error).toMatchObject({ code: 'rate_limited', exitCode: 5, retryable: true, retryAfterSeconds: 30 });
    expect(error.message).toContain('30');
  });

  it('maps 503 to a retryable service_unavailable (exit 7) carrying the API message and retry hint', async () => {
    mockFetchOnce(
      503,
      JSON.stringify({
        error: 'Content warming',
        message: 'The page is still being retrieved. Retry in 5s for the full content.',
        retry_after_seconds: 5,
      }),
      { 'retry-after': '5' }
    );
    const error = await captureError('/api/v1/fetch?url=https://example.com');
    expect(error).toMatchObject({
      code: 'service_unavailable',
      exitCode: 7,
      retryable: true,
      retryAfterSeconds: 5,
    });
    expect(error.message).toBe('The page is still being retrieved. Retry in 5s for the full content.');
  });

  it('falls back to the Retry-After header when the 503 body carries no hint', async () => {
    mockFetchOnce(503, JSON.stringify({ error: 'Service unavailable' }), { 'retry-after': '12' });
    const error = await captureError();
    expect(error).toMatchObject({ code: 'service_unavailable', retryAfterSeconds: 12, retryable: true });
    expect(error.message).toContain('Retry in 12s');
  });

  it.each([408, 504])('maps %i to a retryable service_unavailable (exit 7)', async (status) => {
    mockFetchOnce(status, 'gateway timeout');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({
      code: 'service_unavailable',
      exitCode: 7,
      retryable: true,
    });
  });

  it('maps 422 to a non-retryable unprocessable (exit 8) surfacing the page-level reason', async () => {
    mockFetchOnce(
      422,
      JSON.stringify({ error: 'Unprocessable content', message: 'The page does not exist at that URL.', reason: 'not_found' })
    );
    const error = await captureError('/api/v1/fetch?url=https://example.com/missing');
    expect(error).toMatchObject({
      code: 'unprocessable',
      exitCode: 8,
      retryable: false,
      reason: 'not_found',
    });
    expect(error.message).toBe('The page does not exist at that URL.');
  });

  it('degrades gracefully when a 422 body is not JSON', async () => {
    mockFetchOnce(422, '<html>nope</html>');
    const error = await captureError();
    expect(error).toMatchObject({ code: 'unprocessable', exitCode: 8, reason: undefined });
    expect(error.message).toContain('could not be fetched');
  });

  it('maps 400 to bad_request (exit 2)', async () => {
    mockFetchOnce(400, 'bad request body');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'bad_request', exitCode: 2 });
  });

  it('maps other non-ok statuses to request_failed (exit 1)', async () => {
    mockFetchOnce(500, 'server error');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'request_failed', exitCode: 1 });
  });

  it('respects ANDI_API_BASE', async () => {
    process.env.ANDI_API_BASE = 'http://localhost:3010';
    const spy = mockFetchOnce(200, 'ok');
    await apiGet('/api/v1/search?q=x', 'key1');
    expect(spy).toHaveBeenCalledWith('http://localhost:3010/api/v1/search?q=x', expect.any(Object));
  });
});
