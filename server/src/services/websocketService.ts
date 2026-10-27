import { WebSocketServer, WebSocket } from 'ws';
import { SecurityEvent } from '../../../src/types/events';
import { DeviceTelemetry } from '../../../src/types/device';
import { pushSecurityEvent } from './pushService';
import { captureFloorIncident } from './floorCapture';

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: WebSocketServer) {
  wss = server;

  wss.on('connection', (ws: WebSocket) => {
    // Send immediate initial handshake
    ws.send(JSON.stringify({
      type: 'CONNECTION_ESTABLISHED',
      timestamp: new Date().toISOString(),
      message: 'Connected to FLOOR GUARD Real-Time Security WebSocket'
    }));

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        // ignore malformed ping
      }
    });
  });
}

export function broadcastEvent(event: SecurityEvent) {
  void pushSecurityEvent(event).catch(() => console.warn('[Push] Notification dispatch failed'));
  void captureFloorIncident(event).then(updated => { if (updated) broadcastEventUpdate({ ...updated, metadata: { ...updated.metadata, snapshotUrl: `/api/events/${updated.id}/snapshot` } }); }).catch(() => console.warn('[Camera] Floor snapshot unavailable'));
  if (!wss) return;
  const payload = JSON.stringify({
    type: 'NEW_SECURITY_EVENT',
    data: event
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function broadcastDeviceUpdate(device: DeviceTelemetry) {
  if (!wss) return;
  const payload = JSON.stringify({
    type: 'DEVICE_TELEMETRY_UPDATE',
    data: device
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function broadcastEventUpdate(event: SecurityEvent) {
  const payload = JSON.stringify({ type: 'SECURITY_EVENT_UPDATED', data: event });
  wss?.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(payload); });
}

export function broadcastProfilesChanged() {
  wss?.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'PROFILES_CHANGED' })); });
}
