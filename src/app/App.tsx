import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MobileAppChrome } from '../components/layout/MobileAppChrome';
import { DashboardPage } from '../pages/DashboardPage';
import { SplashScreen } from '../components/branding/SplashScreen';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { MqttProvider } from '../hooks/useMqttConnection';
import { startLiveConnection } from '../services/liveConnection';
import { preloadDashboard } from '../services/dashboardData';
import { LiveAlarm } from '../components/security/LiveAlarm';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
const HistoryPage = lazy(() => import('../pages/HistoryPage').then(module => ({ default: module.HistoryPage })));

const CameraPage = lazy(() => import('../pages/CameraPage').then(module => ({ default: module.CameraPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then(module => ({ default: module.SettingsPage })));

export const App: React.FC = () => {
  const { settings } = useFloorGuardSettings();
  useEffect(() => { document.documentElement.dataset.theme = settings.theme || 'light'; }, [settings.theme]);
  useAlertNotifications();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    preloadDashboard();
    startLiveConnection();
    const timer = window.setTimeout(() => setIsLoading(false), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <MqttProvider>
    <BrowserRouter>
      <LiveAlarm />
      {isLoading && <SplashScreen />}
      <MobileAppChrome>
        <Suspense fallback={<div className="mx-auto max-w-xl px-5 py-8" role="status"><div className="h-44 animate-pulse rounded-3xl bg-fg-yellowSoft" /><p className="mt-4 text-sm text-fg-muted">Opening…</p></div>}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/camera" element={null} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/project" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PersistentCamera />
        </Suspense>
      </MobileAppChrome>
    </BrowserRouter>
    </MqttProvider>
  );
};

function PersistentCamera() {
  const { pathname } = useLocation();
  const [activated, setActivated] = useState(pathname === '/camera');
  useEffect(() => { if (pathname === '/camera') setActivated(true); }, [pathname]);
  return activated ? <div hidden={pathname !== '/camera'}><CameraPage /></div> : null;
}
