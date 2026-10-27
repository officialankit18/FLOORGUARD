import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import path from 'path';

import { initWebSocketServer } from './services/websocketService';
import { startMqttBridge } from './services/mqttBridge';
import {
  getDevices,
  getDeviceStatus,
  ingestDeviceEvent,
  updateDeviceHeartbeat,
  setDeviceMode
} from './controllers/deviceController';
import {
  getEvents,
  getEventById,
  createEvent,
  acknowledgeEvent,
  deleteEvent,
  clearAllEvents
} from './controllers/eventController';
import {
  getProfiles,
  enrollProfile,
  deleteProfile,
  clearAllProfiles
} from './controllers/profileController';
import { store } from './database/store';
import { getMongoStatus, hydrate, isMongoEnabled, saveDevice, saveEvent, saveProfile } from './services/mongoPersistence';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

function validCameraIp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  return value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

async function fetchCamera(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try { return await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timer); }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Local dashboard configuration. These values are intentionally returned only
// to the local app because browser MQTT clients need their restricted broker account.
app.get('/api/runtime-config', (_req, res) => {
  res.json({
    mqttUrl: process.env.DOORGUARD_MQTT_URL || process.env.MQTT_URL || '',
    mqttUsername: process.env.DOORGUARD_MQTT_USERNAME || process.env.MQTT_USERNAME || '',
    mqttPassword: process.env.DOORGUARD_MQTT_PASSWORD || process.env.MQTT_PASSWORD || '',
    mqttTopicPrefix: process.env.DOORGUARD_MQTT_TOPIC_PREFIX || process.env.MQTT_TOPIC_PREFIX || '',
  });
});

// ESP32-CAM relay. The server must run on the same local network as the camera.
app.get('/api/camera/stream', async (req, res) => {
  const ip = req.query.ip;
  if (!validCameraIp(ip)) return res.status(400).send('Invalid camera IP');
  try {
    const upstream = await fetchCamera(`http://${ip}:81/stream`);
    if (!upstream.ok || !upstream.body) return res.status(502).send('ESP32-CAM stream unavailable');
    res.status(200).set({ 'Content-Type': upstream.headers.get('content-type') || 'multipart/x-mixed-replace', 'Cache-Control': 'no-store' });
    for await (const chunk of upstream.body) res.write(chunk);
    return res.end();
  } catch { return res.status(502).send('ESP32-CAM stream unavailable'); }
});

app.get('/api/camera/capture', async (req, res) => {
  const ip = req.query.ip;
  if (!validCameraIp(ip)) return res.status(400).send('Invalid camera IP');
  try {
    const upstream = await fetchCamera(`http://${ip}/capture`);
    if (!upstream.ok) return res.status(502).send('ESP32-CAM snapshot unavailable');
    res.status(200).set({ 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'no-store' });
    const body = Buffer.from(await upstream.arrayBuffer());
    return res.send(body);
  } catch { return res.status(502).send('ESP32-CAM snapshot unavailable'); }
});

// Health Check
app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ONLINE',
    project: 'FLOOR GUARD — IoT-Based Smart Anti-Theft Floor Mat System',
    team: 'DevQBX / Five Glitchbreakers',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mongo: await getMongoStatus(),
  });
});

// Device Endpoints
app.get('/api/devices', getDevices);
app.get('/api/devices/:id/status', getDeviceStatus);
app.post('/api/devices/:id/events', ingestDeviceEvent);
app.post('/api/devices/:id/heartbeat', updateDeviceHeartbeat);
app.post('/api/devices/:id/mode', setDeviceMode);

// Event Management Endpoints
app.get('/api/events', getEvents);
app.get('/api/events/:id', getEventById);
app.post('/api/events', createEvent);
app.patch('/api/events/:id/acknowledge', acknowledgeEvent);
app.delete('/api/events/:id', deleteEvent);
app.delete('/api/events', clearAllEvents);

// Profile Management Endpoints
app.get('/api/profiles', getProfiles);
app.post('/api/profiles', enrollProfile);
app.delete('/api/profiles/:id', deleteProfile);
app.delete('/api/profiles', clearAllProfiles);

// Serve static build if in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (/[/\\]assets[/\\]/.test(filePath) || /[/\\]icons[/\\].*-v2\.png$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Create HTTP and WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

initWebSocketServer(wss);

async function bootstrapMongo() {
  if (!isMongoEnabled()) {
    console.log('[MongoDB] Not configured. Local history is active until MONGODB_URI is added.');
    return;
  }
  try {
    const cloud = await hydrate();
    if (cloud && (cloud.devices.length || cloud.events.length || cloud.profiles.length)) {
      store.setCloudSnapshot(cloud);
      console.log('[MongoDB] Cloud history loaded.');
    } else {
      await Promise.all([
        ...store.getDevices().map(saveDevice),
        ...store.getEvents().map(saveEvent),
        ...store.getProfiles().map(saveProfile),
      ]);
      console.log('[MongoDB] Existing local history migrated.');
    }
  } catch (error) {
    console.warn('[MongoDB] Cloud bootstrap failed; using local history:', error);
  }
}

async function startServer() {
  await bootstrapMongo();
  server.listen(PORT, () => {
  console.log(`[FLOOR GUARD Backend] Server running on http://localhost:${PORT}`);
  console.log(`[FLOOR GUARD Backend] WebSocket streaming live on ws://localhost:${PORT}/ws`);
  startMqttBridge();
  });
}

void startServer();
