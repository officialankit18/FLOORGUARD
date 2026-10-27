import { useCallback, useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { FloorGuardSettings } from './useFloorGuardSettings';

export function useMqttConnection(settings: FloorGuardSettings) {
  const [webStatus, setWebStatus] = useState<'Not configured' | 'Connecting' | 'Connected' | 'Error'>('Not configured');
  const [deviceStatus, setDeviceStatus] = useState<'Waiting' | 'Connected' | 'Offline'>('Waiting');
  const clientRef = useRef<MqttClient | null>(null);

  useEffect(() => {
    clientRef.current?.end(true);
    clientRef.current = null;
    const prefix = settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '');
    if (!settings.mqttUrl || !prefix) { setWebStatus('Not configured'); setDeviceStatus('Waiting'); return; }
    setWebStatus('Connecting');
    const client = mqtt.connect(settings.mqttUrl, { username: settings.mqttUsername || undefined, password: settings.mqttPassword || undefined, reconnectPeriod: 3000, clean: true, connectTimeout: 10000 });
    clientRef.current = client;
    client.on('connect', () => { setWebStatus('Connected'); client.subscribe(`${prefix}/event`, { qos: 1 }); });
    client.on('message', () => setDeviceStatus('Connected'));
    client.on('close', () => setWebStatus('Error'));
    client.on('error', () => setWebStatus('Error'));
    return () => { client.end(true); };
  }, [settings.mqttUrl, settings.mqttUsername, settings.mqttPassword, settings.mqttTopicPrefix]);

  const openDoor = useCallback(() => {
    const prefix = settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '');
    if (!clientRef.current?.connected || !prefix) return false;
    clientRef.current.publish(`${prefix}/command`, JSON.stringify({ type: 'set_door', on: true, requestId: crypto.randomUUID(), ts: new Date().toISOString() }), { qos: 1 });
    return true;
  }, [settings.mqttTopicPrefix]);

  return { webStatus, deviceStatus, openDoor };
}
