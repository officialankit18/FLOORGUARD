import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, Laptop, Radio, Save, Server, Video, Database } from 'lucide-react';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { useMqttConnection } from '../hooks/useMqttConnection';
import { CameraService } from '../services/cameraService';
import { healthQuery } from '../services/dashboardData';

const statusStyle = (ok: boolean) => ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

export const SettingsPage: React.FC = () => {
  const { settings, save } = useFloorGuardSettings();
  const [draft, setDraft] = useState(settings);
  const [laptopAvailable, setLaptopAvailable] = useState(false);
  const health = useSyncExternalStore(healthQuery.subscribe, healthQuery.getSnapshot);
  const siteOnline = health.data?.status === 'ONLINE';
  const mongoStatus = health.data?.mongo || (health.error ? 'Offline' : 'Checking');
  const [saved, setSaved] = useState(false);
  const { webStatus, deviceStatus } = useMqttConnection(settings);

  useEffect(() => { CameraService.isCameraSupported().then(setLaptopAvailable); void healthQuery.load(); }, []);
  useEffect(() => { setDraft(settings); }, [settings]);
  const update = (key: keyof typeof draft, value: string) => setDraft(prev => ({ ...prev, [key]: value }));
  const submit = (event: React.FormEvent) => { event.preventDefault(); save(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2500); };
  const espConfigured = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(settings.espCameraIp);

  return <main className="mx-auto max-w-xl space-y-5 px-5 py-6">
    <div><p className="text-xs font-black uppercase tracking-[0.22em] text-fg-amber">System setup</p><h1 className="mt-2 text-3xl font-black">Settings</h1><p className="mt-2 text-sm text-fg-muted">Set up both cameras and MQTT once. Values stay in this browser.</p></div>
    <section className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><h2 className="text-lg font-black">Connection status</h2><div className="mt-4 space-y-3">
      <StatusRow icon={<Server className="h-5 w-5" />} label="Website & local API" value={siteOnline ? 'Connected' : 'Checking'} ok={siteOnline} />
      <StatusRow icon={<Database className="h-5 w-5" />} label="MongoDB Atlas history" value={mongoStatus} ok={mongoStatus === 'Connected'} />
      <StatusRow icon={<Video className="h-5 w-5" />} label="CAM 1 · ESP32-CAM" value={espConfigured ? 'IP configured' : 'IP needed'} ok={espConfigured} />
      <StatusRow icon={<Laptop className="h-5 w-5" />} label="CAM 2 · Laptop camera" value={laptopAvailable ? 'Available' : 'Permission/device needed'} ok={laptopAvailable} />
      <StatusRow icon={<Radio className="h-5 w-5" />} label="Website → MQTT broker" value={webStatus} ok={webStatus === 'Connected'} />
      <StatusRow icon={<Radio className="h-5 w-5" />} label="Door device → MQTT broker" value={deviceStatus} ok={deviceStatus === 'Connected'} />
    </div></section>
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><h2 className="text-lg font-black">Camera 1 · ESP32-CAM</h2><p className="mt-1 text-sm text-fg-muted">Enter only the local IP address shown by the ESP32-CAM, for example 10.251.4.193.</p><label className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-fg-muted">ESP32-CAM local IP<input value={draft.espCameraIp} onChange={(event) => update('espCameraIp', event.target.value.trim())} inputMode="decimal" placeholder="10.251.4.193" className="mt-2 w-full rounded-2xl border border-fg-line bg-fg-surface px-4 py-3 text-base font-semibold outline-none focus:border-fg-yellow" /></label></section>
      <section className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><h2 className="text-lg font-black">MQTT connection</h2><p className="mt-1 text-sm text-fg-muted">Use a restricted dashboard account. The web and ESP device can use separate credentials.</p><div className="mt-4 space-y-3">
        <Field label="WebSocket broker URL" value={draft.mqttUrl} onChange={(value) => update('mqttUrl', value)} placeholder="wss://broker.example.com/mqtt" />
        <Field label="Topic prefix" value={draft.mqttTopicPrefix} onChange={(value) => update('mqttTopicPrefix', value)} placeholder="floorguard/home-01" />
        <Field label="Dashboard username (optional)" value={draft.mqttUsername} onChange={(value) => update('mqttUsername', value)} placeholder="dashboard-user" />
        <Field label="Dashboard password (optional)" value={draft.mqttPassword} onChange={(value) => update('mqttPassword', value)} placeholder="••••••••" type="password" />
      </div></section>
      <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fg-yellow px-4 py-4 text-sm font-black text-fg-ink"><Save className="h-5 w-5" />Save settings</button>
      {saved && <p className="flex items-center justify-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Settings saved. MQTT will reconnect automatically.</p>}
    </form>
  </main>;
};

const StatusRow: React.FC<{ icon: React.ReactNode; label: string; value: string; ok: boolean }> = ({ icon, label, value, ok }) => <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg-surface px-4 py-3"><span className="flex items-center gap-3 text-sm font-bold">{icon}{label}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${statusStyle(ok)}`}>{value}</span></div>;
const Field: React.FC<{ label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }> = ({ label, value, onChange, placeholder, type = 'text' }) => <label className="block text-xs font-black uppercase tracking-[0.16em] text-fg-muted">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-fg-line bg-fg-surface px-4 py-3 text-base normal-case font-semibold outline-none focus:border-fg-yellow" /></label>;
