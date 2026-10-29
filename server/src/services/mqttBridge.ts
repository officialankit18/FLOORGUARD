import mqtt, { MqttClient } from 'mqtt';
import { store } from '../database/store';
import { broadcastDeviceUpdate, broadcastEvent } from './websocketService';
import { SecurityEvent } from '../../../src/types/events';
import { captureFloorFrame } from './floorCapture';
import { classifyFloorFrame, personDetectorStatus } from './personDetector';

let client: MqttClient | null = null;
let currentPrefix = '';
let floorBusy = false;
let lastFloorCandidate = 0;

function mqttSettings() {
  return {
    url: process.env.DOORGUARD_MQTT_URL || process.env.MQTT_URL || '',
    username: process.env.DOORGUARD_MQTT_USERNAME || process.env.MQTT_USERNAME || '',
    password: process.env.DOORGUARD_MQTT_PASSWORD || process.env.MQTT_PASSWORD || '',
    prefix: (process.env.DOORGUARD_MQTT_TOPIC_PREFIX || process.env.MQTT_TOPIC_PREFIX || '').replace(/^\/+|\/+$/g, ''),
  };
}

function addEvent(eventType: SecurityEvent['eventType'], description: string, severity: SecurityEvent['severity'], metadata?: SecurityEvent['metadata']) {
  const event: SecurityEvent = {
    id: `MQTT-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    eventType,
    source: 'System Controller',
    description,
    severity,
    mode: 'LIVE_CONNECTED',
    acknowledged: false,
    metadata,
  };
  store.addEvent(event);
  broadcastEvent(event);
  const remote = process.env.FLOOR_REMOTE_API_URL?.replace(/\/$/, '');
  if (remote && ['Potential Intrusion', 'Floor Object Detected', 'Floor Verification Unavailable'].includes(eventType)) {
    void fetch(`${remote}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType, source: event.source, description, severity, mode: event.mode, metadata }), signal: AbortSignal.timeout(10000) }).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); }).catch(error => console.warn('[Floor] Remote event sync failed:', error.message));
  }
}

async function verifyFloorCandidate() {
  const now = Date.now();
  if (floorBusy || now - lastFloorCandidate < 2500) return;
  lastFloorCandidate = now;
  floorBusy = true;
  let photo: string | undefined;
  try {
    const frame = await captureFloorFrame();
    photo = frame.dataUrl;
    if (personDetectorStatus() !== 'Ready') throw new Error('Person detector is not ready');
    const result = await classifyFloorFrame(frame.bytes);
    const details = `Person score ${result.score.toFixed(2)}; detected ${result.labels.join(', ') || 'nothing'}.`;
    if (result.category === 'person') {
      client?.publish(`${currentPrefix}/command`, JSON.stringify({ type: 'start_alarm', requestId: crypto.randomUUID(), ts: new Date().toISOString() }), { qos: 1, retain: false });
      markDevice({ isTriggered: true, lcdMessage: 'PERSON DETECTED' });
      addEvent('Potential Intrusion', 'Person detected at the floor mat. Alarm requested.', 'critical', { cameraRole: 'floor', snapshotUrl: photo, personConfidence: result.score, details });
    } else if (result.category === 'object') {
      client?.publish(`${currentPrefix}/command`, JSON.stringify({ type: 'reject_floor_candidate', ts: new Date().toISOString() }), { qos: 1, retain: false });
      markDevice({ isTriggered: false, buzzerState: false, lcdMessage: 'OBJECT DETECTED' });
      addEvent('Floor Object Detected', 'Floor mat activated; no person detected in the camera view.', 'info', { cameraRole: 'floor', snapshotUrl: photo, details });
    } else {
      client?.publish(`${currentPrefix}/command`, JSON.stringify({ type: 'reject_floor_candidate', ts: new Date().toISOString() }), { qos: 1, retain: false });
      addEvent('Floor Verification Unavailable', 'Floor mat activated, but the image was inconclusive. Review the photo.', 'warning', { cameraRole: 'floor', snapshotUrl: photo, details });
    }
  } catch (error) {
    client?.publish(`${currentPrefix}/command`, JSON.stringify({ type: 'reject_floor_candidate', ts: new Date().toISOString() }), { qos: 1, retain: false });
    addEvent('Floor Verification Unavailable', 'Floor mat activated, but the camera or person detector could not verify the scene.', 'warning', { cameraRole: 'floor', snapshotUrl: photo, details: (error as Error).message });
    console.warn('[Vision] Floor candidate unresolved:', (error as Error).message);
  } finally { floorBusy = false; }
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
  } else if (message.type === 'floor_candidate') {
    if (process.env.FLOOR_VERIFIER_ENABLED === '1' || (!process.env.RENDER && !process.env.RENDER_EXTERNAL_URL && process.env.FLOOR_VERIFIER_ENABLED !== '0')) void verifyFloorCandidate();
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
