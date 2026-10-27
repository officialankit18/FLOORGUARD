import { SoundAlertService } from './soundAlertService';
import { SecurityEvent } from '../types/events';

export class NotificationService {
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

    SoundAlertService.setSoundEnabled(true);
    SoundAlertService.playIntrusionAlarm();
    if (navigator.vibrate) navigator.vibrate([220, 100, 220]);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = event.eventType === 'Unknown Face' ? 'Unverified visitor detected' : 'FLOORGUARD security alert';
    const body = `${event.description} • ${new Date(event.timestamp).toLocaleTimeString()}`;
    const registration = await navigator.serviceWorker?.ready.catch(() => null);
    if (registration) {
      await registration.showNotification(title, { body, icon: '/favicon.png', badge: '/favicon.png', tag: event.id });
    } else {
      new Notification(title, { body, icon: '/favicon.png', tag: event.id });
    }
  }
}
