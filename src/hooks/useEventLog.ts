import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { SecurityEvent, EventFilterCriteria } from '../types/events';
import { ApiClient } from '../services/apiClient';
import { getEventsQuery, upsertEvent, removeCachedEvent } from '../services/dashboardData';

export function useEventLog() {
  const [filters, setFilters] = useState<EventFilterCriteria>({});
  const [page, setPage] = useState(1);
  const resource = useMemo(() => getEventsQuery(filters, page), [filters, page]);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot);
  useEffect(() => { void resource.load(); }, [resource]);
  const acknowledge = useCallback(async (id: string, operator = 'Security Operator') => {
    const response = await ApiClient.acknowledgeEvent(id, operator);
    if (response.success) upsertEvent(response.data, false);
  }, []);
  const removeEvent = useCallback(async (id: string) => {
    const response = await ApiClient.deleteEvent(id);
    if (response.success) removeCachedEvent(id);
  }, []);
  const clearAll = useCallback(async () => {
    const response = await ApiClient.clearAllEvents();
    if (response.success) removeCachedEvent();
  }, []);
  const pushLocalEvent = useCallback(async (payload: Partial<SecurityEvent>) => {
    const response = await ApiClient.createEvent(payload);
    if (response.success && response.data) upsertEvent(response.data);
  }, []);
  return {
    events: snapshot.data?.data || [], filters, setFilters, page, setPage,
    totalPages: snapshot.data?.totalPages || 1, totalCount: snapshot.data?.total || 0,
    isLoading: snapshot.isLoading, isRefreshing: snapshot.isRefreshing, error: snapshot.error,
    acknowledge, removeEvent, clearAll, pushLocalEvent, refetch: () => resource.load(true),
  };
}
