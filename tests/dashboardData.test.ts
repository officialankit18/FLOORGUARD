import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { SecurityEvent } from '../src/types/events';

const mocks = vi.hoisted(() => ({ getEvents: vi.fn(), getDevices: vi.fn() }));
vi.mock('../src/services/apiClient', () => ({ ApiClient: {
  getEvents: mocks.getEvents, getDevices: mocks.getDevices,
} }));
vi.mock('../src/services/liveConnection', () => ({ subscribeLive: vi.fn() }));
const event: SecurityEvent = {
  id: 'visitor-1', timestamp: '2026-10-28T01:00:00Z', eventType: 'Unknown Face',
  source: 'ESP32-CAM', description: 'Visitor at entrance', severity: 'warning',
  mode: 'LIVE_CONNECTED', acknowledged: false,
};

beforeEach(() => {
  vi.resetModules();
  mocks.getEvents.mockReset().mockResolvedValue({ success: true, data: [], total: 0, totalPages: 0, page: 1 });
});
describe('live history cache', () => {
  it('returns the same resource for equivalent filters', async () => {
    const { getEventsQuery } = await import('../src/services/dashboardData');
    expect(getEventsQuery({ severity: 'warning', mode: 'DEMO' })).toBe(getEventsQuery({ mode: 'DEMO', severity: 'warning' }));
  });
  it('deduplicates WebSocket and POST responses by event ID', async () => {
    const { getEventsQuery, upsertEvent } = await import('../src/services/dashboardData');
    const query = getEventsQuery();
    await query.load();
    upsertEvent(event);
    upsertEvent(event);
    expect(query.getSnapshot().data).toMatchObject({ data: [event], total: 1 });
  });
  it('keeps acknowledgements and filtered views consistent', async () => {
    const { getEventsQuery, upsertEvent } = await import('../src/services/dashboardData');
    const pending = getEventsQuery({ acknowledged: false });
    const all = getEventsQuery();
    await Promise.all([pending.load(), all.load()]);
    upsertEvent(event);
    upsertEvent({ ...event, acknowledged: true }, false);
    expect(pending.getSnapshot().data).toMatchObject({ data: [], total: 0 });
    expect(all.getSnapshot().data).toMatchObject({ data: [{ ...event, acknowledged: true }], total: 1 });
  });
});
