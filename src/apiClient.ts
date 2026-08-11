/**
 * Thin REST client for the Andi Search API. Every command hits the live API
 * directly — the CLI does no local computation of its own.
 */
import { resolveApiBase } from './config.js';
import { EXIT_CODES } from './output.js';

export const AUTH_HINT =
  'Get a key: https://console.andiai.com/signup — details: https://api.andiai.com/auth.md';

/** Carries the exit code + structured fields a caught error should surface as. */
export class CliError extends Error {
  code: string;
  exitCode: number;
  hint?: string;
  retryable: boolean;

  constructor(code: string, message: string, exitCode: number, hint?: string, retryable = false) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
    this.hint = hint;
    this.retryable = retryable;
  }
}

export interface ApiResponse {
  status: number;
  text: string;
}

/** GET a path against ANDI_API_BASE with the resolved key, translating transport/HTTP failures. */
export async function apiGet(path: string, apiKey: string | undefined, timeoutMs = 30000): Promise<ApiResponse> {
  if (!apiKey) {
    throw new CliError('auth_required', 'No API key found.', EXIT_CODES.auth, AUTH_HINT);
  }

  let response: Response;
  try {
    response = await fetch(`${resolveApiBase()}${path}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new CliError('timeout', `Request timed out after ${timeoutMs}ms.`, EXIT_CODES.timeout, undefined, true);
    }
    throw new CliError(
      'network_error',
      error instanceof Error ? error.message : String(error),
      EXIT_CODES.generic,
      undefined,
      true
    );
  }

  const text = await response.text();

  if (response.status === 401) {
    throw new CliError('unauthorized', 'Invalid or missing API key.', EXIT_CODES.auth, AUTH_HINT);
  }
  if (response.status === 402) {
    throw new CliError(
      'payment_required',
      'API credit balance exhausted.',
      EXIT_CODES.payment,
      'Top up at https://console.andiai.com'
    );
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    throw new CliError(
      'rate_limited',
      `Rate limit exceeded.${retryAfter ? ` Retry after ${retryAfter}s.` : ''}`,
      EXIT_CODES.rate_limit,
      undefined,
      true
    );
  }
  if (response.status === 400) {
    throw new CliError('bad_request', text.slice(0, 500) || 'Bad request.', EXIT_CODES.invalid_args);
  }
  if (!response.ok) {
    throw new CliError('request_failed', `Request failed (HTTP ${response.status}): ${text.slice(0, 500)}`, EXIT_CODES.generic);
  }

  return { status: response.status, text };
}
