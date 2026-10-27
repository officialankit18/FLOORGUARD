import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

describe('PWA assets and offline behavior', () => {
  it('supplies real 192/512 PNGs and separate maskable icons', () => {
    const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
    for (const size of [192, 512]) for (const purpose of ['any', 'maskable']) {
      const icon = manifest.icons.find((item: any) => item.sizes === `${size}x${size}` && item.purpose === purpose);
      expect(icon).toBeDefined();
      const png = fs.readFileSync('public' + icon.src);
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(png.length).toBeLessThan(100_000);
    }
  });
  it('uses vector paths instead of embedded bitmaps or system fonts', () => {
    const svg = fs.readFileSync('public/branding/floorguard-wordmark.svg', 'utf8');
    expect(svg).toContain('<path');
    expect(svg).toContain('SMART ANTI-THEFT FLOOR MAT');
    expect(svg).not.toMatch(/<image|<text|data:image/);
  });
  it('falls back to the cached shell offline and never intercepts API data', async () => {
    const handlers: Record<string, Function> = {};
    const savedPage = { ok: true, cached: true };
    const cache = { match: vi.fn(async () => savedPage) };
    vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
      self: { location: { origin: 'https://example.test' }, addEventListener: (name: string, handler: Function) => { handlers[name] = handler; } },
      caches: { open: async () => cache },
      fetch: async () => { throw new Error('offline'); },
      URL, Response, setTimeout, clearTimeout,
    });
    const respondWith = vi.fn();
    handlers.fetch({ request: { url: 'https://example.test/api/events', method: 'GET' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    handlers.fetch({ request: { url: 'https://example.test/camera', method: 'GET', mode: 'navigate' }, respondWith });
    expect(await respondWith.mock.calls[0][0]).toBe(savedPage);
  });
});
