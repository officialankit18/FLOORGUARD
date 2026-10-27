import { afterEach, describe, it, expect, vi } from 'vitest';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('app-level live connection', () => {
  it('opens one socket per session and reconnects after a dropped connection', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn() });
    const sockets: any[] = [];
    const WebSocketMock = vi.fn(function (this: any, url: string) {
      this.url = url; this.readyState = 1; this.send = vi.fn(); this.close = vi.fn(); sockets.push(this);
    });
    Object.assign(WebSocketMock, { OPEN: 1 });
    vi.stubGlobal('WebSocket', WebSocketMock);
    const live = await import('../src/services/liveConnection');
    live.startLiveConnection();
    live.startLiveConnection();
    expect(WebSocketMock).toHaveBeenCalledTimes(1);
    expect(sockets[0].url).toBe('wss://example.test/ws');
    sockets[0].onopen();
    expect(live.getConnectionStatus()).toBe(true);
    const messageListener = vi.fn();
    const unsubscribe = live.subscribeLive(messageListener);
    sockets[0].onmessage({ data: JSON.stringify({ type: 'NEW_SECURITY_EVENT', data: { id: '1' } }) });
    expect(messageListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    sockets[0].onmessage({ data: JSON.stringify({ type: 'NEW_SECURITY_EVENT' }) });
    expect(messageListener).toHaveBeenCalledTimes(1);
    sockets[0].onclose();
    expect(live.getConnectionStatus()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(WebSocketMock).toHaveBeenCalledTimes(2);
  });
});
