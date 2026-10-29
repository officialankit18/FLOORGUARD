import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Camera, CameraOff, Expand, RefreshCw, Settings2, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { ApiClient } from '../services/apiClient';
import { FaceRecognitionService } from '../services/faceRecognitionService';
import { EnrolledProfile } from '../types/profiles';
import { ProfileManager } from '../components/security/ProfileManager';
import { profilesQuery } from '../services/dashboardData';
import { useMqttConnection } from '../hooks/useMqttConnection';
import { normalizeRelayUrl } from '../services/cameraRelay';
import { useRelayFeed } from '../hooks/useRelayFeed';
import { NotificationService } from '../services/notificationService';

type CameraSource = 'esp32' | 'laptop';
const EMPTY_PROFILES: EnrolledProfile[] = [];

export const CameraPage: React.FC = () => {
  const [source, setSource] = useState<CameraSource>('esp32');
  const profileSnapshot = useSyncExternalStore(profilesQuery.subscribe, profilesQuery.getSnapshot);
  const profiles = profileSnapshot.data?.data || EMPTY_PROFILES;
  const [profileOpen, setProfileOpen] = useState(false);
  const [espReady, setEspReady] = useState(false);
  const [visionStatus, setVisionStatus] = useState('Preparing face verification…');
  const [lastResult, setLastResult] = useState<'waiting' | 'known' | 'unknown'>('waiting');
  const [lastName, setLastName] = useState('');
  const camera = useCamera();
  const { settings } = useFloorGuardSettings();
  const relayUrl = normalizeRelayUrl(settings.cameraRelayUrl || '') || normalizeRelayUrl(`http://${location.hostname}:3012`);
  const [streamAttempt, setStreamAttempt] = useState(0);
  const retryStream = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(retryStream.current), []);
  const { openDoor } = useMqttConnection();
  const [monitoring, setMonitoring] = useState(true);
  const [actionStatus, setActionStatus] = useState('');
  const espImageRef = useRef<HTMLImageElement>(null);
  const cameraFrameRef = useRef<HTMLDivElement>(null);
  const relayFeed = useRelayFeed(relayUrl, source, espImageRef);
  const visitsRef = useRef(new Map<string, number>());
  const candidateRef = useRef({ name: '', frames: 0 });
  const processingRef = useRef(false);
  const activeRef = useRef({ source, monitoring });
  activeRef.current = { source, monitoring };

  const loadProfiles = useCallback(async () => { await profilesQuery.load(true); }, []);
  useEffect(() => { void profilesQuery.load(); }, []);
  useEffect(() => { FaceRecognitionService.initialize().then(() => setVisionStatus('Face verification ready')).catch(() => setVisionStatus('Face model could not load')); }, []);
  useEffect(() => () => camera.stopCamera(), [camera.stopCamera]);

  const snapshot = useCallback(() => {
    const element = source === 'laptop' && !relayUrl ? camera.videoRef.current : espImageRef.current;
    const width = element instanceof HTMLVideoElement ? element.videoWidth : element?.naturalWidth || 0;
    const height = element instanceof HTMLVideoElement ? element.videoHeight : element?.naturalHeight || 0;
    if (!element || !width || !height) return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.drawImage(element, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }, [camera.videoRef, source, relayUrl]);
  const saveSnapshot = useCallback(() => {
    const image = snapshot();
    if (!image) { setActionStatus('Wait for a live camera frame before taking a snapshot.'); return; }
    const download = document.createElement('a');
    download.href = image; download.download = `floorguard-${source}-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    download.click();
    setActionStatus('Snapshot saved to this device.');
  }, [snapshot, source]);

  const sendRecognitionEvent = useCallback(async (known: boolean, cameraSource: CameraSource, frame: HTMLCanvasElement, name?: string) => {
    const key = known ? name || 'member' : 'visitor';
    const now = Date.now(), lastSeen = visitsRef.current.get(key) || 0;
    visitsRef.current.set(key, now);
    if (now - lastSeen < 15000) return;
    const width = frame.width;
    const height = frame.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(width, 800); canvas.height = Math.round(height * canvas.width / width);
    canvas.getContext('2d')?.drawImage(frame, 0, 0, canvas.width, canvas.height);
    try {
      const event = await ApiClient.createEvent({ eventType: known ? 'Known Face Match' : 'Unknown Face', source: cameraSource === 'esp32' ? 'ESP32-CAM' : 'Local Browser Camera', severity: known ? 'success' : 'warning', mode: 'LIVE_CONNECTED', description: known ? `${name || 'Household member'} verified at entrance.` : 'Someone is at your entrance. Please attend your visitor.', metadata: { recognizedName: name, snapshotUrl: canvas.toDataURL('image/jpeg', 0.75), cameraRole: 'entrance' } });
      if (!known && !event.deduplicated) void NotificationService.notify(event.data);
      if (known && settings.autoOpenDoor && !event.deduplicated && activeRef.current.monitoring && activeRef.current.source === cameraSource) {
        const sent = openDoor();
        setActionStatus(sent ? 'Door opening requested. Awaiting controller response.' : 'Member verified. Configure door signal and connect MQTT to open automatically.');
        if (sent) await ApiClient.createEvent({ eventType: 'Door Open Requested', source: 'Face Verification', severity: 'info', mode: 'LIVE_CONNECTED', description: `Automatic opening requested for ${name}.`, metadata: { recognizedName: name, relatedEventId: event.data.id } });
      }
    } catch { visitsRef.current.delete(key); setActionStatus('Activity could not be saved. Retrying when the connection returns.'); }
  }, [openDoor, settings.autoOpenDoor]);

  const evaluateFrame = useCallback(async (element: HTMLVideoElement | HTMLImageElement, cameraSource: CameraSource) => {
    if (processingRef.current || !FaceRecognitionService.isReady()) return;
    const width = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
    if (!width) return;
    processingRef.current = true;
    try {
      setVisionStatus('Checking face…');
      const frame = document.createElement('canvas');
      const height = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
      frame.width = Math.min(800, width); frame.height = Math.round(height * frame.width / width);
      frame.getContext('2d')?.drawImage(element, 0, 0, frame.width, frame.height);
      const results = await FaceRecognitionService.processVideoFrame(frame, profiles, 0.58);
      if (!activeRef.current.monitoring || activeRef.current.source !== cameraSource) return;
      const primary = results[0];
      if (!primary) { candidateRef.current = { name: '', frames: 0 }; setLastResult('waiting'); setLastName(''); setVisionStatus('Scanning — no face in frame'); return; }
      if (primary.recognitionMatch?.isMatch) {
        const name = primary.recognitionMatch.name;
        candidateRef.current = { name, frames: candidateRef.current.name === name ? candidateRef.current.frames + 1 : 1 };
        if (candidateRef.current.frames < 2) { setVisionStatus('Confirming member identity…'); return; }
        setLastResult('known'); setLastName(primary.recognitionMatch.name); setVisionStatus('Household member verified');
        await sendRecognitionEvent(true, cameraSource, frame, primary.recognitionMatch.name);
      } else {
        setLastResult('unknown'); setLastName('Unverified visitor'); setVisionStatus(profiles.length ? 'Face does not match a member' : 'No member enrolled — visitor is unverified');
        candidateRef.current = { name: '', frames: 0 };
        await sendRecognitionEvent(false, cameraSource, frame);
      }
    } catch {
      setVisionStatus('Face check failed — improve lighting and keep face visible');
    } finally { processingRef.current = false; }
  }, [profiles, sendRecognitionEvent]);

  useEffect(() => {
    if (!monitoring || source !== 'laptop' || !camera.isActive || relayUrl) return;
    const timer = window.setInterval(() => { if (camera.videoRef.current) void evaluateFrame(camera.videoRef.current, 'laptop'); }, 650);
    return () => window.clearInterval(timer);
  }, [camera.isActive, evaluateFrame, source, monitoring, relayUrl]);

  useEffect(() => {
    if (relayUrl || !monitoring || source !== 'esp32' || !settings.espCameraIp) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const inspectEspSnapshot = async () => {
      try {
        const url = relayUrl ? `${relayUrl}/camera/${source}/capture` : `/api/camera/capture?ip=${encodeURIComponent(settings.espCameraIp)}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('capture failed');
        const blobUrl = URL.createObjectURL(await response.blob());
        const frame = new Image();
        try {
          frame.src = blobUrl; await frame.decode();
          if (!cancelled) { setEspReady(true); await evaluateFrame(frame, source); }
        } finally { URL.revokeObjectURL(blobUrl); }
      } catch { if (!cancelled) { setEspReady(false); setVisionStatus(relayUrl ? 'Relay camera offline — check the home laptop and camera connection' : 'ESP32 snapshot unavailable — check IP and camera Wi-Fi'); } }
      finally { if (!cancelled) timer = setTimeout(inspectEspSnapshot, 750); }
    };
    inspectEspSnapshot();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [evaluateFrame, settings.espCameraIp, source, monitoring, relayUrl]);

  useEffect(() => {
    if (!relayUrl || !monitoring) return;
    const timer = setInterval(() => { const image = espImageRef.current; if (image?.getAttribute('src') && image.complete && image.naturalWidth) void evaluateFrame(image, source); }, 650);
    return () => clearInterval(timer);
  }, [relayUrl, source, monitoring, evaluateFrame]);

  const espStream = relayUrl ? `${relayUrl}/camera/${source}/capture?frame=${streamAttempt}` : settings.espCameraIp ? `/api/camera/stream?ip=${encodeURIComponent(settings.espCameraIp)}&retry=${streamAttempt}` : '';
  useEffect(() => { if (relayUrl) camera.stopCamera(); }, [relayUrl, camera.stopCamera]);
  const selectSource = async (next: CameraSource) => { setSource(next); setLastResult('waiting'); setLastName(''); candidateRef.current = { name: '', frames: 0 }; if (next === 'laptop' && !relayUrl && !camera.isActive) await camera.startCamera(); if (next === 'esp32' || relayUrl) camera.stopCamera(); };

  const cameraName = source === 'esp32' ? 'Entrance Camera' : 'Cam 2';
  const cameraDetail = source === 'esp32' ? 'ESP32-CAM · entrance' : 'Laptop camera · local relay';
  const cameraOnline = relayFeed.status === 'Live relay' || (!relayUrl && (source === 'esp32' ? espReady : camera.isActive));

  return <main className="fg-camera-page">
    <header className="fg-camera-title"><button onClick={() => history.back()} aria-label="Go back"><ArrowLeft /></button><h1>Camera</h1><button onClick={() => { location.href = '/settings'; }} aria-label="Camera settings"><Settings2 /></button></header>
    <div className="fg-camera-tabs">{(['esp32', 'laptop'] as CameraSource[]).map(item => <button key={item} onClick={() => void selectSource(item)} className={source === item ? 'active' : ''}>{item === 'esp32' ? 'Entrance Camera' : 'Cam 2'}</button>)}</div>
    <section className="fg-camera-stream" ref={cameraFrameRef}>
      {source === 'esp32' || relayUrl ? (espStream ? <img key={`${source}-${relayUrl}`} ref={espImageRef} crossOrigin="anonymous" src={relayUrl ? relayFeed.src || undefined : espStream} onLoad={() => { setEspReady(true); clearTimeout(retryStream.current); }} onError={() => { setEspReady(false); setVisionStatus('Camera stream unavailable — reconnecting…'); clearTimeout(retryStream.current); if (!relayUrl) retryStream.current = setTimeout(() => setStreamAttempt(n => n + 1), 3000); }} alt={`${cameraName} live stream`} /> : <CameraWaiting />) : <>{camera.isActive ? <video ref={camera.videoRef} autoPlay muted playsInline /> : <CameraWaiting />} {!camera.isActive && <button className="fg-camera-start" onClick={() => void camera.startCamera()}>Start camera</button>}</>}
      <span className={`fg-camera-live-badge ${cameraOnline ? '' : 'offline'}`}><i />{cameraOnline ? 'Live' : 'Connecting'}</span>
      <time>{new Date().toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
    </section>
    <section className="fg-camera-actions"><button onClick={saveSnapshot}><Camera /><span>Snapshot</span></button><button onClick={() => void cameraFrameRef.current?.requestFullscreen?.().catch(() => undefined)}><Expand /><span>Fullscreen</span></button></section>
    <section className="fg-camera-information"><h2>Camera Information</h2><InfoRow label="Status" value={cameraOnline ? 'Online' : 'Connecting'} online /><InfoRow label="Camera" value={cameraName} /><InfoRow label="Source" value={cameraDetail} /><InfoRow label="IP address" value={source === 'esp32' ? (settings.espCameraIp || 'Not configured') : 'Home laptop relay'} /><InfoRow label="Face verification" value={visionStatus} /><button className="fg-camera-refresh" onClick={() => setStreamAttempt(value => value + 1)}><RefreshCw />Refresh Stream</button></section>
    <section className="fg-face-status"><span><ShieldCheck /></span><div><h2>Face Verification</h2><p>{lastResult === 'known' ? `${lastName} verified` : lastResult === 'unknown' ? 'Unverified visitor captured and sent to the app.' : 'System is identifying visitors in real time.'}</p></div><b>{monitoring ? 'Ready' : 'Paused'}</b></section>
    {actionStatus && <p className="fg-camera-notice" role="status">{actionStatus}</p>}
    {camera.error && <p className="fg-camera-notice error">{camera.error}</p>}
    <section className="fg-camera-members"><div><UsersRound /><span>{profiles.length} household members</span></div><button onClick={() => setProfileOpen(true)}><UserPlus />Manage members</button></section>
    <ProfileManager isOpen={profileOpen} onClose={() => setProfileOpen(false)} profiles={profiles} onProfilesChanged={loadProfiles} />
  </main>;
};

const CameraWaiting = () => <div className="fg-camera-waiting"><CameraOff /><span>Waiting for camera feed</span></div>;
const InfoRow = ({ label, value, online = false }: { label: string; value: string; online?: boolean }) => <div className="fg-camera-info-row"><span>{label}</span><b className={online ? 'online' : ''}>{value}</b></div>;
