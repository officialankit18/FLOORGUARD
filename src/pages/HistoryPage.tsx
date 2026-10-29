import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, Download, Filter, ListChecks, LockKeyhole, Search, ShieldCheck, Trash2, TriangleAlert, UserRoundX, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiClient } from '../services/apiClient';
import { removeCachedEvent } from '../services/dashboardData';
import { filterHistory, historyCsv, historyQuery, isIntrusion } from '../services/securityWorkflow';
import type { SecurityEvent } from '../types/events';

type Category = 'all' | 'verified' | 'unknown' | 'intrusion';
const isTechnicalConfirmation = (event: SecurityEvent) => event.eventType === 'Door Signal Confirmed' || event.eventType === 'Alarm Stop Confirmed';
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function eventKind(event: SecurityEvent): 'verified' | 'unknown' | 'intrusion' | 'door' | 'other' {
  if (isIntrusion(event)) return 'intrusion';
  if (event.eventType === 'Unknown Face' || event.eventType === 'Verification Required') return 'unknown';
  if (event.eventType === 'Known Face Match' || event.eventType === 'Visitor Attended') return 'verified';
  if (event.eventType.includes('Door')) return 'door';
  return 'other';
}
function eventTitle(event: SecurityEvent) {
  if (event.eventType === 'Known Face Match' || event.eventType === 'Visitor Attended') return 'Visitor Attended';
  if (isIntrusion(event)) return 'Floor Mat Alert';
  if (event.eventType === 'Floor Object Detected') return 'Object on Floor Mat';
  if (event.eventType === 'Floor Verification Unavailable') return 'Floor Verification Unavailable';
  if (event.eventType === 'Door Opened') return 'Door Opened';
  if (event.eventType === 'Door Open Requested') return 'Door Open Requested';
  if (event.eventType === 'Door Close Requested') return 'Door Close Requested';
  return event.eventType;
}

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const snapshot = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  const today = localDate(new Date());
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [category, setCategory] = useState<Category>('all'), [search, setSearch] = useState('');
  const [photosOnly, setPhotosOnly] = useState(false), [visible, setVisible] = useState(20);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  useEffect(() => { void historyQuery.load(); }, []);
  useEffect(() => { setVisible(20); setSelected(new Set()); setConfirmDelete(false); }, [from, to, category, search, photosOnly]);
  const events = useMemo(() => filterHistory(snapshot.data || [], from, to, '', search)
    .filter(event => !isTechnicalConfirmation(event) && (category === 'all' || eventKind(event) === category) && (!photosOnly || !!event.metadata?.snapshotUrl))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [snapshot.data, from, to, category, search, photosOnly]);
  const shown = events.slice(0, visible);
  const toggleSelected = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const closeSelection = () => { setSelectMode(false); setSelected(new Set()); setConfirmDelete(false); setDeleteMessage(''); };
  const deleteSelected = async () => {
    if (!selected.size || deleting) return;
    setDeleting(true); setDeleteMessage('');
    const ids = [...selected];
    const deleted: string[] = [];
    for (let offset = 0; offset < ids.length; offset += 5) {
      const batch = ids.slice(offset, offset + 5);
      const results = await Promise.allSettled(batch.map(id => ApiClient.deleteEvent(id)));
      results.forEach((result, index) => { if (result.status === 'fulfilled') deleted.push(batch[index]); });
    }
    if (deleted.length) {
      const removed = new Set(deleted);
      historyQuery.update(current => current?.filter(event => !removed.has(event.id)));
      deleted.forEach(removeCachedEvent);
      void historyQuery.load(true);
    }
    setSelected(new Set(ids.filter(id => !deleted.includes(id))));
    setConfirmDelete(false); setDeleting(false);
    if (deleted.length === ids.length) { setSelectMode(false); setDeleteMessage(`${deleted.length} ${deleted.length === 1 ? 'entry' : 'entries'} deleted.`); }
    else setDeleteMessage(`${deleted.length} of ${ids.length} deleted. Please retry the remaining entries.`);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob(['\ufeff', historyCsv(events)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `floorguard-history-${from || 'all'}-${to || 'latest'}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = () => { setFrom(today); setTo(today); setCategory('all'); setSearch(''); setPhotosOnly(false); };
  return <main className="fg-activity-page">
    <header className="fg-activity-title"><button type="button" onClick={() => navigate('/')} aria-label="Go home"><ArrowLeft /></button><h1>Activity History</h1><button type="button" onClick={() => selectMode ? closeSelection() : (setSelectMode(true), setDeleteMessage(''))} aria-label={selectMode ? 'Cancel selection' : 'Select history entries'}>{selectMode ? <X /> : <ListChecks />}</button></header>
    <section className="fg-activity-range" aria-label="Date range"><CalendarDays aria-hidden="true" /><label><span className="sr-only">From date</span><input aria-label="From date" type="date" max={to || undefined} value={from} onChange={e => setFrom(e.target.value)} /></label><ArrowRight aria-hidden="true" /><label><span className="sr-only">To date</span><input aria-label="To date" type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} /></label></section>
    <div className="fg-activity-tabs" role="group" aria-label="Activity type">{(['all', 'verified', 'unknown', 'intrusion'] as Category[]).map(item => <button key={item} type="button" aria-pressed={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item === 'all' ? 'All' : item === 'verified' ? 'Verified' : item === 'unknown' ? 'Unknown' : 'Intrusion'}</button>)}</div>
    <div className="fg-activity-search"><label><Search aria-hidden="true" /><input aria-label="Search by name or event" placeholder="Search by name or event..." value={search} onChange={e => setSearch(e.target.value)} /></label><button type="button" aria-label={photosOnly ? 'Show all events' : 'Show events with photos only'} aria-pressed={photosOnly} className={photosOnly ? 'active' : ''} onClick={() => setPhotosOnly(!photosOnly)}><Filter /></button></div>
    {selectMode && <div className="fg-activity-selection"><button type="button" onClick={() => setSelected(current => shown.every(event => current.has(event.id)) ? new Set([...current].filter(id => !shown.some(event => event.id === id))) : new Set([...current, ...shown.map(event => event.id)]))} disabled={!shown.length}>{shown.length && shown.every(event => selected.has(event.id)) ? 'Deselect visible' : 'Select visible'}</button><span>{selected.size} selected</span><button type="button" className="danger" disabled={!selected.size || deleting} onClick={() => setConfirmDelete(true)}><Trash2 />Delete</button></div>}
    {confirmDelete && <div className="fg-activity-confirm" role="alertdialog" aria-label="Confirm history deletion"><strong>Delete {selected.size} selected {selected.size === 1 ? 'entry' : 'entries'}?</strong><p>Saved photos for these entries will also be removed. This cannot be undone.</p><div><button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button><button type="button" className="danger" onClick={() => void deleteSelected()} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete entries'}</button></div></div>}
    {deleteMessage && <p className="fg-activity-message" role="status">{deleteMessage}</p>}
    <section className="fg-activity-timeline" aria-label="Activity timeline">{snapshot.isLoading && !snapshot.data && <p className="fg-activity-message">Loading activity…</p>}{snapshot.error && <p className="fg-activity-message" role="alert">History could not refresh. <button onClick={() => void historyQuery.load(true)}>Retry</button></p>}{!snapshot.isLoading && !events.length && <p className="fg-activity-message">No activity matches this date or filter.</p>}{shown.map(event => <ActivityCard key={event.id} event={event} selectable={selectMode} selected={selected.has(event.id)} onSelect={() => toggleSelected(event.id)} />)}</section>
    {visible < events.length && <button className="fg-activity-more" onClick={() => setVisible(n => n + 20)}>Show more activity</button>}
    <div className="fg-activity-footer"><button type="button" className="download" onClick={download} disabled={!events.length}><Download />Download CSV</button><button type="button" className="clear" onClick={reset}>Clear Filters</button></div>
  </main>;
};

const ActivityCard: React.FC<{ event: SecurityEvent; selectable: boolean; selected: boolean; onSelect: () => void }> = ({ event, selectable, selected, onSelect }) => {
  const kind = eventKind(event), image = event.metadata?.snapshotUrl;
  const detail = event.metadata?.recognizedName || event.description;
  const time = new Date(event.timestamp).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const Icon = kind === 'verified' ? ShieldCheck : kind === 'unknown' ? UserRoundX : kind === 'intrusion' ? TriangleAlert : kind === 'door' ? LockKeyhole : Camera;
  return <article className={`fg-activity-item ${kind}${selectable ? ' selectable' : ''}${selected ? ' selected' : ''}`}><span className="fg-activity-node" aria-hidden="true" /><div className="fg-activity-card">{selectable && <label className="fg-activity-pick"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${eventTitle(event)} at ${time}`} /></label>}{image ? <a className="fg-activity-photo" href={image} target="_blank" rel="noreferrer" aria-label={`View photo for ${eventTitle(event)}`}><img src={image} alt={`${eventTitle(event)} snapshot`} loading="lazy" /></a> : <span className="fg-activity-photo placeholder"><Icon aria-hidden="true" /></span>}<div className="fg-activity-details"><h2>{eventTitle(event)}</h2><p>{detail}</p><time dateTime={event.timestamp}>{time}</time></div><span className="fg-activity-badge">{kind === 'verified' ? 'Verified' : kind === 'unknown' ? 'Unknown' : kind === 'intrusion' ? 'Intrusion' : kind === 'door' ? 'Door' : 'Activity'}</span></div></article>;
};
