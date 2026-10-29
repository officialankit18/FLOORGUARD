import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.relay') });
const ip = process.env.RELAY_ESP_IP;
if (!ip || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) || ip.split('.').some(n => +n > 255)) throw new Error('Set RELAY_ESP_IP in .env.relay');
const port = Number(process.env.RELAY_PORT || 3012);
const frames = { esp32: { data: null, at: 0, sequence: 0 }, laptop: { data: null, at: 0, sequence: 0 } };
let stopped = false, webcam, webcamRetry, espTimer, espController;
const viewers = new Set();
const fresh = camera => Date.now() - camera.at < 5000 && camera.data;
function publish(name, data) {
  frames[name] = { data, at: Date.now(), sequence: frames[name].sequence + 1 };
  for (const viewer of viewers) {
    if (viewer.camera === name && viewer.readyState === WebSocket.OPEN && viewer.inFlight === 0 && viewer.bufferedAmount < 128_000) {
      if (!viewer.inFlight) viewer.sentAt = Date.now();
      viewer.inFlight++;
      viewer.send(data, { binary: true, compress: false });
    }
  }
}

async function streamEsp() {
  espController = new AbortController();
  let lastFrame = Date.now(), buffer = Buffer.alloc(0);
  const controller = espController;
  const watchdog = setInterval(() => { if (Date.now() - lastFrame > 7000) controller.abort(); }, 1000);
  try {
    const response = await fetch(`http://${ip}:81/stream`, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error('Stream unavailable');
    for await (const chunk of response.body) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 2_000_000) throw new Error('Oversized camera frame');
      let end;
      while ((end = buffer.indexOf(Buffer.from([0xff, 0xd9]))) >= 0) {
        const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (start >= 0 && start < end) { publish('esp32', Buffer.from(buffer.subarray(start, end + 2))); lastFrame = Date.now(); }
        buffer = buffer.subarray(end + 2);
      }
    }
  } catch { /* Retry the one shared upstream connection. */ }
  finally { clearInterval(watchdog); controller.abort(); }
  if (!stopped) espTimer = setTimeout(streamEsp, 1000);
}


function startWebcam() {
  const executable = process.env.RELAY_FFMPEG || path.join(root, '.relay-tools', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  const camera = process.env.RELAY_WEBCAM || 'USB2.0 HD UVC WebCam';
  webcam = spawn(executable, ['-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-rtbufsize', '8M', '-i', `video=${camera}`, '-an', '-vf', 'fps=15,scale=640:-2', '-q:v', '6', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { windowsHide: true });
  let buffer = Buffer.alloc(0);
  webcam.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 2_000_000) { buffer = Buffer.alloc(0); return; }
    while (buffer.length) {
      const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) break;
      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) break;
      publish('laptop', Buffer.from(buffer.subarray(start, end + 2)));
      buffer = buffer.subarray(end + 2);
    }
  });
  webcam.stderr.on('data', chunk => console.warn('[Webcam]', chunk.toString().trim()));
  webcam.on('error', error => console.warn('[Webcam]', error.message));
  webcam.on('close', () => { if (!stopped) webcamRetry = setTimeout(startWebcam, 5000); });
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: '*', methods: ['GET', 'HEAD'] }));
app.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
app.get('/health', (_req, res) => res.json({ service: 'FLOORGUARD camera relay', cameras: Object.fromEntries(Object.entries(frames).map(([name, frame]) => [name, { online: Boolean(fresh(frame)), lastFrameAt: frame.at || null }])) }));
app.get('/camera/:name/capture', (req, res) => {
  const frame = frames[req.params.name];
  if (!frame) return res.sendStatus(404);
  if (!fresh(frame)) return res.status(503).send('Camera offline');
  res.type('jpeg').send(frame.data);
});
app.get('/camera/:name/stream', (req, res) => {
  const name = req.params.name;
  if (!frames[name]) return res.sendStatus(404);
  res.set({ 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  let sequence = -1, lastSent = Date.now();
  const timer = setInterval(() => {
    const frame = frames[name];
    if (Date.now() - lastSent > 15000) { clearInterval(timer); res.end(); return; }
    if (!fresh(frame) || sequence === frame.sequence || res.writableLength > 512_000) return;
    sequence = frame.sequence; lastSent = Date.now();
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.data.length}\r\n\r\n`);
    res.write(frame.data); res.write('\r\n');
  }, 125);
  res.on('close', () => clearInterval(timer));
});
app.get('/', (_req, res) => res.sendFile(path.join(root, 'scripts', 'relay-viewer.html')));
function localAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((address) => address && address.family === 'IPv4' && !address.internal).map((address) => address.address);
}
const server = app.listen(port, '0.0.0.0', () => {
  const addresses = localAddresses();
  console.log(`Camera relay is running locally on this laptop.`);
  console.log(`Relay dashboard: http://127.0.0.1:${port}`);
  for (const address of addresses) console.log(`LOCAL WI-FI CAMERAS: http://${address}:${port}`);
  console.log(`Open the LOCAL WI-FI CAMERAS address only on devices connected to the same Wi-Fi.`);
});
const wss = new WebSocketServer({ server, path: '/live', perMessageDeflate: false, maxPayload: 1024 });
wss.on('connection', (socket, request) => {
  const camera = new URL(request.url, 'http://localhost').searchParams.get('camera');
  if (!['esp32', 'laptop'].includes(camera)) { socket.close(1008, 'Unknown camera'); return; }
  socket.camera = camera; socket.inFlight = 0; socket.sentAt = Date.now();
  viewers.add(socket);
  socket.on('message', data => { if (data.toString() === 'ready') { socket.inFlight = Math.max(0, socket.inFlight - 1); socket.sentAt = Date.now(); } });
  socket.on('error', () => socket.terminate());
  socket.on('close', () => viewers.delete(socket));
});
const viewerWatchdog = setInterval(() => { for (const viewer of viewers) if (viewer.inFlight && Date.now() - viewer.sentAt > 10000) viewer.terminate(); }, 3000);
void streamEsp(); startWebcam();
function stop() { stopped = true; espController?.abort(); clearInterval(viewerWatchdog); for (const viewer of viewers) viewer.terminate(); wss.close(); clearTimeout(espTimer); clearTimeout(webcamRetry); webcam?.kill(); server.close(); setTimeout(() => process.exit(0), 1000).unref(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
