const DEFAULT_INTERVAL_MS = 9 * 60 * 1000;

function keepAliveTarget() {
  const explicit = process.env.KEEP_ALIVE_URL?.trim();
  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  const base = explicit || (renderUrl ? `${renderUrl.replace(/\/$/, '')}/api/keepalive` : '');
  if (!base) return '';
  try {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Keeps the Render web service receiving occasional inbound traffic.
 * Render Free services sleep after 15 minutes without inbound HTTP/WebSocket traffic.
 * This is opt-out on Render because RENDER_EXTERNAL_URL is supplied automatically;
 * local development stays disabled unless KEEP_ALIVE_URL is explicitly provided.
 */
export function startKeepAlive() {
  if (process.env.KEEP_ALIVE_ENABLED === 'false') return () => undefined;
  const target = keepAliveTarget();
  if (!target) return () => undefined;

  const configured = Number(process.env.KEEP_ALIVE_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const intervalMs = Number.isFinite(configured) ? Math.max(60_000, Math.min(configured, 14 * 60 * 1000)) : DEFAULT_INTERVAL_MS;
  let stopped = false;

  const ping = async () => {
    if (stopped) return;
    try {
      const response = await fetch(target, { headers: { 'x-floorguard-keepalive': '1' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!response.ok) console.warn(`[KeepAlive] ${response.status} from ${target}`);
    } catch (error) {
      console.warn('[KeepAlive] Request failed:', error instanceof Error ? error.message : 'unknown error');
    }
  };

  const timer = setInterval(() => { void ping(); }, intervalMs);
  void ping();
  console.log(`[KeepAlive] Enabled every ${Math.round(intervalMs / 60000)} minutes.`);
  return () => { stopped = true; clearInterval(timer); };
}
