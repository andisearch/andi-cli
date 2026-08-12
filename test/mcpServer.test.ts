import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { awaitShutdown, InFlightTracker, trackedHandler } from '../src/mcpServer.js';

/** A promise the test resolves by hand, standing in for an in-flight API call. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InFlightTracker', () => {
  it('drains immediately when nothing is in flight', async () => {
    const tracker = new InFlightTracker();
    await expect(tracker.drain(50)).resolves.toBe('drained');
    expect(tracker.isDraining).toBe(true);
  });

  it('waits for a pending call before reporting drained', async () => {
    const tracker = new InFlightTracker();
    const call = deferred<string>();
    tracker.track(call.promise);
    expect(tracker.pendingCount).toBe(1);

    const drained = tracker.drain(1000);
    let settled = false;
    void drained.then(() => {
      settled = true;
    });

    await tick();
    expect(settled).toBe(false);

    call.resolve('done');
    await expect(drained).resolves.toBe('drained');
  });

  it('gives up after the cap rather than hanging forever', async () => {
    const tracker = new InFlightTracker();
    tracker.track(deferred<string>().promise);
    await expect(tracker.drain(20)).resolves.toBe('timeout');
  });

  it('does not treat a rejected call as still in flight', async () => {
    const tracker = new InFlightTracker();
    tracker.track(Promise.reject(new Error('boom')).catch(() => 'handled'));
    await expect(tracker.drain(200)).resolves.toBe('drained');
  });
});

describe('trackedHandler', () => {
  it('runs the tool and registers it as in-flight work', async () => {
    const tracker = new InFlightTracker();
    const call = deferred<CallToolResult>();
    const handler = trackedHandler<{ q: string }>(tracker, () => call.promise, 'key1');

    const result = handler({ q: 'cats' });
    expect(tracker.pendingCount).toBe(1);
    call.resolve({ content: [{ type: 'text', text: 'ok' }], isError: false });
    await expect(result).resolves.toMatchObject({ isError: false });
  });

  it('refuses new calls once draining has started', async () => {
    const tracker = new InFlightTracker();
    const run = vi.fn();
    await tracker.drain(10);

    const result = await trackedHandler(tracker, run as never, 'key1')({});
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ isError: true });
    expect((result.content[0] as { text: string }).text).toContain('shutting down');
  });
});

describe('awaitShutdown', () => {
  it('waits for an in-flight tool call after the client closes stdin', async () => {
    const tracker = new InFlightTracker();
    const call = deferred<CallToolResult>();
    const stdin = new EventEmitter();
    // A tool call already running when the client dies: the API has been asked to do
    // the work (and bills for it), so shutdown must let it finish.
    trackedHandler(tracker, () => call.promise, 'key1')({});

    const shutdown = awaitShutdown(tracker, stdin, 1000);
    let exited = false;
    void shutdown.then(() => {
      exited = true;
    });

    stdin.emit('close');
    await tick();
    expect(exited).toBe(false);
    expect(tracker.isDraining).toBe(true);

    call.resolve({ content: [{ type: 'text', text: 'result' }], isError: false });
    await expect(shutdown).resolves.toBe(0);
  });

  it('exits immediately when nothing was in flight', async () => {
    const stdin = new EventEmitter();
    const shutdown = awaitShutdown(new InFlightTracker(), stdin, 1000);
    stdin.emit('close');
    await expect(shutdown).resolves.toBe(0);
  });

  it('reports a nonzero exit and says so on stderr when the cap expires', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const tracker = new InFlightTracker();
    const stdin = new EventEmitter();
    trackedHandler(tracker, () => deferred<CallToolResult>().promise, 'key1')({});

    const shutdown = awaitShutdown(tracker, stdin, 20);
    stdin.emit('close');
    await expect(shutdown).resolves.toBe(1);
    expect(stderr.mock.calls[0][0]).toContain('abandoned 1 in-flight request');
  });
});
