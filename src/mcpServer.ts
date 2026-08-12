/**
 * `andi mcp` — native stdio MCP server. A thin bridge exposing the SAME two
 * tools as the hosted remote server (POST /mcp): andi_web_search and
 * andi_fetch_url. No local compute — each handler is a REST call to the
 * live API over HTTPS, authenticated with the caller's key. One tool
 * vocabulary whether a client speaks stdio (here) or Streamable HTTP
 * (the hosted endpoint). Schemas and descriptions live in ./toolDefs.ts.
 */
import type { EventEmitter } from 'node:events';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { apiGet, CliError } from './apiClient.js';
import { resolveApiKey } from './config.js';
import { EXIT_CODES } from './output.js';
import {
  buildFetchToolParams,
  buildSearchToolParams,
  FETCH_TOOL,
  SEARCH_TOOL,
  SERVER_INSTRUCTIONS,
  validateSearchToolArgs,
  type FetchToolArgs,
  type SearchToolArgs,
} from './toolDefs.js';
import { CLI_VERSION } from './version.js';

/** How long a shutdown waits for in-flight tool calls before abandoning them. */
export const DRAIN_TIMEOUT_MS = 30000;

/**
 * Keeps in-flight tool calls visible to shutdown.
 *
 * A killed MCP client closes stdin while a tool call is still running. Exiting
 * immediately does NOT cancel that call — the API has already been asked to do
 * the work and bills for it — it just throws the answer away. So on shutdown we
 * stop accepting new calls and wait for the ones already paid for, writing their
 * responses out if the transport is still open.
 */
export class InFlightTracker {
  private pending = new Set<Promise<unknown>>();
  private draining = false;

  get isDraining(): boolean {
    return this.draining;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise);
    // Settled either way: a rejected call is no longer in flight.
    void promise.catch(() => undefined).finally(() => this.pending.delete(promise));
    return promise;
  }

  /** Blocks new work, then waits for the current work up to `capMs`. */
  async drain(capMs = DRAIN_TIMEOUT_MS): Promise<'drained' | 'timeout'> {
    this.draining = true;
    if (this.pending.size === 0) return 'drained';

    let timer: NodeJS.Timeout | undefined;
    const capped = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), capMs);
      timer.unref?.();
    });
    const settled = Promise.allSettled([...this.pending]).then(() => 'drained' as const);
    const outcome = await Promise.race([settled, capped]);
    if (timer) clearTimeout(timer);
    return outcome;
  }
}

async function runSearchTool(args: SearchToolArgs, apiKey: string): Promise<CallToolResult> {
  const invalid = validateSearchToolArgs(args);
  if (invalid) return { content: [{ type: 'text', text: invalid }], isError: true };
  return callAndWrap(`/api/v1/search?${buildSearchToolParams(args).toString()}`, apiKey, 'Search');
}

async function runFetchTool(args: FetchToolArgs, apiKey: string): Promise<CallToolResult> {
  return callAndWrap(`/api/v1/fetch?${buildFetchToolParams(args).toString()}`, apiKey, 'Fetch');
}

/** Runs the REST call and translates outcomes into a CallToolResult — never a thrown protocol error. */
async function callAndWrap(path: string, apiKey: string, label: string): Promise<CallToolResult> {
  try {
    // surface=cli-mcp: this call arrived through the stdio bridge, not a direct CLI invocation.
    const { text } = await apiGet(path, apiKey, { surface: 'cli-mcp' });
    return { content: [{ type: 'text', text }], isError: false };
  } catch (error) {
    const message = error instanceof CliError ? error.message : error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `${label} failed: ${message}` }], isError: true };
  }
}

const SHUTTING_DOWN: CallToolResult = {
  content: [{ type: 'text', text: 'Server is shutting down and is not accepting new requests.' }],
  isError: true,
};

/**
 * Wraps a tool handler so shutdown can see it: refuses new calls once draining
 * has started, and registers everything else as in-flight work to wait for.
 */
export function trackedHandler<A>(
  tracker: InFlightTracker,
  run: (args: A, key: string) => Promise<CallToolResult>,
  apiKey: string
): (args: A) => Promise<CallToolResult> {
  return (args: A) =>
    tracker.isDraining ? Promise.resolve(SHUTTING_DOWN) : tracker.track(run(args, apiKey));
}

export function buildServer(apiKey: string, tracker: InFlightTracker): McpServer {
  const server = new McpServer(
    { name: 'andi-cli', title: 'Andi Web Search (CLI)', version: CLI_VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );

  // Untyped invocation: matches the same TS2589 workaround used by the hosted server
  // (src/routes/mcp.ts in andi-search-api) — registerTool's generics hit "excessively
  // deep" instantiation under strict mode with this schema shape.
  const registerTool = server.registerTool.bind(server) as (name: string, config: object, cb: unknown) => unknown;

  registerTool(SEARCH_TOOL.name, SEARCH_TOOL, trackedHandler<SearchToolArgs>(tracker, runSearchTool, apiKey));
  registerTool(FETCH_TOOL.name, FETCH_TOOL, trackedHandler<FetchToolArgs>(tracker, runFetchTool, apiKey));

  return server;
}

/**
 * Resolves once stdin closes AND the in-flight work has drained (or the cap
 * expired). The transport stays open through the drain so completed calls still
 * write their responses when the client's pipe survived it.
 */
export async function awaitShutdown(
  tracker: InFlightTracker,
  stdin: EventEmitter,
  capMs = DRAIN_TIMEOUT_MS
): Promise<number> {
  await new Promise<void>((resolve) => stdin.once('close', () => resolve()));
  const outcome = await tracker.drain(capMs);
  if (outcome === 'timeout') {
    process.stderr.write(`Shutdown: abandoned ${tracker.pendingCount} in-flight request(s) after ${capMs}ms.\n`);
    return EXIT_CODES.generic;
  }
  return EXIT_CODES.ok;
}

export async function runMcp(argv: string[]): Promise<number> {
  let apiKey: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--api-key') apiKey = argv[++i];
  }
  const key = resolveApiKey(apiKey);
  if (!key) {
    process.stderr.write('No API key found. Set ANDI_API_KEY, pass --api-key, or write ~/.andi/config.json.\n');
    return EXIT_CODES.auth;
  }

  const tracker = new InFlightTracker();
  const server = buildServer(key, tracker);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const code = await awaitShutdown(tracker, process.stdin);
  await server.close().catch(() => undefined);
  return code;
}
