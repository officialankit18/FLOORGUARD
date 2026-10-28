import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Download, Search, CalendarDays, ArrowUpRight, Radio, Image as ImageIcon } from 'lucide-react';
import { filterHistory, historyCsv, historyQuery, isIntrusion } from '../services/securityWorkflow';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { SecurityEvent } from '../types/events';

const localDay = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const HistoryPage: React.FC = () => {
  const snapshot = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  const { wsConnected } = useDeviceStatus();
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [category, setCategory] = useState(''), [search, setSearch] = useState('');
  const [visible, setVisible] = useState(8);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  useEffect(() => { void historyQuery.load(); }, []);
  useEffect(() => setVisible(8), [from, to, category, search]);
  const events = useMemo(() => filterHistory(snapshot.data || [], from, to, category, search), [snapshot.data, from, to, category, search]);
  const now = new Date();
  const today = localDay(now.toISOString());
  const yesterday = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString());
  const dated = Boolean(from || to);
  const timeline = useMemo(() => dated ? events : events.filter(event => [today, yesterday].includes(localDay(event.timestamp))), [events, dated, today, yesterday]);
  const groups = useMemo(() => {
    const result = new Map<string, SecurityEvent[]>();
    timeline.slice(0, visible).forEach(event => { const day = localDay(event.timestamp); result.set(day, [...(result.get(day) || []), event]); });
    return [...result];
  }, [timeline, visible]);
  const people = useMemo(() => {
    const counts = new Map<string, number>();
    timeline.filter(event => event.eventType === 'Known Face Match').forEach(event => { const name = event.metadata?.recognizedName || 'Household member'; counts.set(name, (counts.get(name) || 0) + 1); });
    return [...counts];
  }, [timeline]);
  const download = async () => {
    if (!events.length || exporting) return;
    setExporting(true); setExportNotice('Preparing history and images…');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const photos = zip.folder('images')!;
      const files = new Map<string, string>();
      let missing = 0;
      const withImages = events.filter(event => event.metadata?.snapshotUrl);
      for (let index = 0; index < withImages.length; index++) {
        const event = withImages[index];
        setExportNotice(`Adding images ${index + 1} of ${withImages.length}…`);
        try {
          const response = await fetch(event.metadata!.snapshotUrl!);
          if (!response.ok) throw new Error('Image unavailable');
          const blob = await response.blob();
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Unexpected image format');
          const filename = `${event.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
          photos.file(filename, blob);
          files.set(event.id, `images/${filename}`);
        } catch { missing++; }
      }
      zip.file('history.csv', '\ufeff' + historyCsv(events, files));
      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a'); link.href = url; link.download = `floorguard-history-${from || 'all'}-${to || 'latest'}.zip`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportNotice(missing ? `Downloaded history. ${missing} image${missing === 1 ? ' was' : 's were'} unavailable.` : 'History and images downloaded.');
    } catch { setExportNotice('Download failed. Please try again.'); }
    finally { setExporting(false); }
  };
  return <main className="fg-page"><div className="fg-page-heading"><div><span className="fg-eyebrow">Your home's story</span><h1>Activity history</h1><p>Every arrival. Every alert. All in one place.</p></div><CalendarDays size={30} /></div>
    <section className="fg-card space-y-4"><div className="fg-section-title"><h2>Find an activity</h2><span className={`fg-history-live ${wsConnected ? 'online' : ''}`}><Radio size={14} />{wsConnected ? 'Live' : 'Connecting'}</span></div><p className="fg-muted">Today and yesterday appear below. Choose dates to see older activity.</p><div className="grid grid-cols-2 gap-3"><label>From<input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input aria-label="To date" type="date" min={from} value={to} onChange={e => setTo(e.target.value)} /></label></div>{dated && <button type="button" className="fg-history-clear" onClick={() => { setFrom(''); setTo(''); }}>Back to today & yesterday</button>}<select aria-label="Activity type" value={category} onChange={e => setCategory(e.target.value)}><option value="">All activity</option><option value="Known Face Match">Verified arrivals</option><option value="Unknown Face">Unverified visitors</option><option value="intrusion">Floor intrusions</option><option value="Door Open Requested">Door requests</option><option value="Alarm Stopped">Stopped alarms</option></select><div className="flex items-center gap-2"><Search size={18} /><input aria-label="Search history" placeholder="Search a name or activity…" value={search} onChange={e => setSearch(e.target.value)} /></div></section>
    <div className="fg-stats"><div><b>{timeline.filter(e => e.eventType === 'Known Face Match').length}</b><span>Verified</span></div><div><b>{timeline.filter(e => e.eventType === 'Unknown Face').length}</b><span>Unverified</span></div><div><b>{timeline.filter(isIntrusion).length}</b><span>Intrusions</span></div></div>
    {!!people.length && <section className="fg-card"><h2>Member visits</h2><div className="mt-3 flex flex-wrap gap-2">{people.map(([name, count]) => <span className="fg-pill" key={name}>{name} · {count} visits</span>)}</div></section>}
    <section className="fg-card fg-history-timeline"><div className="fg-section-title"><h2>Timeline</h2><span className="fg-pill">{timeline.length} activities</span></div><p className="fg-muted mt-2">{dated ? 'Showing your selected dates.' : 'Showing today and yesterday. Choose dates above for older activity.'}</p>{snapshot.isLoading && <p className="mt-4">Loading your history…</p>}{snapshot.error && <p role="alert">History could not refresh. <button onClick={() => void historyQuery.load(true)}>Retry</button></p>}{!snapshot.isLoading && !timeline.length && <p className="fg-history-empty">{dated ? 'No activity matches these dates and filters.' : 'No activity today or yesterday. Choose dates above to explore older history.'}</p>}{groups.map(([day, items]) => <div className="fg-history-day" key={day}><h3>{day === today ? 'Today' : day === yesterday ? 'Yesterday' : new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>{items.map(event => <article key={event.id} className="fg-timeline-item"><div className={`fg-timeline-dot ${isIntrusion(event) ? 'danger' : ''}`} /><div className="min-w-0 flex-1"><h4>{event.metadata?.recognizedName || event.eventType}</h4><p>{event.description}</p><time>{new Date(event.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time></div>{event.metadata?.snapshotUrl && <a href={event.metadata.snapshotUrl} target="_blank" rel="noreferrer" aria-label="View activity image"><img loading="lazy" src={event.metadata.snapshotUrl} className="fg-history-photo" alt="Activity snapshot" /></a>}</article>)}</div>)}{visible < timeline.length && <button className="fg-button secondary w-full mt-4" onClick={() => setVisible(count => count + 8)}>Show more <ArrowUpRight size={16} /></button>}</section>
    <section className="fg-card fg-history-export"><div className="flex items-center gap-3"><ImageIcon size={22} /><div><h2>Keep a copy</h2><p className="fg-muted">Download filtered history with available photos in one ZIP file.</p></div></div><button className="fg-button w-full mt-4" onClick={() => void download()} disabled={!events.length || exporting}><Download size={17} />{exporting ? 'Preparing download…' : 'Download history & images'}</button>{exportNotice && <p className="fg-muted mt-2" role="status">{exportNotice}</p>}</section>
  </main>;
};

