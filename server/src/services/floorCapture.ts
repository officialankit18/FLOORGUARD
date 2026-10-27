import { store } from '../database/store';
import type { SecurityEvent } from '../../../src/types/events';

export async function captureFloorIncident(event: SecurityEvent): Promise<SecurityEvent | undefined> {
  const ip = process.env.FLOOR_CAMERA_IP;
  if (!ip || event.mode !== 'LIVE_CONNECTED' || !['Potential Intrusion', 'Footstep Event'].includes(event.eventType)) return;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) || ip.split('.').some(part => Number(part) > 255)) return;
  const response = await fetch(`http://${ip}/capture`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Camera unavailable');
  const mime = (response.headers.get('content-type') || '').split(';')[0];
  if (!['image/jpeg', 'image/png'].includes(mime)) throw new Error('Invalid camera image');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 1_400_000) throw new Error('Camera image too large');
  return store.updateEventImage(event.id, `data:${mime};base64,${bytes.toString('base64')}`);
}
