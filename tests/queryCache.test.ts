import { describe, it, expect, vi } from 'vitest';
import { QueryResource } from '../src/services/queryCache';

describe('shared query cache', () => {
  it('deduplicates concurrent requests and route remounts', async () => {
    const loader = vi.fn(async () => ['visitor']);
    const query = new QueryResource(loader);
    const first = query.load();
    expect(query.load()).toBe(first);
    await first;
    await query.load();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(query.getSnapshot().data).toEqual(['visitor']);
  });
  it('retains visible data throughout background refreshes and errors', async () => {
    const loader = vi.fn().mockResolvedValueOnce(['saved']).mockRejectedValueOnce(new Error('offline'));
    const query = new QueryResource<string[]>(loader);
    await query.load();
    const pending = query.load(true);
    expect(query.getSnapshot()).toMatchObject({ data: ['saved'], isLoading: false, isRefreshing: true });
    await pending;
    expect(query.getSnapshot()).toMatchObject({ data: ['saved'], error: 'offline', isLoading: false, isRefreshing: false });
  });
  it('does not overwrite a newer live reading with an older REST response', async () => {
    let resolve!: (value: number) => void;
    const query = new QueryResource(() => new Promise<number>(done => { resolve = done; }));
    const pending = query.load();
    query.update(() => 900);
    resolve(100);
    await pending;
    expect(query.getSnapshot().data).toBe(900);
  });
  it('refreshes expired data without clearing it', async () => {
    const loader = vi.fn(async () => 7);
    const query = new QueryResource(loader);
    await query.load();
    query.invalidate();
    await query.load();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(query.getSnapshot().data).toBe(7);
  });
  it('does not notify a page after it unsubscribes', async () => {
    const query = new QueryResource(async () => 1);
    const listener = vi.fn();
    const unsubscribe = query.subscribe(listener);
    unsubscribe();
    await query.load();
    expect(listener).not.toHaveBeenCalled();
  });
});
