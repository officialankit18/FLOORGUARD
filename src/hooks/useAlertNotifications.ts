import { useEffect } from 'react';
import { SecurityEvent } from '../types/events';
import { NotificationService } from '../services/notificationService';

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export function useAlertNotifications() {
  useEffect(() => {
    const enableOnInteraction = () => {
      if ('Notification' in window && Notification.permission === 'default') void NotificationService.enable();
    };
    window.addEventListener('pointerdown', enableOnInteraction, { once: true });

    let ws: WebSocket | undefined;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload.type === 'NEW_SECURITY_EVENT') void NotificationService.notify(payload.data as SecurityEvent);
        } catch { /* ignore malformed live messages */ }
      };
    } catch { /* live reconnect is handled by the existing data hooks */ }

    return () => {
      window.removeEventListener('pointerdown', enableOnInteraction);
      ws?.close();
    };
  }, []);
}
