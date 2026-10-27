import { useCallback, useEffect, useState } from 'react';

export interface FloorGuardSettings {
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

export function useFloorGuardSettings() {
  const [settings, setSettings] = useState<FloorGuardSettings>(load);
  const save = useCallback((next: FloorGuardSettings) => { localStorage.setItem(KEY, JSON.stringify(next)); setSettings(next); }, []);
  useEffect(() => {
    fetch('/api/runtime-config')
      .then((res) => res.ok ? res.json() : null)
      .then((runtime: Partial<FloorGuardSettings> | null) => {
        if (!runtime) return;
        setSettings((current) => {
          const next = {
            ...current,
            mqttUrl: current.mqttUrl || runtime.mqttUrl || '',
            mqttUsername: current.mqttUsername || runtime.mqttUsername || '',
            mqttPassword: current.mqttPassword || runtime.mqttPassword || '',
            mqttTopicPrefix: current.mqttTopicPrefix || runtime.mqttTopicPrefix || '',
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          return next;
        });
      })
      .catch(() => {});
  }, []);
  return { settings, save };
}
