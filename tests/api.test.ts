import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import {
  getDevices,
  getDeviceStatus,
  ingestDeviceEvent,
  setDeviceMode
} from '../server/src/controllers/deviceController';
import {
  getEvents,
  getSnapshot,
  saveSnapshot,
  createEvent,
  acknowledgeEvent,
  deleteEvent,
  clearAllEvents
} from '../server/src/controllers/eventController';
import {
  getProfiles,
  enrollProfile,
  deleteProfile,
  clearAllProfiles
} from '../server/src/controllers/profileController';

describe('FLOOR GUARD Express REST API Integration Tests', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Health
    app.get('/api/health', (_req, res) => res.json({ status: 'ONLINE', project: 'FLOOR GUARD' }));

    // Devices
    app.get('/api/devices', getDevices);
    app.get('/api/devices/:id/status', getDeviceStatus);
    app.post('/api/devices/:id/events', ingestDeviceEvent);
    app.post('/api/devices/:id/mode', setDeviceMode);

    // Events
    app.get('/api/events', getEvents);
    app.get('/api/events/:id/snapshot', getSnapshot);
    app.patch('/api/events/:id/snapshot', saveSnapshot);
    app.post('/api/events', createEvent);
    app.patch('/api/events/:id/acknowledge', acknowledgeEvent);
    app.delete('/api/events/:id', deleteEvent);
    app.delete('/api/events', clearAllEvents);

    // Profiles
    app.get('/api/profiles', getProfiles);
    app.post('/api/profiles', enrollProfile);
    app.delete('/api/profiles/:id', deleteProfile);
    app.delete('/api/profiles', clearAllProfiles);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}/api`;
        resolve();
      });
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/health returns ONLINE status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ONLINE');
    expect(body.project).toBe('FLOOR GUARD');
  });

  it('keeps images out of history lists but serves saved incident snapshots', async () => {
    const created = await fetch(`${baseUrl}/events`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventType:'Potential Intrusion',source:'Floor Mat Sensor',description:'Snapshot integration test'})}).then(r=>r.json());
    const id = created.data.id;
    const patch = await fetch(`${baseUrl}/events/${id}/snapshot`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshotUrl:'data:image/jpeg;base64,/9j/2Q=='})});
    expect(patch.status).toBe(200);
    const list = await fetch(`${baseUrl}/events`).then(r=>r.json());
    expect(list.data.find((item:any)=>item.id===id).metadata.snapshotUrl).toBe(`/api/events/${id}/snapshot`);
    const image = await fetch(`${baseUrl}/events/${id}/snapshot`);
    expect(image.headers.get('content-type')).toContain('image/jpeg');
    expect((await image.arrayBuffer()).byteLength).toBe(4);
    const invalid = await fetch(`${baseUrl}/events/${id}/snapshot`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshotUrl:'javascript:alert(1)'})});
    expect(invalid.status).toBe(400);
  });

  it('deduplicates a member arrival across two monitoring clients', async () => {
    const data = {eventType:'Known Face Match',source:'ESP32-CAM',description:'Member arrived',metadata:{recognizedName:'Unique test member'}};
    const post = (body:object) => fetch(`${baseUrl}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
    const first = await post(data);
    const second = await post({...data,source:'Local Browser Camera'});
    expect(second.deduplicated).toBe(true);
    expect(second.data.id).toBe(first.data.id);
  });

  it('GET /api/devices returns registered smart mat device', async () => {
    const res = await fetch(`${baseUrl}/devices`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].deviceId).toBe('MAT-NODE-01');
  });

  it('POST /api/devices/:id/events ingests hardware footstep event and returns 201', async () => {
    const res = await fetch(`${baseUrl}/devices/MAT-NODE-01/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'Footstep Event',
        sensorReading: 680,
        analogVoltage: 3.32,
        description: 'Physical pressure step detected on mat zone.',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.eventType).toBe('Footstep Event');
    expect(body.data.metadata.piezoReading).toBe(680);
  });

  it('POST /api/devices/:id/events returns 404 for unknown device', async () => {
    const res = await fetch(`${baseUrl}/devices/NON-EXISTENT-DEVICE/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensorReading: 500 }),
    });

    expect(res.status).toBe(404);
  });

  it('GET /api/events filters by eventType and search term', async () => {
    const res = await fetch(`${baseUrl}/events?eventType=Footstep%20Event`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.every((e: any) => e.eventType === 'Footstep Event')).toBe(true);
  });

  it('POST /api/profiles rejects enrollment if consent is missing', async () => {
    const dummyDescriptor = Array(128).fill(0.1);
    const res = await fetch(`${baseUrl}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unauthorized Subject',
        descriptor: dummyDescriptor,
        consentGranted: false, // Must be true!
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('consent is strictly required');
  });

  it('POST /api/profiles rejects enrollment if descriptor vector length is not 128', async () => {
    const res = await fetch(`${baseUrl}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Vector Subject',
        descriptor: [0.1, 0.2], // invalid length
        consentGranted: true,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('128-dimensional embedding vector is required');
  });

  it('POST /api/profiles successfully enrolls authorized profile and GET /api/profiles returns it', async () => {
    const dummyDescriptor = Array(128).fill(0).map((_, i) => Math.cos(i));
    const res = await fetch(`${baseUrl}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Adarsh Srivastava (Leader)',
        role: 'Administrator',
        descriptor: dummyDescriptor,
        consentGranted: true,
        notes: 'Team Lead reference facial embedding',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Adarsh Srivastava (Leader)');

    const listRes = await fetch(`${baseUrl}/profiles`);
    const listBody = await listRes.json();
    expect(listBody.data.some((p: any) => p.name === 'Adarsh Srivastava (Leader)')).toBe(true);
  });
});
