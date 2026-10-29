import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Camera, Settings, History, UsersRound, Menu, Bell, X } from 'lucide-react';

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
          <button className="fg-header-icon" aria-label="Notifications" onClick={() => setPanel(panel === 'notifications' ? '' : 'notifications')}><Bell /></button>
        </div>
        {panel && <div className="fg-header-panel"><button aria-label="Close panel" onClick={() => setPanel('')}><X size={18}/></button><strong>{panel === 'menu' ? 'FLOORGUARD' : 'Notifications'}</strong><p>{panel === 'menu' ? 'Use the bottom navigation to explore the app.' : 'Live intrusion alerts will appear automatically.'}</p></div>}
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
