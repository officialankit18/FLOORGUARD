import { useEffect, useSyncExternalStore } from 'react';
import { normalizeRelayUrl } from '../services/cameraRelay';

export interface FloorGuardSettings {
  notifications?: { unknownFace: boolean; intrusion: boolean; deviceOffline: boolean; doorActivity: boolean };
  theme?: 'light' | 'dark';
  emergencyNumber?: string;
  floorCameraIp?: string;
  autoOpenDoor?: boolean;
  doorOpenValue?: 'unconfigured' | 'on' | 'off';
  espCameraIp: string;
  cameraRelayUrl?: string;
  mqttUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  mqttTopicPrefix: string;
}
const KEY = 'floorguard.settings.v1';
export const DEFAULT_NOTIFICATIONS = { unknownFace: true, intrusion: true, deviceOffline: true, doorActivity: false };
const DEFAULTS: FloorGuardSettings = { espCameraIp: '', mqttUrl: '', mqttUsername: '', mqttPassword: '', mqttTopicPrefix: '', notifications: DEFAULT_NOTIFICATIONS };
function load(): FloorGuardSettings {
  let saved = DEFAULTS;
  try { saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; saved.notifications = { ...DEFAULT_NOTIFICATIONS, ...saved.notifications }; } catch { /* Use defaults. */ }
  const relay = normalizeRelayUrl(new URLSearchParams(location.search).get('relay') || '');
  if (relay) {
    saved = { ...saved, cameraRelayUrl: relay };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* Session still works. */ }
  }
  return saved;
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
