import { createContext, createElement, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import type { MqttClient } from 'mqtt';
import { FloorGuardSettings, useFloorGuardSettings } from './useFloorGuardSettings';
import { ApiClient } from '../services/apiClient';
import { normalizeRelayUrl } from '../services/cameraRelay';

function useMqttSession(settings: FloorGuardSettings) {
  const [webStatus, setWebStatus] = useState<'Not configured' | 'Connecting' | 'Connected' | 'Error'>('Not configured');
  const [deviceStatus, setDeviceStatus] = useState<'Waiting' | 'Connected' | 'Offline'>('Waiting');
  const clientRef = useRef<MqttClient | null>(null);
  const pendingDoor = useRef<{ id: string; on: boolean; action: string; sentAt: number } | null>(null);
  const pendingStop = useRef<{ id: string; sentAt: number } | null>(null);
  const lastSeen = useRef(0);
  const [commandStatus, setCommandStatus] = useState('No pending door request');
  const [doorSignal, setReportedDoorSignal] = useState<boolean | null>(null);
  const [relayUrls, setRelayUrls] = useState<string[]>([]);
  const relaySeenAt = useRef(0);

  useEffect(() => {
    clientRef.current?.end(true);
    clientRef.current = null;
    setReportedDoorSignal(null);
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
      client.on('connect', () => { setWebStatus('Connected'); client.subscribe([`${prefix}/event`, `${prefix}/camera_relay`], { qos: 1 }); });
      client.on('message', (_topic, payload, packet) => {
        try {
          if (_topic === `${prefix}/camera_relay`) {
            const announcement = JSON.parse(payload.toString());
            if (!Number.isFinite(announcement.at) || Math.abs(Date.now() - announcement.at) > 45000 || !Array.isArray(announcement.urls)) return;
            const urls = announcement.urls.slice(0, 5).map((item: unknown) => typeof item === 'string' ? normalizeRelayUrl(item) : '').filter((item: string) => item && !/\/\/(?:localhost|127\.0\.0\.1)(?::|$)/.test(item));
            relaySeenAt.current = Date.now();
            setRelayUrls(previous => JSON.stringify(previous) === JSON.stringify(urls) ? previous : urls);
            return;
          }
          const event = JSON.parse(payload.toString());
          if (!['door_state', 'buzzer_state', 'intrusion', 'status', 'heartbeat'].includes(event.type)) return;
          setDeviceStatus('Connected');
          lastSeen.current = Date.now();
          if (event.type === 'door_state' && typeof event.on === 'boolean') setReportedDoorSignal(event.on);
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
      client.on('close', () => { if (!cancelled) { setWebStatus('Error'); setDeviceStatus('Waiting'); setReportedDoorSignal(null); } });
      client.on('error', () => { if (!cancelled) setWebStatus('Error'); });
    }).catch(() => { if (!cancelled) setWebStatus('Error'); });
    return () => { cancelled = true; activeClient?.end(true); };
  }, [settings.mqttUrl, settings.mqttUsername, settings.mqttPassword, settings.mqttTopicPrefix]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (relaySeenAt.current && Date.now() - relaySeenAt.current > 45000) { relaySeenAt.current = 0; setRelayUrls([]); }
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

  const sendDoorSignal = useCallback((on: boolean, action: string) => {
    const prefix = settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '');
    if (!clientRef.current?.connected || !prefix) { setCommandStatus('Connect MQTT before sending a door command.'); return false; }
    if (pendingDoor.current) { setCommandStatus('Waiting for the previous door command to finish.'); return false; }
    const id = crypto.randomUUID();
    pendingDoor.current = { id, on, action, sentAt: Date.now() };
    setCommandStatus(`Door ${action} requested. Waiting for controller confirmation…`);
    clientRef.current.publish(`${prefix}/command`, JSON.stringify({ type: 'set_door', on, requestId: id, ts: new Date().toISOString() }), { qos: 1, retain: false }, error => {
      if (error && pendingDoor.current?.id === id) {
        pendingDoor.current = null;
        setCommandStatus('Door command could not be sent. Check MQTT and retry.');
      }
    });
    return true;
  }, [settings.mqttTopicPrefix]);

  const setDoorSignal = useCallback((on: boolean) => sendDoorSignal(on, on ? 'ON' : 'OFF'), [sendDoorSignal]);
  const setDoor = useCallback((open: boolean) => {
    if (!settings.doorOpenValue || settings.doorOpenValue === 'unconfigured') return false;
    return sendDoorSignal(open ? settings.doorOpenValue === 'on' : settings.doorOpenValue !== 'on', open ? 'opening' : 'closing');
  }, [settings.doorOpenValue, sendDoorSignal]);

  const openDoor = useCallback(() => setDoor(true), [setDoor]);
  const closeDoor = useCallback(() => setDoor(false), [setDoor]);

  const stopDeviceAlarm = useCallback(() => {
    if (!clientRef.current?.connected) return false;
    const id = crypto.randomUUID();
    pendingStop.current = { id, sentAt: Date.now() }; setCommandStatus('Phone alarm stopped. Waiting for hardware stop confirmation…');
    clientRef.current.publish(`${settings.mqttTopicPrefix.replace(/^\/+|\/+$/g, '')}/command`, JSON.stringify({ type: 'stop_alarm', requestId: id, ts: new Date().toISOString() }), { qos: 1 });
    return true;
  }, [settings.mqttTopicPrefix]);

  return { webStatus, deviceStatus, doorSignal, relayUrls, openDoor, closeDoor, setDoorSignal, stopDeviceAlarm, commandStatus };
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
