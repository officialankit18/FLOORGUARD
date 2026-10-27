import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Camera, Settings } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/camera', label: 'Camera', icon: Camera },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const MobileAppChrome: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-fg-surface text-fg-ink pb-24">
      <header className="sticky top-0 z-40 border-b border-fg-line bg-white/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-xl grid-cols-[76px_1fr_76px] items-center px-4 py-1">
          <Link to="/" className="flex items-center" aria-label="FLOOR GUARD home">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-fg-yellow bg-white shadow-sm">
              <img src="/branding/floorguard-logo.png" alt="FLOOR GUARD logo" className="h-full w-full object-contain" />
            </span>
            <span className="sr-only">FLOOR GUARD</span>
          </Link>
          <img
            src="/branding/floorguard-wordmark.png"
            alt="FLOORGUARD — Smart Anti-Theft Floor Mat"
            className="justify-self-center h-24 w-auto max-w-full object-contain"
          />
          <span />
        </div>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-fg-line bg-white/95 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link key={to} to={to} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition ${active ? 'bg-fg-yellow text-fg-ink shadow-sm' : 'text-fg-muted hover:bg-fg-yellowSoft'}`}>
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
