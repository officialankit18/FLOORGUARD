const BUILD_VERSION = '__FG_BUILD_VERSION__';
const CACHE_PREFIX = 'floorguard-shell-';
const CACHE_NAME = CACHE_PREFIX + BUILD_VERSION;
const ASSET_CACHE = 'floorguard-static-v2';
const SHELL_ASSETS = /* __FG_SHELL_ASSETS__ */ ['/index.html'];

self.addEventListener('install', event => {
  // Only the small app shell is required; face models load when Camera opens.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(async names => {
    const old = names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    // Keep the previous build for an already-open tab's lazy imports.
    await Promise.all(old.slice(0, -1).map(name => caches.delete(name)));
    await self.clients.claim();
  }));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Live readings, credentials, private visitor images and controls stay online.
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const network = fetch(request).then(response => {
        if (response.ok) void cache.put('/index.html', response.clone());
        return response;
      });
      let timer;
      const fallback = new Promise(resolve => { timer = setTimeout(() => resolve(null), 2500); });
      try {
        const response = await Promise.race([network, fallback]);
        if (response) return response;
        const saved = await cache.match('/index.html');
        return saved || await network;
      } catch { return await cache.match('/index.html') || Response.error(); }
      finally { clearTimeout(timer); }
    })());
    return;
  }
  if (!/^\/(assets|icons|branding|models|sounds)\//.test(url.pathname)) return;
  event.respondWith((async () => {
    const shell = await caches.open(CACHE_NAME);
    const cached = await shell.match(request) || await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
      // Cap runtime assets; the build-specific shell has its own lifecycle.
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 80)).map(key => cache.delete(key)));
    }
    return response;
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => 'focus' in client);
    return existing ? existing.focus() : self.clients.openWindow('/');
  }));
});

self.addEventListener('push', event => {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appVisible = windows.some(client => client.visibilityState === 'visible');
    await self.registration.showNotification(payload.title || 'FLOORGUARD', {
      body: payload.body, tag: payload.id, silent: appVisible,
      icon: '/icons/icon-192-v2.png', image: payload.image, badge: '/icons/icon-192-v2.png',
      requireInteraction: !!payload.intrusion,
    });
  })());
});
