/**
 * Output helpers — TTY-aware format selection and the JSON envelope.
 *
 * stdout carries data only; progress and errors go to stderr. `--json`
 * always wins; piped output (no TTY) defaults to JSON automatically.
 */

export interface EnvelopeError {
  code: string;
  message: string;
  hint?: string;
  retryable: boolean;
}

export interface Envelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: EnvelopeError | null;
  meta?: Record<string, unknown>;
}

/** Stable exit codes — documented in `--help` and `andi schema`. */
export const EXIT_CODES = {
  ok: 0,
  generic: 1,
  invalid_args: 2,
  auth: 3,
  payment: 4,
  rate_limit: 5,
  timeout: 6,
} as const;

export function wantsJson(flagJson: boolean): boolean {
  return flagJson || !process.stdout.isTTY;
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
