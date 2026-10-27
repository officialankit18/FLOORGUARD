import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CameraOff, CheckCircle2, RefreshCw, UserPlus, UsersRound } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { ApiClient } from '../services/apiClient';
import { FaceRecognitionService } from '../services/faceRecognitionService';
import { EnrolledProfile } from '../types/profiles';
import { ProfileManager } from '../components/security/ProfileManager';
import { profilesQuery } from '../services/dashboardData';
import { useMqttConnection } from '../hooks/useMqttConnection';

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
  const [lowLightBoost, setLowLightBoost] = useState(true);
  const camera = useCamera();
  const { settings } = useFloorGuardSettings();
  const { openDoor } = useMqttConnection();
  const [monitoring, setMonitoring] = useState(true);
  const [actionStatus, setActionStatus] = useState('');
  const espImageRef = useRef<HTMLImageElement>(null);
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
    const element = source === 'laptop' ? camera.videoRef.current : espImageRef.current;
    const width = element instanceof HTMLVideoElement ? element.videoWidth : element?.naturalWidth || 0;
    const height = element instanceof HTMLVideoElement ? element.videoHeight : element?.naturalHeight || 0;
    if (!element || !width || !height) return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.drawImage(element, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }, [camera.videoRef, source]);

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
    if (!monitoring || source !== 'laptop' || !camera.isActive) return;
    const timer = window.setInterval(() => { if (camera.videoRef.current) void evaluateFrame(camera.videoRef.current, 'laptop'); }, 650);
    return () => window.clearInterval(timer);
  }, [camera.isActive, evaluateFrame, source, monitoring]);

  useEffect(() => {
    if (!monitoring || source !== 'esp32' || !settings.espCameraIp) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const inspectEspSnapshot = async () => {
      try {
        const response = await fetch(`/api/camera/capture?ip=${encodeURIComponent(settings.espCameraIp)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('capture failed');
        const blobUrl = URL.createObjectURL(await response.blob());
        const frame = new Image();
        try {
          frame.src = blobUrl; await frame.decode();
          if (!cancelled) { setEspReady(true); await evaluateFrame(frame, 'esp32'); }
        } finally { URL.revokeObjectURL(blobUrl); }
      } catch { if (!cancelled) { setEspReady(false); setVisionStatus('ESP32 snapshot unavailable — check IP and camera Wi-Fi'); } }
      finally { if (!cancelled) timer = setTimeout(inspectEspSnapshot, 750); }
    };
    inspectEspSnapshot();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [evaluateFrame, settings.espCameraIp, source, monitoring]);

  const espStream = settings.espCameraIp ? `/api/camera/stream?ip=${encodeURIComponent(settings.espCameraIp)}` : '';
  const selectSource = async (next: CameraSource) => { setSource(next); if (next === 'laptop' && !camera.isActive) await camera.startCamera(); if (next === 'esp32') camera.stopCamera(); };

  return <main className="mx-auto max-w-xl space-y-5 px-5 py-6">
    <div><p className="text-xs font-black uppercase tracking-[0.22em] text-fg-amber">Entrance verification</p><h1 className="mt-2 text-3xl font-black">Camera check</h1><p className="mt-2 text-sm text-fg-muted">Select one camera. Face verification compares the person with your enrolled household members.</p></div>
    <section className="fg-card"><div className="fg-section-title"><h2>{monitoring ? 'Monitoring enabled' : 'Monitoring paused'}</h2><button className="fg-button secondary" onClick={() => setMonitoring(value => !value)}>{monitoring ? 'Pause' : 'Resume'}</button></div><p className="mt-3">Monitoring continues while you browse this app. Keep this browser open and awake. Use one monitoring device per entrance.</p>{actionStatus && <p role="status" className="fg-notice mt-3">{actionStatus}</p>}</section>
    <div className="grid grid-cols-2 rounded-2xl bg-fg-yellowSoft p-1.5">{(['esp32', 'laptop'] as CameraSource[]).map((item) => <button key={item} onClick={() => selectSource(item)} className={`rounded-xl px-3 py-3 text-sm font-black ${source === item ? 'bg-fg-yellow text-fg-ink shadow-sm' : 'text-fg-muted'}`}>{item === 'esp32' ? 'CAM 1 · ESP32' : 'CAM 2 · Laptop'}</button>)}</div>
    <section className="overflow-hidden rounded-3xl border border-fg-line bg-fg-ink shadow-fg-card"><div className="relative aspect-[4/3] bg-neutral-900">{source === 'esp32' ? (espStream ? <img ref={espImageRef} src={espStream} onLoad={() => setEspReady(true)} onError={() => { setEspReady(false); setVisionStatus('ESP32 stream unavailable — check IP and camera Wi-Fi'); }} className={`h-full w-full bg-black object-contain ${lowLightBoost ? 'brightness-110 contrast-110' : ''}`} alt="ESP32-CAM live stream" /> : <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/70"><CameraOff className="h-10 w-10 text-fg-yellow" /><p className="font-bold">Add the ESP32-CAM IP in Settings first.</p></div>) : <><video ref={camera.videoRef} autoPlay muted playsInline className={`h-full w-full bg-black object-contain ${lowLightBoost ? 'brightness-110 contrast-110' : ''} ${camera.isActive ? 'block' : 'hidden'}`} />{!camera.isActive && <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70"><CameraOff className="h-10 w-10 text-fg-yellow" /><button onClick={() => camera.startCamera()} className="rounded-xl bg-fg-yellow px-4 py-2 text-sm font-black text-fg-ink">Start laptop camera</button></div>}</> }<div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-black text-white">{source === 'esp32' ? 'CAM 1 · ESP32' : 'CAM 2 · LAPTOP'}</div><button onClick={() => setLowLightBoost(value => !value)} className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-black text-white">{lowLightBoost ? 'Low-light boost ON' : 'Low-light boost OFF'}</button></div>
      <div className="bg-white px-4 py-3"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-bold"><span className={`h-2.5 w-2.5 rounded-full ${lastResult === 'unknown' ? 'bg-red-500' : lastResult === 'known' ? 'bg-emerald-500' : 'bg-fg-amber'}`} />{lastResult === 'known' ? `${lastName} verified` : lastResult === 'unknown' ? 'Unverified visitor' : visionStatus}</span>{source === 'laptop' && <button onClick={() => camera.isActive ? camera.stopCamera() : camera.startCamera()} className="text-xs font-black text-fg-amber">{camera.isActive ? 'Stop' : 'Start'}</button>}</div>{camera.error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">{camera.error}</p>}</div>
    </section>
    <section className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-fg-muted">Household members</p><h2 className="mt-1 text-xl font-black">{profiles.length} enrolled</h2></div><UsersRound className="h-7 w-7 text-fg-amber" /></div><p className="mt-2 text-sm text-fg-muted">Add clear, consented reference photos. Unknown visitors are saved to the home screen for review.</p><button onClick={() => setProfileOpen(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-fg-yellow px-4 py-3 text-sm font-black"><UserPlus className="h-4 w-4" />Manage members</button></section>
    <div className="flex items-center justify-center gap-2 text-xs text-fg-muted"><RefreshCw className="h-3.5 w-3.5" />Adaptive scanning · <CheckCircle2 className="h-3.5 w-3.5" />Silent visitor notifications</div>
    <ProfileManager isOpen={profileOpen} onClose={() => setProfileOpen(false)} profiles={profiles} onProfilesChanged={loadProfiles} onCaptureSnapshot={snapshot} />
  </main>;
};
