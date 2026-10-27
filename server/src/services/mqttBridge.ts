import mqtt, { MqttClient } from 'mqtt';
import { store } from '../database/store';
import { broadcastDeviceUpdate, broadcastEvent } from './websocketService';
import { SecurityEvent } from '../../../src/types/events';

let client: MqttClient | null = null;
let currentPrefix = '';

function mqttSettings() {
  return {
    url: process.env.DOORGUARD_MQTT_URL || process.env.MQTT_URL || '',
    username: process.env.DOORGUARD_MQTT_USERNAME || process.env.MQTT_USERNAME || '',
    password: process.env.DOORGUARD_MQTT_PASSWORD || process.env.MQTT_PASSWORD || '',
    prefix: (process.env.DOORGUARD_MQTT_TOPIC_PREFIX || process.env.MQTT_TOPIC_PREFIX || '').replace(/^\/+|\/+$/g, ''),
  };
}

function addEvent(eventType: SecurityEvent['eventType'], description: string, severity: SecurityEvent['severity']) {
  const event: SecurityEvent = {
    id: `MQTT-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    eventType,
    source: 'System Controller',
    description,
    severity,
    mode: 'LIVE_CONNECTED',
    acknowledged: false,
  };
  store.addEvent(event);
  broadcastEvent(event);
}

function markDevice(updates: Record<string, unknown>) {
  const updated = store.updateDevice('MAT-NODE-01', {
    mode: 'LIVE_CONNECTED',
    status: 'Connected',
    lastHeartbeat: new Date().toISOString(),
    ...updates,
  });
  if (updated) broadcastDeviceUpdate(updated);
}

function handleMessage(raw: string) {
  let message: any;
  try { message = JSON.parse(raw); } catch { return; }
  if (message.type === 'door_state' && typeof message.on === 'boolean') {
    markDevice({ servoLocked: message.on, lcdMessage: message.on ? 'DOOR ARMED' : 'DOOR OFF' });
  } else if (message.type === 'buzzer_state' && typeof message.on === 'boolean') {
    markDevice({ buzzerState: message.on, isTriggered: message.on, lcdMessage: message.on ? 'INTRUSION ALERT!' : 'SYSTEM ARMED' });
  } else if (message.type === 'intrusion') {
    markDevice({ isTriggered: true, buzzerState: true, lcdMessage: 'INTRUSION ALERT!' });
    addEvent('Potential Intrusion', 'Physical intrusion message received from the DoorGuard sensor.', 'critical');
  } else {
    markDevice({});
  }
}

export function startMqttBridge() {
  const { url, username, password, prefix } = mqttSettings();
  if (!url || !prefix) { console.warn('[MQTT] Not configured; device status remains offline.'); return; }
  currentPrefix = prefix;
  client = mqtt.connect(url, { username: username || undefined, password: password || undefined, reconnectPeriod: 3000, clean: true, connectTimeout: 10000 });
  client.on('connect', () => { console.log('[MQTT] Backend connected.'); client?.subscribe(`${currentPrefix}/event`, { qos: 1 }); });
  client.on('message', (_topic, payload) => handleMessage(payload.toString()));
  client.on('error', (error) => console.warn('[MQTT] Broker error:', error.message));
}

export function stopMqttBridge() { client?.end(true); client = null; }
