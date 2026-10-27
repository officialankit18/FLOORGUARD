import { ApiClient } from './apiClient';
import { QueryResource } from './queryCache';
import { subscribeLive } from './liveConnection';
import { EventFilterCriteria, SecurityEvent } from '../types/events';

type EventResponse = Awaited<ReturnType<typeof ApiClient.getEvents>>;
const eventQueries = new Map<string, { resource: QueryResource<EventResponse>; filters: EventFilterCriteria; page: number }>();
let receivedHandshake = false;
export const devicesQuery = new QueryResource(() => ApiClient.getDevices(), 30_000);
export const profilesQuery = new QueryResource(() => ApiClient.getProfiles());
export const healthQuery = new QueryResource(() => ApiClient.getHealth(), 30_000);
export function getEventsQuery(filters: EventFilterCriteria = {}, page = 1) {
  const key = JSON.stringify([page, filters.eventType || '', filters.severity || '', filters.mode || '', filters.search || '', filters.acknowledged ?? null]);
  if (!eventQueries.has(key)) eventQueries.set(key, { resource: new QueryResource(() => ApiClient.getEvents(filters, page, 25)), filters: { ...filters }, page });
  return eventQueries.get(key)!.resource;
}
function matches(event: SecurityEvent, filters: EventFilterCriteria) {
  return (!filters.eventType || event.eventType.toLowerCase() === filters.eventType.toLowerCase())
    && (!filters.severity || event.severity === filters.severity)
    && (!filters.mode || event.mode === filters.mode)
    && (filters.acknowledged == null || event.acknowledged === filters.acknowledged)
    && (!filters.search || [event.description, event.eventType, event.source, event.metadata?.recognizedName].some(value => value?.toLowerCase().includes(filters.search!.toLowerCase())));
}
export function upsertEvent(event: SecurityEvent, isNew = true) {
  for (const { resource, filters, page } of eventQueries.values()) {
    resource.update(current => {
      if (!current) return current;
      const existing = current.data.some(item => item.id === event.id);
      const included = matches(event, filters);
      const total = Math.max(0, current.total + (existing ? (included ? 0 : -1) : (included && isNew ? 1 : 0)));
      const data = current.data.filter(item => item.id !== event.id);
      if (included && (existing || page === 1)) data.push(event);
      return { ...current, data: data.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 25), total, totalPages: Math.ceil(total / 25) };
    });
    if (page > 1) resource.invalidate();
  }
}
export function removeCachedEvent(id?: string) {
  for (const { resource } of eventQueries.values()) resource.update(current => {
    if (!current) return current;
    const total = id ? Math.max(0, current.total - (current.data.some(event => event.id === id) ? 1 : 0)) : 0;
    return { ...current, data: id ? current.data.filter(event => event.id !== id) : [], total, totalPages: Math.ceil(total / 25) };
  });
}
subscribeLive(message => {
  if (message.type === 'NEW_SECURITY_EVENT') upsertEvent(message.data);
  if (message.type === 'DEVICE_TELEMETRY_UPDATE') devicesQuery.update(current => ({ success: true, data: [message.data, ...(current?.data.filter(device => device.deviceId !== message.data.deviceId) || [])] }));
  if (message.type === 'CONNECTION_ESTABLISHED') {
    void devicesQuery.load(receivedHandshake);
    for (const { resource } of eventQueries.values()) void resource.load(receivedHandshake);
    receivedHandshake = true;
  }
});
export function preloadDashboard() {
  void devicesQuery.load();
  void getEventsQuery().load();
}
