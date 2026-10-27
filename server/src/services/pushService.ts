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
    await db.collection('pushSubscriptions').updateOne({ endpoint: subscription.endpoint }, { $set: { endpoint: subscription.endpoint, keys: subscription.keys } }, { upsert: true });
    return res.json({ success: true });
  } catch { return res.status(400).json({ error: 'Could not register push subscription' }); }
}

export async function pushSecurityEvent(event: SecurityEvent) {
  if (!pushReady() || !['Unknown Face', 'Potential Intrusion', 'Footstep Event'].includes(event.eventType)) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const db = await mongoDatabase();
  if (!db) return;
  const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
  const silent = event.eventType === 'Unknown Face';
  const payload = JSON.stringify({ id: event.id, title: silent ? 'Someone is at your entrance' : 'FLOORGUARD · Floor intrusion', body: silent ? 'Please open the app to view and attend your visitor.' : 'Floor activity detected. Open the app to review the alert.', silent });
  await Promise.allSettled(subscriptions.map(async subscription => {
    try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, { TTL: 300, urgency: 'high', timeout: 8000 }); }
    catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) await db.collection('pushSubscriptions').deleteOne({ _id: subscription._id });
      else console.warn('[Push] Notification delivery failed:', error.statusCode || 'network error');
    }
  }));
}
