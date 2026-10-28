import { afterEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('mongodb', () => ({
  MongoClient: class {
    connect = mock.connect;
    close = vi.fn(async () => undefined);
  },
}));

import { closeMongo, getMongoStatus } from '../server/src/services/mongoPersistence';

describe('MongoDB connection recovery', () => {
  const original = process.env.MONGODB_URI;
  afterEach(async () => {
    await closeMongo();
    mock.connect.mockReset();
    if (original === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = original;
    vi.useRealTimers();
  });

  it('does not retry a failed TLS connection on every health request', async () => {
    vi.useFakeTimers();
    process.env.MONGODB_URI = 'mongodb://example.invalid';
    mock.connect.mockRejectedValue(new Error('TLS alert'));
    expect(await getMongoStatus()).toBe('Offline');
    expect(await getMongoStatus()).toBe('Offline');
    expect(mock.connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await getMongoStatus()).toBe('Offline');
    expect(mock.connect).toHaveBeenCalledTimes(2);
  });
});
