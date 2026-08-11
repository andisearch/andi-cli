#!/usr/bin/env node
/**
 * `andi` — CLI entry point. Dispatches to search / fetch / mcp / schema.
 * Non-interactive by default: never hangs on stdin without a TTY (fetch's
 * stdin read is the one deliberate exception, gated on !isTTY itself).
 */
import { COMMANDS, EXIT_CODE_TABLE } from './commands.js';
import { runFetch } from './fetch.js';
import { printHelp } from './help.js';
import { runMcp } from './mcpServer.js';
import { EXIT_CODES, ok, printErrorLine, printHuman, printJson } from './output.js';
import { runSearch } from './search.js';
import { CLI_VERSION } from './version.js';

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;

  if (!command) {
    printHelp();
    return EXIT_CODES.invalid_args;
  }
  if (command === '--help' || command === '-h') {
    printHelp();
    return EXIT_CODES.ok;
  }
  if (command === '--version' || command === '-v') {
    printHuman(CLI_VERSION);
    return EXIT_CODES.ok;
  }

  switch (command) {
    case 'search':
      return runSearch(rest);
    case 'fetch':
      return runFetch(rest);
    case 'mcp':
      return runMcp(rest);
    case 'schema':
      printJson(ok({ version: CLI_VERSION, commands: COMMANDS, exitCodes: EXIT_CODE_TABLE }));
      return EXIT_CODES.ok;
    default:
      printErrorLine(`Unknown command: ${command}\nRun "andi --help" for usage.`);
      return EXIT_CODES.invalid_args;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    printErrorLine(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_CODES.generic);
  });
