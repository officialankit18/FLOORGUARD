import { createContext, createElement, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import type { MqttClient } from 'mqtt';
import { FloorGuardSettings, useFloorGuardSettings } from './useFloorGuardSettings';

function useMqttSession(settings: FloorGuardSettings) {
  const [webStatus, setWebStatus] = useState<'Not configured' | 'Connecting' | 'Connected' | 'Error'>('Not configured');
  const [deviceStatus, setDeviceStatus] = useState<'Waiting' | 'Connected' | 'Offline'>('Waiting');
  const clientRef = useRef<MqttClient | null>(null);

  useEffect(() => {
    clientRef.current?.end(true);
    clientRef.current = null;
    const prefix = settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '');
    if (!settings.mqttUrl || !prefix) { setWebStatus('Not configured'); setDeviceStatus('Waiting'); return; }
    setWebStatus('Connecting');
    let cancelled = false;
    let activeClient: MqttClient | undefined;
    void import('mqtt').then(({ default: mqtt }) => {
      if (cancelled) return;
      const client = mqtt.connect(settings.mqttUrl, { username: settings.mqttUsername || undefined, password: settings.mqttPassword || undefined, reconnectPeriod: 3000, clean: true, connectTimeout: 10000 });
      activeClient = client;
      clientRef.current = client;
      client.on('connect', () => { setWebStatus('Connected'); client.subscribe(`${prefix}/event`, { qos: 1 }); });
      client.on('message', () => setDeviceStatus('Connected'));
      client.on('close', () => { if (!cancelled) setWebStatus('Error'); });
      client.on('error', () => { if (!cancelled) setWebStatus('Error'); });
    }).catch(() => { if (!cancelled) setWebStatus('Error'); });
    return () => { cancelled = true; activeClient?.end(true); };
  }, [settings.mqttUrl, settings.mqttUsername, settings.mqttPassword, settings.mqttTopicPrefix]);

  const openDoor = useCallback(() => {
    const prefix = settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '');
    if (!clientRef.current?.connected || !prefix) return false;
    clientRef.current.publish(`${prefix}/command`, JSON.stringify({ type: 'set_door', on: true, requestId: crypto.randomUUID(), ts: new Date().toISOString() }), { qos: 1 });
    return true;
  }, [settings.mqttTopicPrefix]);

  return { webStatus, deviceStatus, openDoor };
}

const MqttContext = createContext<ReturnType<typeof useMqttSession> | null>(null);
export function MqttProvider({ children }: { children: ReactNode }) {
  const { settings } = useFloorGuardSettings();
  const session = useMqttSession(settings);
  return createElement(MqttContext.Provider, { value: session }, children);
}
export function useMqttConnection(_settings?: FloorGuardSettings) {
  const session = useContext(MqttContext);
  if (!session) throw new Error('MQTT provider is missing');
  return session;
}
