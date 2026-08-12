/**
 * Shared error reporting: turns a caught error into the right exit code and
 * the right shape on the right stream (stderr for humans, stdout envelope
 * for JSON mode) — one place so every command reports errors identically.
 */
import { CliError } from './apiClient.js';
import { EXIT_CODES, fail, printErrorLine, printJson } from './output.js';

export function reportError(error: unknown, json: boolean): number {
  if (error instanceof CliError) {
    if (json) {
      printJson(
        fail({
          code: error.code,
          message: error.message,
          hint: error.hint,
          retryable: error.retryable,
          reason: error.reason,
          retryAfterSeconds: error.retryAfterSeconds,
        })
      );
    } else {
      printErrorLine(error.message);
      if (error.reason) printErrorLine(`Reason: ${error.reason}`);
      if (error.retryAfterSeconds) printErrorLine(`Retry after ${error.retryAfterSeconds}s.`);
      if (error.hint) printErrorLine(error.hint);
    }
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    printJson(fail({ code: 'internal_error', message, retryable: false }));
  } else {
    printErrorLine(message);
  }
  return EXIT_CODES.generic;
}
