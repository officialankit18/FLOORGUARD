import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Download, Search, CalendarDays, ArrowUpRight } from 'lucide-react';
import { filterHistory, historyCsv, historyQuery, isIntrusion } from '../services/securityWorkflow';

export const HistoryPage: React.FC = () => {
  const snapshot = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [category, setCategory] = useState(''), [search, setSearch] = useState('');
  const [visible, setVisible] = useState(30);
  useEffect(() => { void historyQuery.load(); }, []);
  useEffect(() => setVisible(30), [from, to, category, search]);
  const events = useMemo(() => filterHistory(snapshot.data || [], from, to, category, search), [snapshot.data, from, to, category, search]);
  const people = useMemo(() => {
    const counts = new Map<string, number>();
    events.filter(event => event.eventType === 'Known Face Match').forEach(event => { const name = event.metadata?.recognizedName || 'Household member'; counts.set(name, (counts.get(name) || 0) + 1); });
    return [...counts];
  }, [events]);
  const download = () => {
    const url = URL.createObjectURL(new Blob(['\ufeff', historyCsv(events)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `floorguard-history-${from || 'all'}-${to || 'latest'}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="fg-page"><div className="fg-page-heading"><div><span className="fg-eyebrow">Your home's story</span><h1>Activity history</h1><p>Every arrival. Every alert. All in one place.</p></div><CalendarDays size={30} /></div>
    <section className="fg-card space-y-4"><div className="grid grid-cols-2 gap-3"><label>From<input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input aria-label="To date" type="date" min={from} value={to} onChange={e => setTo(e.target.value)} /></label></div><select aria-label="Activity type" value={category} onChange={e => setCategory(e.target.value)}><option value="">All activity</option><option value="Known Face Match">Verified arrivals</option><option value="Unknown Face">Unverified visitors</option><option value="intrusion">Floor intrusions</option><option value="Door Open Requested">Door requests</option><option value="Alarm Stopped">Stopped alarms</option></select><div className="flex items-center gap-2"><Search size={18} /><input aria-label="Search history" placeholder="Search a name or activity…" value={search} onChange={e => setSearch(e.target.value)} /></div><button className="fg-button" onClick={download} disabled={!events.length}><Download size={17} />Download filtered CSV</button></section>
    <div className="fg-stats"><div><b>{events.filter(e => e.eventType === 'Known Face Match').length}</b><span>Verified</span></div><div><b>{events.filter(e => e.eventType === 'Unknown Face').length}</b><span>Unverified</span></div><div><b>{events.filter(isIntrusion).length}</b><span>Intrusions</span></div></div>
    {!!people.length && <section className="fg-card"><h2>Member visits</h2><div className="mt-3 flex flex-wrap gap-2">{people.map(([name, count]) => <span className="fg-pill" key={name}>{name} · {count} visits</span>)}</div></section>}
    <section className="fg-card"><div className="flex items-center justify-between"><h2>Timeline</h2><span className="fg-pill">{events.length} activities</span></div>{snapshot.isLoading && <p className="mt-4">Loading your history…</p>}{snapshot.error && <p role="alert">History could not refresh. <button onClick={() => void historyQuery.load(true)}>Retry</button></p>}{!snapshot.isLoading && !events.length && <p className="py-8 text-center">No activity matches these filters.</p>}{events.slice(0, visible).map(event => <article key={event.id} className="fg-timeline-item"><div className={`fg-timeline-dot ${isIntrusion(event) ? 'danger' : ''}`} /><div className="min-w-0 flex-1"><h3>{event.metadata?.recognizedName || event.eventType}</h3><p>{event.description}</p><time>{new Date(event.timestamp).toLocaleString()}</time></div>{event.metadata?.snapshotUrl && <a href={event.metadata.snapshotUrl} target="_blank" rel="noreferrer" aria-label="View activity image"><img loading="lazy" src={event.metadata.snapshotUrl} className="h-14 w-14 rounded-xl object-cover" alt="Activity snapshot" /></a>}</article>)}{visible < events.length && <button className="fg-button secondary" onClick={() => setVisible(n => n + 30)}>Show more <ArrowUpRight size={16} /></button>}</section>
  </main>;
};

