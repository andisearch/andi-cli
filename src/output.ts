/**
 * Output helpers — output-format selection and the JSON envelope.
 *
 * stdout carries data only; progress and errors go to stderr. `--format`
 * decides the shape: `json` and `markdown` are explicit and always win,
 * `auto` (the default) picks markdown on a TTY and JSON when piped.
 */

export interface EnvelopeError {
  code: string;
  message: string;
  hint?: string;
  retryable: boolean;
  /** 422 only: which page-level failure the API reported (not_found | blocked | unextractable). */
  reason?: string;
  /** 429/503 only: how long the API asked us to wait before retrying. */
  retryAfterSeconds?: number;
}

export interface Envelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: EnvelopeError | null;
  meta?: Record<string, unknown>;
}

/** Stable exit codes — documented in `--help`, `andi schema`, and README. */
export const EXIT_CODES = {
  ok: 0,
  generic: 1,
  invalid_args: 2,
  auth: 3,
  payment: 4,
  rate_limit: 5,
  timeout: 6,
  service_unavailable: 7,
  unprocessable: 8,
} as const;

/** `--format` values. `auto` resolves against stdout's TTY-ness at call time. */
export const FORMAT_CHOICES = ['auto', 'json', 'markdown'] as const;
export type FormatChoice = (typeof FORMAT_CHOICES)[number];

/**
 * Resolves the requested format to the concrete one. An explicit `json` or
 * `markdown` always wins, so `andi search x --format markdown > out.md`
 * writes markdown rather than silently switching to JSON on redirect.
 */
export function resolveFormat(choice: FormatChoice | undefined): 'json' | 'markdown' {
  if (choice === 'json' || choice === 'markdown') return choice;
  return process.stdout.isTTY ? 'markdown' : 'json';
}

export function ok<T>(data: T, meta?: Record<string, unknown>): Envelope<T> {
  return { ok: true, data, error: null, meta };
}

export function fail(error: EnvelopeError): Envelope<never> {
  return { ok: false, data: null, error };
}

export function printJson(envelope: Envelope): void {
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

export function printHuman(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}

export function printErrorLine(message: string): void {
  process.stderr.write((message.endsWith('\n') ? message : message + '\n'));
}
