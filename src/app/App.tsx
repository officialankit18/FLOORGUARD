import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MobileAppChrome } from '../components/layout/MobileAppChrome';
import { DashboardPage } from '../pages/DashboardPage';
import { SplashScreen } from '../components/branding/SplashScreen';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { MqttProvider } from '../hooks/useMqttConnection';
import { startLiveConnection } from '../services/liveConnection';
import { preloadDashboard } from '../services/dashboardData';

const CameraPage = lazy(() => import('../pages/CameraPage').then(module => ({ default: module.CameraPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then(module => ({ default: module.SettingsPage })));

export const App: React.FC = () => {
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
      {isLoading && <SplashScreen />}
      <MobileAppChrome>
        <Suspense fallback={<div className="mx-auto max-w-xl px-5 py-8" role="status"><div className="h-44 animate-pulse rounded-3xl bg-fg-yellowSoft" /><p className="mt-4 text-sm text-fg-muted">Opening…</p></div>}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/project" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </MobileAppChrome>
    </BrowserRouter>
    </MqttProvider>
  );
};
