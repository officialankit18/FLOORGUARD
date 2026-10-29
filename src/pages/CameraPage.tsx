import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, ArrowLeft, CameraOff, Expand, RefreshCw, Settings2, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { EnrolledProfile } from '../types/profiles';
import { ProfileManager } from '../components/security/ProfileManager';
import { profilesQuery } from '../services/dashboardData';
import { normalizeRelayUrl } from '../services/cameraRelay';
import { useLocalRelay } from '../hooks/useLocalRelay';
import { useRelayFeed } from '../hooks/useRelayFeed';
import { subscribeLive } from '../services/liveConnection';

type CameraSource = 'esp32' | 'laptop';
const EMPTY_PROFILES: EnrolledProfile[] = [];
type FaceOverlay = { face: 'none' | 'verifying' | 'verified' | 'unverified'; name?: string; box?: { x: number; y: number; width: number; height: number }; width?: number; height?: number; at: number; status?: string };

export const CameraPage: React.FC = () => {
  const [source, setSource] = useState<CameraSource>('esp32');
  const profileSnapshot = useSyncExternalStore(profilesQuery.subscribe, profilesQuery.getSnapshot);
  const profiles = profileSnapshot.data?.data || EMPTY_PROFILES;
  const [profileOpen, setProfileOpen] = useState(false);
  const [espReady, setEspReady] = useState(false);
  const [visionStatus, setVisionStatus] = useState('Preparing face verification…');
  const [lastResult, setLastResult] = useState<'waiting' | 'known' | 'unknown'>('waiting');
  const [lastName, setLastName] = useState('');
  const [faceOverlay, setFaceOverlay] = useState<FaceOverlay | null>(null);
  const [backendAutoOpen, setBackendAutoOpen] = useState<boolean | null>(null);
  const backendVision = useRef<FaceOverlay | null>(null);
  const camera = useCamera();
  const { settings } = useFloorGuardSettings();
  const { relayUrl, status: relayStatus, requestAccess, hasAddress } = useLocalRelay();
  const allowLegacyLocal = location.protocol === 'http:' && Boolean(normalizeRelayUrl(`http://${location.hostname}:3012`));
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [cam2AspectRatio, setCam2AspectRatio] = useState('16 / 9');
  const retryStream = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(retryStream.current), []);
  const [actionStatus, setActionStatus] = useState('');
  const espImageRef = useRef<HTMLImageElement>(null);
  const cameraFrameRef = useRef<HTMLDivElement>(null);
  const relayFeed = useRelayFeed(relayUrl, source, espImageRef, streamAttempt);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const loadProfiles = useCallback(async () => { await profilesQuery.load(true); }, []);
  useEffect(() => { void profilesQuery.load(); }, []);
  useEffect(() => {
    fetch('/api/entrance-monitor/status').then(response => response.json()).then(result => {
      setBackendAutoOpen(result.autoOpenDoor === true);
      if (result.status === 'offline') setVisionStatus('Entrance camera offline — backend is waiting for frames');
      else if (result.status === 'scanning') setVisionStatus('Backend scanning for faces');
    }).catch(() => undefined);
  }, []);
  useEffect(() => subscribeLive(message => {
    if (message.type !== 'FACE_MONITOR_RESULT') return;
    const result = message.data as FaceOverlay;
    backendVision.current = result;
    if (sourceRef.current !== 'esp32') return;
    setFaceOverlay(result);
    if (result.status === 'offline') setVisionStatus('Entrance camera offline — backend is waiting for frames');
    else if (result.status === 'error') setVisionStatus('Backend face model unavailable');
    else if (result.face === 'verified') { setLastResult('known'); setLastName(result.name || 'Member'); setVisionStatus(`${result.name || 'Member'} verified by backend`); }
    else if (result.face === 'unverified') { setLastResult('unknown'); setLastName('Unverified visitor'); setVisionStatus('Unverified visitor detected by backend'); }
    else if (result.face === 'verifying') setVisionStatus('Backend verifying face…');
    else { setLastResult('waiting'); setVisionStatus('Backend scanning for faces'); }
  }), []);
  useEffect(() => () => camera.stopCamera(), [camera.stopCamera]);

  const espStream = relayUrl ? `${relayUrl}/camera/${source}/capture?frame=${streamAttempt}` : allowLegacyLocal && settings.espCameraIp ? `/api/camera/stream?ip=${encodeURIComponent(settings.espCameraIp)}&retry=${streamAttempt}` : '';
  useEffect(() => { if (relayUrl) camera.stopCamera(); }, [relayUrl, camera.stopCamera]);
  const selectSource = async (next: CameraSource) => { setSource(next); setFaceOverlay(next === 'esp32' ? backendVision.current : null); setLastResult('waiting'); setLastName(''); if (next === 'laptop' && !relayUrl && allowLegacyLocal && !camera.isActive) await camera.startCamera(); if (next === 'esp32' || relayUrl) camera.stopCamera(); };

  const cameraName = source === 'esp32' ? 'Entrance Camera' : 'Cam 2';
  const cameraDetail = source === 'esp32' ? 'ESP32-CAM · entrance' : 'Laptop camera · local relay';
  const cameraOnline = (Boolean(relayUrl) && relayFeed.status === 'Live relay') || (allowLegacyLocal && !relayUrl && (source === 'esp32' ? espReady : camera.isActive));

  return <main className="fg-camera-page">
    <header className="fg-camera-title"><button onClick={() => history.back()} aria-label="Go back"><ArrowLeft /></button><h1>Camera</h1><button onClick={() => { location.href = '/settings'; }} aria-label="Camera settings"><Settings2 /></button></header>
    <div className="fg-camera-tabs">{(['esp32', 'laptop'] as CameraSource[]).map(item => <button key={item} onClick={() => void selectSource(item)} className={source === item ? 'active' : ''}>{item === 'esp32' ? 'Entrance Camera' : 'Cam 2'}</button>)}</div>
    {relayStatus === 'permission-needed' && <div className="fg-camera-notice"><p>Allow access to cameras on your home Wi-Fi.</p><button type="button" onClick={() => void requestAccess()}>Connect local cameras</button></div>}
    {relayStatus === 'denied' && <p className="fg-camera-notice">Local network access is blocked. Enable it in your browser site settings.</p>}
    {!hasAddress && !allowLegacyLocal && <p className="fg-camera-notice">Waiting for the home laptop relay. Start the relay or add its Wi-Fi address in Settings.</p>}
    <section className="fg-camera-stream" ref={cameraFrameRef} style={{ aspectRatio: source === 'laptop' ? cam2AspectRatio : undefined }}>
      {source === 'esp32' || relayUrl || !allowLegacyLocal ? (espStream ? <img key={`${source}-${relayUrl}`} ref={espImageRef} crossOrigin="anonymous" src={relayUrl ? relayFeed.src || undefined : espStream} onLoad={event => { setEspReady(true); clearTimeout(retryStream.current); if (source === 'laptop' && event.currentTarget.naturalWidth && event.currentTarget.naturalHeight) setCam2AspectRatio(`${event.currentTarget.naturalWidth} / ${event.currentTarget.naturalHeight}`); }} onError={() => { setEspReady(false); setVisionStatus('Camera stream unavailable — reconnecting…'); clearTimeout(retryStream.current); if (!relayUrl) retryStream.current = setTimeout(() => setStreamAttempt(n => n + 1), 3000); }} alt={`${cameraName} live stream`} /> : <CameraWaiting />) : <>{camera.isActive ? <video ref={camera.videoRef} autoPlay muted playsInline onLoadedMetadata={event => { if (event.currentTarget.videoWidth && event.currentTarget.videoHeight) setCam2AspectRatio(`${event.currentTarget.videoWidth} / ${event.currentTarget.videoHeight}`); }} /> : <CameraWaiting />} {!camera.isActive && <button className="fg-camera-start" onClick={() => void camera.startCamera()}>Start camera</button>}</>}
      {source === 'esp32' && cameraOnline && faceOverlay?.box && faceOverlay.width && faceOverlay.height && Date.now() - faceOverlay.at < 5000 && <FaceBoxOverlay result={faceOverlay} />}
      <span className={`fg-camera-live-badge ${cameraOnline ? '' : 'offline'}`}><i />{cameraOnline ? 'Live' : 'Connecting'}</span>
      <button type="button" className="fg-camera-fullscreen" aria-label="Toggle camera fullscreen" onClick={() => { const frame = cameraFrameRef.current; if (!frame) return; void (document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen()).catch(() => setActionStatus('Fullscreen is unavailable on this device.')); }}><Expand aria-hidden="true" /></button>
      <time>{new Date().toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
    </section>
    <section className="fg-camera-information"><h2>Camera Information</h2><InfoRow label="Status" value={cameraOnline ? 'Online' : 'Connecting'} online /><InfoRow label="Camera" value={cameraName} /><InfoRow label="Source" value={cameraDetail} /><InfoRow label="IP address" value={source === 'esp32' ? (settings.espCameraIp || 'Not configured') : 'Home laptop relay'} />{source === 'esp32' && <InfoRow label="Face verification" value={visionStatus} />}<button className="fg-camera-refresh" onClick={() => setStreamAttempt(value => value + 1)}><RefreshCw />Refresh Stream</button></section>
    {source === 'esp32' ? <section className="fg-face-status"><span><ShieldCheck /></span><div><h2>Face Verification</h2><p>{lastResult === 'known' ? `${lastName} verified` : lastResult === 'unknown' ? 'Unverified visitor captured from Entrance Camera.' : visionStatus} {backendAutoOpen !== null ? `· Auto-open ${backendAutoOpen ? 'on' : 'off'}` : ''}</p></div><b>{backendVision.current?.status === 'scanning' ? 'Live' : 'Waiting'}</b></section> : <section className="fg-face-status"><span><Activity /></span><div><h2>Floor Camera</h2><p>Cam 2 captures a photo when the floor mat detects an intrusion. Face verification runs only on Entrance Camera.</p></div><b>{cameraOnline ? 'Live' : 'Waiting'}</b></section>}
    {actionStatus && <p className="fg-camera-notice" role="status">{actionStatus}</p>}
    {camera.error && <p className="fg-camera-notice error">{camera.error}</p>}
    <section className="fg-camera-members"><div><UsersRound /><span>{profiles.length} household members</span></div><button onClick={() => setProfileOpen(true)}><UserPlus />Manage members</button></section>
    <ProfileManager isOpen={profileOpen} onClose={() => setProfileOpen(false)} profiles={profiles} onProfilesChanged={loadProfiles} />
  </main>;
};

const CameraWaiting = () => <div className="fg-camera-waiting"><CameraOff /><span>Waiting for camera feed</span></div>;
const FaceBoxOverlay = ({ result }: { result: FaceOverlay }) => {
  const box = result.box!;
  const color = result.face === 'verified' ? '#25dd92' : result.face === 'unverified' ? '#ff5266' : '#ffd05b';
  const label = result.face === 'verified' ? `Verified · ${result.name || 'Member'}` : result.face === 'unverified' ? 'Unverified person' : 'Human · verifying';
  return <svg className="fg-face-box-overlay" viewBox={`0 0 ${result.width} ${result.height}`} preserveAspectRatio="xMidYMid meet" aria-label={label}><rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill="none" stroke={color} strokeWidth="3" /><rect x={box.x} y={Math.max(0, box.y - 31)} width={Math.max(box.width, label.length * 8 + 16)} height="30" rx="7" fill={color} /><text x={box.x + 8} y={Math.max(0, box.y - 31) + 20} fill="#102038" fontSize="15" fontWeight="800">{label}</text></svg>;
};
const InfoRow = ({ label, value, online = false }: { label: string; value: string; online?: boolean }) => <div className="fg-camera-info-row"><span>{label}</span><b className={online ? 'online' : ''}>{value}</b></div>;
