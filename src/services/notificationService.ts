import { SoundAlertService } from './soundAlertService';
import { SecurityEvent } from '../types/events';

export class NotificationService {
  static async enablePush(): Promise<string> {
    const permission = await this.enable();
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
    const saved = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) });
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
    const important = ['Potential Intrusion', 'Unknown Face', 'Footstep Event'].includes(event.eventType);
    if (!important) return;

    const silent = event.eventType === 'Unknown Face';
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = event.eventType === 'Unknown Face' ? 'Unverified visitor detected' : 'FLOORGUARD security alert';
    const body = `${event.description} • ${new Date(event.timestamp).toLocaleTimeString()}`;
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => null);
    if (registration) {
      if (await registration.pushManager?.getSubscription()) return;
      await registration.showNotification(title, { body, silent, icon: '/icons/icon-192-v2.png', tag: event.id });
    } else {
      new Notification(title, { body, silent, icon: '/icons/icon-192-v2.png', tag: event.id });
    }
  }
}
