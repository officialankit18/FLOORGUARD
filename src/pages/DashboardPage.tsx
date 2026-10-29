import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CameraOff, Check, CircleAlert, Users, ShieldCheck, TriangleAlert, LockKeyhole, UnlockKeyhole, Maximize } from 'lucide-react';
import { historyQuery, isIntrusion } from '../services/securityWorkflow';
import { useMqttConnection } from '../hooks/useMqttConnection';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { devicesQuery, profilesQuery } from '../services/dashboardData';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { normalizeRelayUrl } from '../services/cameraRelay';
import { useRelayFeed } from '../hooks/useRelayFeed';

const HouseIllustration = () => <img className="fg-home-hero-image" src="/branding/home-hero-blue.png" alt="" fetchPriority="high" />;

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const DashboardPage: React.FC = () => {
  const { device, wsConnected } = useDeviceStatus();
  const history = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  const { openDoor, closeDoor, commandStatus, doorSignal } = useMqttConnection();
  const [notice, setNotice] = useState('');
  const [requestedDoorState, setRequestedDoorState] = useState<boolean | null>(null);
  const [hour, setHour] = useState(new Date().getHours());
  useEffect(() => { void historyQuery.load(); const timer = setInterval(() => setHour(new Date().getHours()), 30000); return () => clearInterval(timer); }, []);
  const profiles = useSyncExternalStore(profilesQuery.subscribe, profilesQuery.getSnapshot);
  const { settings } = useFloorGuardSettings();
  const relayUrl = normalizeRelayUrl(settings.cameraRelayUrl || '') || normalizeRelayUrl(`http://${location.hostname}:3012`);
  useEffect(() => { void profilesQuery.load(); }, []);
  useEffect(() => {
    const refreshLiveData = () => {
      if (document.visibilityState !== 'visible') return;
      void historyQuery.load(); void profilesQuery.load(); void devicesQuery.load();
    };
    document.addEventListener('visibilitychange', refreshLiveData);
    window.addEventListener('focus', refreshLiveData);
    return () => { document.removeEventListener('visibilitychange', refreshLiveData); window.removeEventListener('focus', refreshLiveData); };
  }, []);
  useEffect(() => { if (doorSignal !== null) setRequestedDoorState(doorSignal); }, [doorSignal]);

  const alert = device.isTriggered || device.buzzerState;
  const displayName = profiles.data?.data[0]?.name?.split(' ')[0] || 'there';
  const secure = wsConnected && device.status === 'Connected' && !alert;
  const today = (history.data || []).filter(event => new Date(event.timestamp).toDateString() === new Date().toDateString());
  const known = today.filter(event => event.eventType === 'Known Face Match').length;
  const unknown = today.filter(event => event.eventType === 'Unknown Face').length;
  const stats = [{ label: 'Visitors', value: known + unknown, icon: Users }, { label: 'Verified', value: known, icon: ShieldCheck }, { label: 'Unknown', value: unknown, icon: Users }, { label: 'Alerts', value: today.filter(isIntrusion).length, icon: TriangleAlert }];
  const relayHint = relayUrl ? '' : 'Add the local Wi-Fi relay address in Settings to start live cameras.';
  const doorOpen = doorSignal ?? requestedDoorState;
  const requestDoorState = (open: boolean) => {
    const sent = open ? openDoor() : closeDoor();
    if (sent) { setRequestedDoorState(open); setNotice(open ? 'Door opening request sent.' : 'Door closing request sent.'); }
    else setNotice('Set up your door connection and opening signal first.');
  };

  return <main className={`fg-new-home ${alert ? 'is-alert' : ''}`}>
    <section className="fg-home-welcome">
      <div className="fg-home-copy"><p>{greetingFor(hour)},</p><h1>{displayName}!</h1><span>{alert ? 'Your home needs your attention.' : secure ? 'Your home is safe and protected.' : 'Keeping an eye on your home.'}</span></div>
      <HouseIllustration />
    </section>

    <section className={`fg-live-status ${alert ? 'alert' : ''}`} aria-live="polite">
      <span className="fg-status-shield">{alert ? <CircleAlert /> : <Check />}</span>
      <div><h2>{alert ? 'Intrusion detected' : secure ? 'System secure' : 'System connecting'}</h2><p>{alert ? 'Floor-sensor activity was reported. Check the live cameras now.' : secure ? 'No intrusion detected. All devices are working properly.' : 'Connecting to your FLOORGUARD devices…'}</p></div>
      <span className={`fg-live-pill ${alert ? 'alert' : ''}`}><i />{alert ? 'Alert' : secure ? 'Live' : 'Connecting'}</span>
    </section>

    <section className="fg-reference-stats" aria-label="Today's activity">{stats.map(({ label, value, icon: Icon }) => <article key={label}><span><Icon /></span><b>{history.data ? value : '—'}</b><p>{label}</p></article>)}</section>
    <section className="fg-reference-controls"><h2>Quick Control</h2><div><button className={doorOpen === true ? 'is-open' : ''} aria-pressed={doorOpen === true} onClick={() => requestDoorState(true)}><UnlockKeyhole /><span><b>Open</b>Door</span></button><button className={doorOpen === false ? 'is-closed' : ''} aria-pressed={doorOpen === false} onClick={() => requestDoorState(false)}><LockKeyhole /><span><b>Close</b>Door</span></button></div>{(notice || commandStatus !== 'No pending door request') && <p role="status">{notice || commandStatus}</p>}</section>

    <section className="fg-live-cameras" aria-labelledby="live-cameras-title">
      <div className="fg-live-heading"><h2 id="live-cameras-title">Live Camera Preview</h2></div>
      <CameraFeed label="Entrance Camera" subtitle="ESP32 entrance camera" relayUrl={relayUrl} camera="esp32" />
      <CameraFeed label="Cam 2" subtitle="Door camera · laptop" relayUrl={relayUrl} camera="laptop" />
      {relayHint && <p className="fg-camera-help">{relayHint}</p>}
    </section>
  </main>;
};

function CameraFeed({ label, subtitle, relayUrl, camera }: { label: string; subtitle: string; relayUrl: string; camera: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const feed = useRelayFeed(relayUrl, camera, imageRef);
  const ready = Boolean(relayUrl);
  const live = ready && feed.status === 'Live relay';
  const [aspectRatio, setAspectRatio] = useState('4 / 3');
  return <article className="fg-home-camera"><div className="fg-camera-frame" style={{ aspectRatio }}><img ref={imageRef} src={feed.src || undefined} alt="" onLoad={event => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalWidth && naturalHeight) setAspectRatio(`${naturalWidth} / ${naturalHeight}`); }} style={{ opacity: live ? 1 : 0 }} />{!live && <div className="fg-camera-offline"><CameraOff size={28} /><span>{ready ? feed.status : 'Camera waiting'}</span></div>}<span className={`fg-camera-live ${live ? '' : 'offline'}`}><i />{live ? 'Live' : 'Offline'}</span><button className="fg-camera-expand" aria-label={`Expand ${label}`} onClick={event => { void event.currentTarget.parentElement?.requestFullscreen?.().catch(() => undefined); }}><Maximize /></button></div><footer><div><h3>{label}</h3><p>{subtitle}</p></div><span className="fg-camera-state">{live ? '● Live' : 'Connecting'}</span></footer></article>;
}
