import webpush from 'web-push';
import { Request, Response } from 'express';
import { mongoDatabase } from './mongoPersistence';
import type { SecurityEvent } from '../../../src/types/events';

export const pushReady = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
export const pushConfig = (_req: Request, res: Response) => res.json({ enabled: pushReady(), publicKey: pushReady() ? process.env.VAPID_PUBLIC_KEY : '' });

export async function subscribePush(req: Request, res: Response) {
  const subscription = req.body;
  try {
    const url = new URL(subscription.endpoint);
    const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
    if (url.protocol !== 'https:' || url.port || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') return res.status(400).json({ error: 'Invalid push subscription' });
    if (!pushReady()) return res.status(503).json({ error: 'Server push keys are not configured' });
    const db = await mongoDatabase();
    if (!db) return res.status(503).json({ error: 'Database is unavailable; subscription not saved' });
    const preferences = subscription.preferences && typeof subscription.preferences === 'object' ? Object.fromEntries(['unknownFace', 'intrusion', 'deviceOffline', 'doorActivity'].map(key => [key, subscription.preferences[key] === true])) : undefined;
    await db.collection('pushSubscriptions').updateOne({ endpoint: subscription.endpoint }, { $set: { endpoint: subscription.endpoint, keys: subscription.keys, preferences } }, { upsert: true });
    return res.json({ success: true });
  } catch { return res.status(400).json({ error: 'Could not register push subscription' }); }
}

export async function pushSecurityEvent(event: SecurityEvent) {
  const category = event.eventType === 'Unknown Face' ? 'unknownFace' : ['Potential Intrusion', 'Footstep Event', 'Floor Object Detected', 'Floor Verification Unavailable'].includes(event.eventType) ? 'intrusion' : event.eventType === 'Device Disconnected' ? 'deviceOffline' : event.eventType.includes('Door') ? 'doorActivity' : null;
  if (!pushReady() || !category) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const db = await mongoDatabase();
  if (!db) return;
  const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
  const title = event.eventType === 'Floor Object Detected' ? 'Object detected on floor mat' : event.eventType === 'Floor Verification Unavailable' ? 'Floor mat verification unavailable' : event.eventType === 'Unknown Face' ? 'Someone is at your entrance' : category === 'intrusion' ? 'FLOORGUARD · Floor intrusion' : category === 'deviceOffline' ? 'FLOORGUARD · Device offline' : 'FLOORGUARD · Door activity';
  const payload = JSON.stringify({ id: event.id, title, body: event.description, image: event.metadata?.snapshotUrl ? `/api/events/${event.id}/snapshot` : undefined, intrusion: event.eventType === 'Potential Intrusion' || event.eventType === 'Footstep Event' });
  await Promise.allSettled(subscriptions.filter(subscription => subscription.preferences?.[category] ?? category !== 'doorActivity').map(async subscription => {
    try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, { TTL: 300, urgency: 'high', timeout: 8000 }); }
    catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) await db.collection('pushSubscriptions').deleteOne({ _id: subscription._id });
      else console.warn('[Push] Notification delivery failed:', error.statusCode || 'network error');
    }
  }));
}
