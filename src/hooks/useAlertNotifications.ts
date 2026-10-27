import { useEffect } from 'react';
import { SecurityEvent } from '../types/events';
import { NotificationService } from '../services/notificationService';
import { subscribeLive } from '../services/liveConnection';

export function useAlertNotifications() {
  useEffect(() => {
    const unsubscribe = subscribeLive(message => {
      if (message.type === 'NEW_SECURITY_EVENT') void NotificationService.notify(message.data as SecurityEvent);
    });
    return unsubscribe;
  }, []);
}
