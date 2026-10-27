import { createContext, createElement, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import type { MqttClient } from 'mqtt';
import { FloorGuardSettings, useFloorGuardSettings } from './useFloorGuardSettings';
import { ApiClient } from '../services/apiClient';

function useMqttSession(settings: FloorGuardSettings) {
  const [webStatus, setWebStatus] = useState<'Not configured' | 'Connecting' | 'Connected' | 'Error'>('Not configured');
  const [deviceStatus, setDeviceStatus] = useState<'Waiting' | 'Connected' | 'Offline'>('Waiting');
  const clientRef = useRef<MqttClient | null>(null);
  const pendingDoor = useRef<{ id: string; on: boolean; action: string; sentAt: number } | null>(null);
  const pendingStop = useRef<{ id: string; sentAt: number } | null>(null);
  const lastSeen = useRef(0);
  const [commandStatus, setCommandStatus] = useState('No pending door request');

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
      client.on('message', (_topic, payload, packet) => {
        try {
          const event = JSON.parse(payload.toString());
          if (!['door_state', 'buzzer_state', 'intrusion', 'status', 'heartbeat'].includes(event.type)) return;
          setDeviceStatus('Connected');
          lastSeen.current = Date.now();
          if (pendingStop.current && !packet.retain && event.type === 'buzzer_state' && event.on === false && event.requestId === pendingStop.current.id) {
            pendingStop.current = null; setCommandStatus('Controller confirmed the hardware alarm stopped.');
            void ApiClient.createEvent({eventType:'Alarm Stop Confirmed',source:'System Controller',severity:'success',mode:'LIVE_CONNECTED',description:'Controller acknowledged the hardware buzzer stop command.'}).catch(() => undefined);
          }
          const pending = pendingDoor.current;
          if (pending && !packet.retain && event.type === 'door_state' && event.on === pending.on && Date.now() - pending.sentAt < 15000) {
            pendingDoor.current = null;
            const correlated = event.requestId === pending.id;
            setCommandStatus(correlated ? `Controller confirmed the ${pending.action} command.` : `Controller reports the ${pending.action} signal. Physical door position is not measured.`);
            void ApiClient.createEvent({ eventType: 'Door Signal Confirmed', source: 'System Controller', severity: 'success', mode: 'LIVE_CONNECTED', description: correlated ? `Controller acknowledged the requested ${pending.action} signal.` : `${pending.action} signal reported after the request (legacy controller without request ID).` }).catch(() => undefined);
          }
        } catch { /* Ignore malformed broker payloads. */ }
      });
      client.on('close', () => { if (!cancelled) { setWebStatus('Error'); setDeviceStatus('Waiting'); } });
      client.on('error', () => { if (!cancelled) setWebStatus('Error'); });
    }).catch(() => { if (!cancelled) setWebStatus('Error'); });
    return () => { cancelled = true; activeClient?.end(true); };
  }, [settings.mqttUrl, settings.mqttUsername, settings.mqttPassword, settings.mqttTopicPrefix]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (lastSeen.current && Date.now() - lastSeen.current > 45000) setDeviceStatus('Waiting');
      if (pendingStop.current && Date.now() - pendingStop.current.sentAt >= 15000) {
        pendingStop.current = null; setCommandStatus('Phone alarm stopped. Hardware stop is unconfirmed; check device firmware and connection.');
      }
      if (pendingDoor.current && Date.now() - pendingDoor.current.sentAt >= 15000) {
        pendingDoor.current = null; setCommandStatus('No controller confirmation received. Check the device before retrying.');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const setDoor = useCallback((open: boolean) => {
    const prefix = settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '');
    if (!clientRef.current?.connected || !prefix || !settings.doorOpenValue || settings.doorOpenValue === 'unconfigured') return false;
    if (pendingDoor.current) return false;
    const id = crypto.randomUUID(), on = open ? settings.doorOpenValue === 'on' : settings.doorOpenValue !== 'on';
    const action = open ? 'opening' : 'closing';
    pendingDoor.current = { id, on, action, sentAt: Date.now() };
    setCommandStatus(`${open ? 'Opening' : 'Closing'} requested. Waiting for controller confirmation…`);
    clientRef.current.publish(`${prefix}/command`, JSON.stringify({ type: 'set_door', on, requestId: id, ts: new Date().toISOString() }), { qos: 1 });
    return true;
  }, [settings.mqttTopicPrefix, settings.doorOpenValue]);

  const openDoor = useCallback(() => setDoor(true), [setDoor]);
  const closeDoor = useCallback(() => setDoor(false), [setDoor]);

  const stopDeviceAlarm = useCallback(() => {
    if (!clientRef.current?.connected) return false;
    const id = crypto.randomUUID();
    pendingStop.current = { id, sentAt: Date.now() }; setCommandStatus('Phone alarm stopped. Waiting for hardware stop confirmation…');
    clientRef.current.publish(`${settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '')}/command`, JSON.stringify({ type: 'stop_alarm', requestId: id, ts: new Date().toISOString() }), { qos: 1 });
    return true;
  }, [settings.mqttTopicPrefix]);

  return { webStatus, deviceStatus, openDoor, closeDoor, stopDeviceAlarm, commandStatus };
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
