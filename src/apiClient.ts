/**
 * Thin REST client for the Andi Search API. Every command hits the live API
 * directly — the CLI does no local computation of its own.
 */
import { resolveApiBase } from './config.js';
import { EXIT_CODES } from './output.js';
import { CLI_VERSION } from './version.js';

export const AUTH_HINT =
  'Get a key: https://console.andiai.com/signup — details: https://api.andiai.com/auth.md';

/**
 * Which Andi surface the call came from, sent as `x-andi-surface` and recorded
 * in the API's usage log. `cli` = a person or script running `andi search`/`andi fetch`;
 * `cli-mcp` = a tool call arriving through the local stdio MCP bridge (`andi mcp`).
 * The API allowlists exactly these two values for this client.
 */
export type Surface = 'cli' | 'cli-mcp';

export interface ApiGetOptions {
  timeoutMs?: number;
  surface?: Surface;
}

/** Carries the exit code + structured fields a caught error should surface as. */
export class CliError extends Error {
  code: string;
  exitCode: number;
  hint?: string;
  retryable: boolean;
  /** 422 only: the API's page-level failure reason (not_found | blocked | unextractable). */
  reason?: string;
  /** 429/503 only: the API's own retry hint, in seconds. */
  retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    exitCode: number,
    hint?: string,
    retryable = false,
    extra?: { reason?: string; retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
    this.hint = hint;
    this.retryable = retryable;
    this.reason = extra?.reason;
    this.retryAfterSeconds = extra?.retryAfterSeconds;
  }
}

export interface ApiResponse {
  status: number;
  text: string;
}

/** The error fields the API sends as JSON; absent/garbled bodies degrade to undefined. */
interface ApiErrorBody {
  message?: string;
  reason?: string;
  retry_after_seconds?: number;
}

function parseErrorBody(text: string): ApiErrorBody {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ApiErrorBody) : {};
  } catch {
    return {};
  }
}

/** Body hint first (the API states the specific cause), then the Retry-After header. */
function resolveRetryAfter(body: ApiErrorBody, response: Response): number | undefined {
  if (typeof body.retry_after_seconds === 'number') return body.retry_after_seconds;
  const header = Number(response.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header : undefined;
}

/** GET a path against ANDI_API_BASE with the resolved key, translating transport/HTTP failures. */
export async function apiGet(
  path: string,
  apiKey: string | undefined,
  options: ApiGetOptions = {}
): Promise<ApiResponse> {
  const { timeoutMs = 30000, surface = 'cli' } = options;

  if (!apiKey) {
    throw new CliError('auth_required', 'No API key found.', EXIT_CODES.auth, AUTH_HINT);
  }

  let response: Response;
  try {
    response = await fetch(`${resolveApiBase()}${path}`, {
      headers: {
        'x-api-key': apiKey,
        'x-andi-surface': surface,
        'User-Agent': `andi-cli/${CLI_VERSION}`,
      },
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
    const body = parseErrorBody(text);
    const retryAfterSeconds = resolveRetryAfter(body, response);
    throw new CliError(
      'rate_limited',
      `${body.message || 'Rate limit exceeded.'}${retryAfterSeconds ? ` Retry after ${retryAfterSeconds}s.` : ''}`,
      EXIT_CODES.rate_limit,
      undefined,
      true,
      { retryAfterSeconds }
    );
  }
  // Genuinely retryable server-side states. 503 covers both a warming page (the reader is
  // still retrieving, body carries retry_after_seconds) and a transient service outage;
  // 408/504 are timeouts upstream of us. All three retry cleanly — say so.
  if (response.status === 503 || response.status === 408 || response.status === 504) {
    const body = parseErrorBody(text);
    const retryAfterSeconds = resolveRetryAfter(body, response);
    const base = body.message || `The service is temporarily unavailable (HTTP ${response.status}).`;
    throw new CliError(
      'service_unavailable',
      retryAfterSeconds && !body.message ? `${base} Retry in ${retryAfterSeconds}s.` : base,
      EXIT_CODES.service_unavailable,
      undefined,
      true,
      { retryAfterSeconds }
    );
  }
  // 422: the PAGE failed, not the service — retrying the same URL is pointless.
  // `reason` (not_found | blocked | unextractable) is the actionable part.
  if (response.status === 422) {
    const body = parseErrorBody(text);
    throw new CliError(
      'unprocessable',
      body.message || 'The page could not be fetched or its content could not be extracted.',
      EXIT_CODES.unprocessable,
      undefined,
      false,
      { reason: body.reason }
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
