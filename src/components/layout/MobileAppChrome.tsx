import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Camera, Settings, History, UsersRound, Menu, Bell, X } from 'lucide-react';
import { historyQuery } from '../../services/securityWorkflow';
import { NotificationService } from '../../services/notificationService';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/camera', label: 'Camera', icon: Camera },
  { to: '/history', label: 'History', icon: History },
  { to: '/members', label: 'Members', icon: UsersRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const MobileAppChrome: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [panel, setPanel] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem('floorguard.notifications.seen') || 0));
  const [clearedAt, setClearedAt] = useState(() => Number(localStorage.getItem('floorguard.notifications.clearedAt') || 0));
  const history = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  useEffect(() => { void historyQuery.load(); }, []);
  const events = (history.data || []).filter(event => event.mode === 'LIVE_CONNECTED' && Date.parse(event.timestamp) > clearedAt).slice(0, 30);
  const unread = events.filter(event => Date.parse(event.timestamp) > lastSeen).length;
  const openNotifications = () => {
    const next = panel === 'notifications' ? '' : 'notifications';
    setPanel(next);
    if (next) { const now = Date.now(); setLastSeen(now); localStorage.setItem('floorguard.notifications.seen', String(now)); void historyQuery.load(true); }
  };
  const clearNotifications = () => {
    const now = Date.now();
    setClearedAt(now);
    setLastSeen(now);
    localStorage.setItem('floorguard.notifications.clearedAt', String(now));
    localStorage.setItem('floorguard.notifications.seen', String(now));
  };
  return (
    <div className="fg-reference-shell min-h-screen bg-fg-surface text-fg-ink pb-24">
      <header className="sticky top-0 z-40 border-b border-fg-line bg-white/95 backdrop-blur-md">
        <div className="fg-brand-header mx-auto grid max-w-xl items-center px-4 py-3">
          <button className="fg-header-icon" aria-label="Open menu" onClick={() => setPanel(panel === 'menu' ? '' : 'menu')}><Menu /></button>
          <Link to="/" className="fg-centered-brand" aria-label="FLOOR GUARD home">
            <span className="fg-brand-emblem flex items-center justify-center">
              <img src="/icons/emblem-transparent.png" width="256" height="256" alt="FLOOR GUARD logo" className="h-full w-full object-contain" />
            </span>
            <span className="sr-only">FLOOR GUARD</span>
          <img
            src="/branding/floorguard-wordmark.svg"
            alt="FLOORGUARD — Smart Anti-Theft Floor Mat"
            className="fg-brand-wordmark block w-full min-w-0 justify-self-center object-contain"
          />
          </Link>
          <button className="fg-header-icon fg-notification-trigger" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`} onClick={openNotifications}><Bell />{unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}</button>
        </div>
        {panel && <div className="fg-header-panel"><button className="fg-panel-close" aria-label="Close panel" onClick={() => setPanel('')}><X size={18}/></button><strong>{panel === 'menu' ? 'FLOORGUARD' : 'Notifications'}</strong>{panel === 'menu' ? <div className="fg-menu-links"><Link to="/working-model" onClick={() => setPanel('')}>Working Model <span>See the complete visitor and intrusion flow</span></Link><Link to="/about" onClick={() => setPanel('')}>About Team 5G <span>Meet the people behind FLOORGUARD</span></Link></div> : <><div className="fg-notification-heading"><p>Recent home activity</p><button type="button" onClick={clearNotifications} disabled={!events.length}>Clear all</button></div><div className="fg-notification-list">{events.length ? events.map(event => <article key={event.id} className={event.severity === 'critical' ? 'critical' : ''}>{event.metadata?.snapshotUrl && <img src={event.metadata.snapshotUrl} alt="Event snapshot" loading="lazy" />}<div><b>{event.eventType}</b><p>{event.description}</p><time>{new Date(event.timestamp).toLocaleString()}</time></div></article>) : <p>{history.isLoading ? 'Loading activity…' : 'No recent notifications.'}</p>}</div><button type="button" className="fg-enable-notifications" onClick={() => void NotificationService.enablePush().then(setNotificationStatus).catch(error => setNotificationStatus(error instanceof Error ? error.message : 'Could not enable notifications.'))}>Enable phone notifications</button>{notificationStatus && <p role="status">{notificationStatus}</p>}<Link to="/history" onClick={() => setPanel('')}>View all history</Link></>}</div>}
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-fg-line bg-white/95 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link key={to} to={to!} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition ${active ? 'bg-fg-yellow text-fg-ink shadow-sm' : 'text-fg-muted hover:bg-fg-yellowSoft'}`}>
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
