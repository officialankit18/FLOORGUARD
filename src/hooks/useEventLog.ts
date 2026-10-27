import { useState, useEffect, useCallback, useRef } from 'react';
import { SecurityEvent, EventFilterCriteria } from '../types/events';
import { ApiClient } from '../services/apiClient';

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export function useEventLog() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [filters, setFilters] = useState<EventFilterCriteria>({});
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await ApiClient.getEvents(filters, page, 25);
      if (res.success) {
        setEvents(res.data);
        setTotalPages(res.totalPages);
        setTotalCount(res.total);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load event history.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Live WebSocket listener to prepend new events
  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'NEW_SECURITY_EVENT') {
            const newEvt: SecurityEvent = payload.data;
            setEvents(prev => [newEvt, ...prev]);
            setTotalCount(prev => prev + 1);
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const acknowledge = useCallback(async (id: string, operator = 'Security Operator') => {
    try {
      const res = await ApiClient.acknowledgeEvent(id, operator);
      if (res.success) {
        setEvents(prev =>
          prev.map(e => (e.id === id ? { ...e, acknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy: operator } : e))
        );
      }
    } catch (err: any) {
      console.warn('Failed to acknowledge event:', err);
    }
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    try {
      await ApiClient.deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      console.warn('Failed to delete event:', err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await ApiClient.clearAllEvents();
      setEvents([]);
      setTotalCount(0);
    } catch (err: any) {
      console.warn('Failed to clear events:', err);
    }
  }, []);

  const pushLocalEvent = useCallback(async (eventPayload: Partial<SecurityEvent>) => {
    try {
      const res = await ApiClient.createEvent(eventPayload);
      if (res.success && res.data) {
        setEvents(prev => [res.data, ...prev]);
        setTotalCount(prev => prev + 1);
      }
    } catch (e) {
      console.warn('Failed to create event:', e);
    }
  }, []);

  return {
    events,
    filters,
    setFilters,
    page,
    setPage,
    totalPages,
    totalCount,
    isLoading,
    error,
    acknowledge,
    removeEvent,
    clearAll,
    pushLocalEvent,
    refetch: fetchEvents,
  };
}
