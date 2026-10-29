import { ApiClient } from './apiClient';
import { SecurityEvent } from '../types/events';
import { QueryResource } from './queryCache';
import { subscribeLive } from './liveConnection';

export const historyQuery = new QueryResource(async () => {
  const events: SecurityEvent[] = [];
  let page = 1, totalPages = 1;
  do {
    const response = await ApiClient.getEvents({}, page, 100);
    events.push(...response.data);
    totalPages = response.totalPages;
    page++;
  } while (page <= totalPages);
  return events;
}, 15_000);
export const isIntrusion = (event: SecurityEvent) => ['Potential Intrusion', 'Footstep Event'].includes(event.eventType);
subscribeLive(message => {
  if (message.type === 'NEW_SECURITY_EVENT' || message.type === 'SECURITY_EVENT_UPDATED') {
    historyQuery.update(current => current ? [message.data, ...current.filter(event => event.id !== message.data.id)].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) : undefined);
  }
  if (message.type === 'SECURITY_EVENT_DELETED' && typeof message.data?.id === 'string') {
    historyQuery.update(current => current?.filter(event => event.id !== message.data.id));
  }
  if (message.type === 'CONNECTION_ESTABLISHED') void historyQuery.load();
});

export function filterHistory(events: SecurityEvent[], from = '', to = '', category = '', search = '') {
  return events.filter(event => {
    const date = new Date(event.timestamp);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return (!from || day >= from) && (!to || day <= to)
      && (!category || (category === 'intrusion' ? isIntrusion(event) : event.eventType === category))
      && (!search || `${event.metadata?.recognizedName || ''} ${event.description} ${event.eventType}`.toLowerCase().includes(search.toLowerCase()));
  });
}
export function historyCsv(events: SecurityEvent[]) {
  const cell = (value: string) => '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replace(/"/g, '""') + '"';
  return [['Timestamp', 'Event', 'Person', 'Source', 'Description', 'Attended', 'Photo URL'], ...events.map(event => [event.timestamp, event.eventType, event.metadata?.recognizedName || '', event.source, event.description, event.acknowledged ? 'Yes' : 'No', event.metadata?.snapshotUrl ? new URL(event.metadata.snapshotUrl, window.location.origin).href : ''])].map(row => row.map(cell).join(',')).join('\r\n');
}
