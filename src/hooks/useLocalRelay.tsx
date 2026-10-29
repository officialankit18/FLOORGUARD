import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeRelayUrl } from '../services/cameraRelay';
import { useFloorGuardSettings } from './useFloorGuardSettings';
import { useMqttConnection } from './useMqttConnection';

type RelayStatus = 'waiting' | 'permission-needed' | 'denied' | 'connecting' | 'live' | 'unavailable';
type CameraState = { esp32: boolean; laptop: boolean };
type RelayContextValue = { relayUrl: string; status: RelayStatus; cameras: CameraState; requestAccess: () => Promise<void>; hasAddress: boolean };
const RelayContext = createContext<RelayContextValue | null>(null);

async function checkRelay(url: string): Promise<CameraState> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const hostname = new URL(url).hostname;
    const targetAddressSpace = ['localhost', '127.0.0.1'].includes(hostname) ? 'loopback' : 'local';
    const request = new Request(`${url}/health`, { method: 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal, targetAddressSpace } as RequestInit & { targetAddressSpace: string });
    const response = await fetch(request);
    if (!response.ok) throw new Error('Relay is offline');
    const data = await response.json();
    if (data.service !== 'FLOORGUARD camera relay' || !data.cameras) throw new Error('Unexpected local service');
    return { esp32: !!data.cameras.esp32?.online, laptop: !!data.cameras.laptop?.online };
  } finally { window.clearTimeout(timeout); }
}

export function LocalRelayProvider({ children }: { children: ReactNode }) {
  const { settings } = useFloorGuardSettings();
  const { relayUrls } = useMqttConnection();
  const manual = normalizeRelayUrl(settings.cameraRelayUrl || '');
  const sameHost = normalizeRelayUrl(`http://${location.hostname}:3012`);
  const candidateKey = [...new Set([...relayUrls, manual, sameHost].filter(Boolean))].join('|');
  const candidates = useMemo(() => candidateKey ? candidateKey.split('|') : [], [candidateKey]);
  const [permission, setPermission] = useState<'checking' | 'granted' | 'prompt' | 'denied'>(location.protocol === 'https:' ? 'checking' : 'granted');
  const [status, setStatus] = useState<RelayStatus>('waiting');
  const [relayUrl, setRelayUrl] = useState('');
  const [cameras, setCameras] = useState<CameraState>({ esp32: false, laptop: false });

  useEffect(() => {
    if (location.protocol !== 'https:') return;
    let cancelled = false;
    let permissionStatus: PermissionStatus | undefined;
    void navigator.permissions?.query({ name: 'local-network' as PermissionName }).then(result => {
      if (cancelled) return;
      permissionStatus = result;
      setPermission(result.state);
      result.onchange = () => setPermission(result.state);
    }).catch(() => { if (!cancelled) setPermission('prompt'); });
    if (!navigator.permissions) setPermission('prompt');
    return () => { cancelled = true; if (permissionStatus) permissionStatus.onchange = null; };
  }, []);

  const findRelay = useCallback(async () => {
    for (const candidate of candidates) {
      try { return { url: candidate, cameras: await checkRelay(candidate) }; } catch { /* Try the next local interface. */ }
    }
    return null;
  }, [candidates]);

  useEffect(() => {
    if (!candidates.length) { setRelayUrl(''); setStatus('waiting'); return; }
    if (permission === 'checking') { setStatus('connecting'); return; }
    if (permission === 'prompt') { setRelayUrl(''); setStatus('permission-needed'); return; }
    if (permission === 'denied') { setRelayUrl(''); setStatus('denied'); return; }
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const found = await findRelay();
      pending = false;
      if (cancelled) return;
      setRelayUrl(found?.url || '');
      setCameras(previous => found && previous.esp32 === found.cameras.esp32 && previous.laptop === found.cameras.laptop ? previous : found?.cameras || { esp32: false, laptop: false });
      setStatus(found ? 'live' : 'unavailable');
    };
    setStatus('connecting');
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [candidateKey, candidates, findRelay, permission]);

  const requestAccess = useCallback(async () => {
    if (!candidates.length) return;
    setStatus('connecting');
    const found = await findRelay();
    if (found) {
      setRelayUrl(found.url);
      setCameras(found.cameras);
      setPermission('granted');
      setStatus('live');
    } else {
      setStatus('unavailable');
      if (location.protocol === 'https:' && navigator.permissions) {
        try {
          const result = await navigator.permissions.query({ name: 'local-network' as PermissionName });
          if (result.state === 'denied') { setPermission('denied'); setStatus('denied'); }
        } catch { /* Older browsers do not expose this permission. */ }
      }
    }
  }, [candidates.length, findRelay]);

  return <RelayContext.Provider value={{ relayUrl, status, cameras, requestAccess, hasAddress: candidates.length > 0 }}>{children}</RelayContext.Provider>;
}

export function useLocalRelay() {
  const value = useContext(RelayContext);
  if (!value) throw new Error('Local relay provider is missing');
  return value;
}
