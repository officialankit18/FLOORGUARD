import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import { store } from '../database/store';
import { mongoDatabase } from './mongoPersistence';
import { broadcastEvent, broadcastVisionResult } from './websocketService';
import { publishEntranceVision, requestAutomaticDoorOpen } from './mqttBridge';
import type { SecurityEvent } from '../../../src/types/events';
import type { EnrolledProfile } from '../../../src/types/profiles';

const require = createRequire(import.meta.url);
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const autoOpenIds = () => new Set((process.env.FACE_AUTO_OPEN_PROFILE_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
const autoOpenEnabled = () => process.env.FACE_AUTO_OPEN_DOOR !== '0' && autoOpenIds().size > 0;
type Result = { status: 'scanning' | 'offline' | 'loading' | 'error'; face: 'none' | 'verifying' | 'verified' | 'unverified'; name?: string; box?: { x: number; y: number; width: number; height: number }; width?: number; height?: number; at: number };
let latest: Result = { status: 'loading', face: 'none', at: 0 };
let consecutive = { key: '', count: 0 };
let lastFaceAt = 0;
let lastProfileSync = 0;
let lastProfileAttempt = 0;
const lastVisit = new Map<string, number>();

export function entranceMonitorStatus() { return { ...latest, autoOpenDoor: autoOpenEnabled(), profileCount: store.getProfiles().length, lastProfileSync }; }
function emit(result: Result) { latest = result; broadcastVisionResult(result); publishEntranceVision(result); }

async function refreshProfiles() {
  const database = await mongoDatabase();
  if (database) {
    const rows = await database.collection('profiles').find({}).toArray();
    store.replaceProfilesFromCloud(rows.map(({ _id, ...profile }) => profile as unknown as EnrolledProfile));
    lastProfileSync = Date.now();
    return;
  }
  const remote = process.env.FLOOR_REMOTE_API_URL?.replace(/\/$/, '');
  if (!remote) return;
  const response = await fetch(`${remote}/api/profiles`, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) return;
  const body = await response.json() as { data?: unknown };
  if (!Array.isArray(body.data)) return;
  store.replaceProfilesFromCloud(body.data);
  lastProfileSync = Date.now();
}

async function prepare() {
  await tf.setBackend('wasm');
  await tf.ready();
  const models = path.resolve(process.cwd(), 'public/models');
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromDisk(models),
    faceapi.nets.faceLandmark68TinyNet.loadFromDisk(models),
    faceapi.nets.faceRecognitionNet.loadFromDisk(models),
  ]);
}

async function record(known: boolean, autoAuthorized: boolean, name: string, photo: Buffer) {
  const key = known ? `member:${name}` : 'unknown';
  const now = Date.now();
  if (now - (lastVisit.get(key) || 0) < 30000) return;
  lastVisit.set(key, now);
  const event: SecurityEvent = {
    id: `FACE-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(now).toISOString(),
    eventType: known ? 'Known Face Match' : 'Unknown Face',
    source: 'ESP32-CAM',
    description: known ? `${name} verified at entrance.` : 'Someone is at your entrance. Please attend your visitor.',
    severity: known ? 'success' : 'warning',
    mode: 'LIVE_CONNECTED',
    acknowledged: false,
    metadata: { cameraRole: 'entrance', recognizedName: known ? name : undefined, snapshotUrl: `data:image/jpeg;base64,${photo.toString('base64')}` },
  };
  store.addEvent(event);
  broadcastEvent(event);
  const remote = process.env.FLOOR_REMOTE_API_URL?.replace(/\/$/, '');
  if (remote) void fetch(`${remote}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType: event.eventType, source: event.source, description: event.description, severity: event.severity, mode: event.mode, metadata: event.metadata }), signal: AbortSignal.timeout(10000) }).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); }).catch(error => console.warn('[Entrance] Remote event sync failed:', error.message));
  if (known && autoAuthorized && autoOpenEnabled()) requestAutomaticDoorOpen(name, event.id);
}

async function scan() {
  const response = await fetch(process.env.ENTRANCE_CAMERA_CAPTURE_URL || 'http://127.0.0.1:3012/camera/esp32/capture', { signal: AbortSignal.timeout(3500), cache: 'no-store' });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('image/jpeg')) throw new Error('Entrance camera unavailable');
  const input = Buffer.from(await response.arrayBuffer());
  if (!input.length || input.length > 1_500_000) throw new Error('Invalid camera frame');
  const { data, info } = await sharp(input).resize({ width: 640, withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
  let detections: any[];
  try {
    detections = await faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 })).withFaceLandmarks(true).withFaceDescriptors();
  } finally { tensor.dispose(); }
  const face = detections.sort((a, b) => b.detection.score - a.detection.score)[0];
  if (!face) {
    if (Date.now() - lastFaceAt > 2500) consecutive = { key: '', count: 0 };
    emit({ status: 'scanning', face: 'none', width: info.width, height: info.height, at: Date.now() });
    return;
  }
  lastFaceAt = Date.now();
  const profiles = store.getProfiles().filter(profile => profile.consentGranted && profile.descriptor?.length === 128);
  let best = { id: '', name: '', distance: Infinity, role: '' };
  for (const profile of profiles) {
    const distance = Math.hypot(...profile.descriptor.map((value, index) => value - face.descriptor[index]));
    if (distance < best.distance) best = { id: profile.id, name: profile.name, distance, role: profile.role };
  }
  const known = best.distance <= 0.52 && face.detection.score >= 0.65;
  const key = known ? `member:${best.name}` : 'unknown';
  consecutive = { key, count: consecutive.key === key ? consecutive.count + 1 : 1 };
  const box = face.detection.box;
  emit({ status: 'scanning', face: consecutive.count >= 2 ? known ? 'verified' : 'unverified' : 'verifying', name: known ? best.name : undefined, box: { x: box.x, y: box.y, width: box.width, height: box.height }, width: info.width, height: info.height, at: Date.now() });
  if (consecutive.count === 2) {
    const photo = await sharp(input).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    await record(known, known && ['Resident', 'Administrator'].includes(best.role) && autoOpenIds().has(best.id), best.name, photo);
  }
}

export function startEntranceMonitor() {
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.ENTRANCE_MONITOR_ENABLED === '0') return;
  void (async () => {
    try { await prepare(); } catch (error) { latest = { status: 'error', face: 'none', at: Date.now() }; console.warn('[Entrance] Face models unavailable:', (error as Error).message); return; }
    for (;;) {
      if (Date.now() - lastProfileAttempt > 15000) {
        lastProfileAttempt = Date.now();
        void refreshProfiles().catch(error => console.warn('[Entrance] Profile refresh failed:', (error as Error).message));
      }
      try { await scan(); } catch { consecutive = { key: '', count: 0 }; emit({ status: 'offline', face: 'none', at: Date.now() }); }
      await new Promise(resolve => setTimeout(resolve, Math.max(700, Number(process.env.ENTRANCE_SCAN_INTERVAL_MS) || 800)));
    }
  })();
}
