import { useEffect, useState } from 'react';
import { normalizeRelayUrl } from '../../services/cameraRelay';

export function CameraRelaySettings({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [status, setStatus] = useState('Not configured');
  const url = normalizeRelayUrl(value);
  useEffect(() => {
    if (!url) { setStatus(value ? 'Enter a valid local Wi-Fi relay address' : 'Not configured'); return; }
    let stopped = false;
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]), cache: 'no-store' });
        if (!response.ok) throw new Error('offline');
        const data = await response.json();
        if (!data.cameras) throw new Error('invalid relay');
        if (!stopped) setStatus(`ESP32: ${data.cameras.esp32?.online ? 'Live' : 'Offline'} · Home laptop: ${data.cameras.laptop?.online ? 'Live' : 'Offline'}`);
      } catch { if (!stopped) setStatus('Relay unavailable — start the relay on your home laptop'); }
    };
    void check(); const timer = setInterval(check, 10000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [url, value]);
  return <section className="fg-card space-y-4"><h2>Local Wi-Fi camera relay</h2><p>Share the ESP32 and laptop cameras with phones connected to the same Wi-Fi. Keep this laptop and the relay running.</p><label className="block">Local relay address<input type="url" value={value} onChange={e => onChange(e.target.value.trim())} placeholder="http://172.22.188.45:3012" className="mt-2 w-full rounded-2xl border border-fg-line bg-fg-surface px-4 py-3" /></label><p role="status">{status}</p><p className="text-sm text-fg-muted">Use the LOCAL WI-FI CAMERAS address printed after starting the relay. It is not available outside your home Wi-Fi.</p></section>;
}
