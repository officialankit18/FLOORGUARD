import { SoundAlertService } from './soundAlertService';
import { SecurityEvent } from '../types/events';
import { getSettings, DEFAULT_NOTIFICATIONS } from '../hooks/useFloorGuardSettings';

export function notificationCategory(eventType: SecurityEvent['eventType']) {
  if (eventType === 'Unknown Face') return 'unknownFace';
  if (eventType === 'Potential Intrusion' || eventType === 'Footstep Event') return 'intrusion';
  if (eventType === 'Floor Object Detected' || eventType === 'Floor Verification Unavailable') return 'intrusion';
  if (eventType === 'Device Disconnected') return 'deviceOffline';
  if (eventType.includes('Door')) return 'doorActivity';
  return null;
}

export class NotificationService {
  private static recentlyNotified = new Map<string, number>();
  static async enablePush(requestPermission = true): Promise<string> {
    if (!window.isSecureContext) return 'Phone notifications require the HTTPS FLOORGUARD site. Open floorguard.onrender.com on your phone.';
    if (!('Notification' in window)) return 'Notifications are not supported in this browser.';
    const permission = requestPermission ? await this.enable() : Notification.permission;
    if (permission !== 'granted') return `Notification permission: ${permission}.`;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'Background push is not supported in this browser.';
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'In-app notifications enabled. Background push requires the installed HTTPS production app.';
    const response = await fetch('/api/push/config');
    const config = await response.json();
    if (!config.enabled) return 'In-app notifications enabled. Add VAPID keys on the server for background notifications.';
    const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/'));
    const key = Uint8Array.from(raw, char => char.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const saved = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...subscription.toJSON(), preferences: { ...DEFAULT_NOTIFICATIONS, ...getSettings().notifications } }) });
    if (!saved.ok) throw new Error('Push subscription could not be saved. Please retry.');
    return 'Notifications enabled on this device. Phone settings control background sound.';
  }
  static async enable(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      SoundAlertService.setSoundEnabled(true);
    }
    return permission;
  }

  static async notify(event: SecurityEvent) {
    const category = notificationCategory(event.eventType);
    if (!category || !({ ...DEFAULT_NOTIFICATIONS, ...getSettings().notifications })[category]) return;
    const now = Date.now();
    if (now - (this.recentlyNotified.get(event.id) || 0) < 30_000) return;
    this.recentlyNotified.set(event.id, now);
    for (const [id, at] of this.recentlyNotified) if (now - at > 30_000) this.recentlyNotified.delete(id);
    const intrusion = event.eventType === 'Potential Intrusion' || event.eventType === 'Footstep Event';
    if (!intrusion && document.visibilityState === 'visible') SoundAlertService.playNotificationSound();
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = event.eventType === 'Unknown Face' ? 'Unverified visitor detected' : event.eventType === 'Floor Object Detected' ? 'Object detected on floor mat' : event.eventType === 'Floor Verification Unavailable' ? 'Floor mat verification unavailable' : category === 'deviceOffline' ? 'FLOORGUARD device offline' : category === 'doorActivity' ? 'Door activity' : 'FLOORGUARD security alert';
    const body = `${event.description} • ${new Date(event.timestamp).toLocaleTimeString()}`;
    // `image` is supported by Android notification providers but is not yet in
    // every TypeScript DOM declaration shipped by browsers.
    const options: NotificationOptions & { image?: string } = { body, silent: document.visibilityState === 'visible', icon: '/icons/icon-192-v2.png', image: event.metadata?.snapshotUrl, tag: event.id };
    try {
      const registration = await navigator.serviceWorker?.getRegistration().catch(() => null);
      if (registration) {
        if (await registration.pushManager?.getSubscription()) return;
        await registration.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } catch {
      // Some mobile browsers grant permission but disallow the page-level
      // constructor. Keep the in-app event and sound working in that case.
    }
  }
}
