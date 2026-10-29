import { store } from '../database/store';
import type { SecurityEvent } from '../../../src/types/events';

export async function captureFloorIncident(event: SecurityEvent): Promise<SecurityEvent | undefined> {
  if (event.metadata?.snapshotUrl || event.mode !== 'LIVE_CONNECTED' || !['Potential Intrusion', 'Footstep Event'].includes(event.eventType)) return;
  const image = await captureFloorFrame();
  return store.updateEventImage(event.id, image.dataUrl);
}

export async function captureFloorFrame(): Promise<{ bytes: Buffer; dataUrl: string }> {
  const ip = process.env.FLOOR_CAMERA_IP;
  if (ip && (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) || ip.split('.').some(part => Number(part) > 255))) throw new Error('Invalid floor camera IP');
  const url = ip ? `http://${ip}/capture` : process.env.FLOOR_CAMERA_CAPTURE_URL || 'http://127.0.0.1:3012/camera/laptop/capture';
  const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw new Error('Camera unavailable');
  const mime = (response.headers.get('content-type') || '').split(';')[0];
  if (!['image/jpeg', 'image/png'].includes(mime)) throw new Error('Invalid camera image');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 1_400_000) throw new Error('Invalid camera image size');
  return { bytes, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}
