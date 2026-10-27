import { useEffect, useSyncExternalStore } from 'react';

export interface FloorGuardSettings {
  theme?: 'light' | 'dark';
  emergencyNumber?: string;
  floorCameraIp?: string;
  autoOpenDoor?: boolean;
  doorOpenValue?: 'unconfigured' | 'on' | 'off';
  espCameraIp: string;
  mqttUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  mqttTopicPrefix: string;
}
const KEY = 'floorguard.settings.v1';
const DEFAULTS: FloorGuardSettings = { espCameraIp: '', mqttUrl: '', mqttUsername: '', mqttPassword: '', mqttTopicPrefix: '' };
function load(): FloorGuardSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}
let settings = load();
let pending: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => settings;
export function saveSettings(next: FloorGuardSettings) {
  settings = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Private/storage-full browsers still work in memory. */ }
  listeners.forEach(listener => listener());
}
function loadRuntime() {
  if (loaded || pending) return;
  pending = fetch('/api/runtime-config').then(async response => {
    if (!response.ok) throw new Error('Configuration unavailable');
    const runtime: Partial<FloorGuardSettings> = await response.json();
    saveSettings({ ...settings,
      mqttUrl: settings.mqttUrl || runtime.mqttUrl || '',
      mqttUsername: settings.mqttUsername || runtime.mqttUsername || '',
      mqttPassword: settings.mqttPassword || runtime.mqttPassword || '',
      mqttTopicPrefix: settings.mqttTopicPrefix || runtime.mqttTopicPrefix || '',
    });
    loaded = true;
  }).catch(() => {}).finally(() => { pending = null; });
}
window.addEventListener('storage', event => {
  if (event.key === KEY) { settings = load(); listeners.forEach(listener => listener()); }
});
export function useFloorGuardSettings() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(loadRuntime, []);
  return { settings: current, save: saveSettings };
}
export const getSettings = getSnapshot;
