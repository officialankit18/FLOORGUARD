import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Activity, ArrowLeft, Bell, Camera, CheckCircle2, ChevronRight, Cpu, Globe2, Palette, Save, Server, ShieldAlert, Sun, UserRound, Wifi } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_NOTIFICATIONS, useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { useMqttConnection } from '../hooks/useMqttConnection';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { CameraService } from '../services/cameraService';
import { healthQuery, profilesQuery } from '../services/dashboardData';
import { NotificationService } from '../services/notificationService';
import { CameraRelaySettings } from '../components/security/CameraRelaySettings';
import { normalizeRelayUrl } from '../services/cameraRelay';
import { useLocalRelay } from '../hooks/useLocalRelay';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, save } = useFloorGuardSettings();
  const [draft, setDraft] = useState(settings);
  const [laptopAvailable, setLaptopAvailable] = useState(false);
  const [saved, setSaved] = useState(false), [error, setError] = useState(''), [notificationStatus, setNotificationStatus] = useState('');
  const [section, setSection] = useState<'camera' | 'controller' | 'sensor' | 'connection' | ''>('');
  const health = useSyncExternalStore(healthQuery.subscribe, healthQuery.getSnapshot);
  const profiles = useSyncExternalStore(profilesQuery.subscribe, profilesQuery.getSnapshot);
  const { device } = useDeviceStatus();
  const { webStatus, deviceStatus } = useMqttConnection();
  const { status: relayStatus, cameras: relayCameras } = useLocalRelay();
  useEffect(() => { void CameraService.isCameraSupported().then(setLaptopAvailable); void healthQuery.load(); void profilesQuery.load(); }, []);
  useEffect(() => { setDraft(settings); }, [settings]);
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const preferences = { ...DEFAULT_NOTIFICATIONS, ...draft.notifications };
  const toggleNotification = (key: keyof typeof DEFAULT_NOTIFICATIONS) => {
    const next = { ...draft, notifications: { ...preferences, [key]: !preferences[key] } };
    setDraft(next); save(next);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') void NotificationService.enablePush(false).then(setNotificationStatus).catch(cause => setNotificationStatus(cause instanceof Error ? cause.message : 'Could not update phone notification preferences.'));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const relay = normalizeRelayUrl(draft.cameraRelayUrl || '');
    if (draft.cameraRelayUrl && !relay) { setError('Use a local Wi-Fi relay address such as http://192.168.1.10:3012.'); return; }
    setError(''); save({ ...draft, cameraRelayUrl: relay }); setSaved(true); window.setTimeout(() => setSaved(false), 2500);
  };
  const owner = profiles.data?.data.find(profile => profile.role === 'Administrator') || profiles.data?.data[0];
  const open = (next: typeof section) => setSection(current => current === next ? '' : next);
  return <main className="fg-settings-page">
    <header className="fg-settings-title"><button type="button" onClick={() => navigate('/')} aria-label="Go home"><ArrowLeft /></button><h1>Settings</h1><span /></header>
    <button type="button" className="fg-settings-owner" onClick={() => navigate('/members')}><span>{owner?.photoPreviewUrl ? <img src={owner.photoPreviewUrl} alt="" /> : owner?.name?.charAt(0) || <UserRound />}</span><div><strong>{owner?.name || 'Household'}</strong><small>{owner?.role === 'Administrator' ? 'Home Owner' : 'Manage household members'}</small></div><ChevronRight /></button>
    <form onSubmit={submit}>
      <section className="fg-settings-panel"><PanelHeading icon={<Cpu />} title="Device Configuration" subtitle="Manage hardware and connections" color="blue" />
        <SettingRow icon={<Camera />} label="Camera Settings" onClick={() => open('camera')} expanded={section === 'camera'} />
        {section === 'camera' && <div className="fg-settings-expanded"><Field label="Entrance Camera · ESP32 local IP" value={draft.espCameraIp} onChange={value => update('espCameraIp', value.trim())} placeholder="192.168.1.45" /><CameraRelaySettings value={draft.cameraRelayUrl || ''} onChange={value => update('cameraRelayUrl', value)} /><p>This device camera for member enrollment: {laptopAvailable ? 'Supported' : 'Unavailable or permission needed'}</p></div>}
        <SettingRow icon={<Cpu />} label="Controller Settings" onClick={() => open('controller')} expanded={section === 'controller'} />
        {section === 'controller' && <div className="fg-settings-expanded"><Field label="MQTT WebSocket URL" value={draft.mqttUrl} onChange={value => update('mqttUrl', value)} placeholder="wss://broker.example.com/mqtt" /><Field label="Topic prefix" value={draft.mqttTopicPrefix} onChange={value => update('mqttTopicPrefix', value)} placeholder="floorguard/home-01" /><Field label="Dashboard username" value={draft.mqttUsername} onChange={value => update('mqttUsername', value)} placeholder="Username" /><Field label="Dashboard password" type="password" value={draft.mqttPassword} onChange={value => update('mqttPassword', value)} placeholder="Password" /><label>Door-opening signal<select value={draft.doorOpenValue || 'unconfigured'} onChange={event => update('doorOpenValue', event.target.value as typeof draft.doorOpenValue)}><option value="unconfigured">Choose controller signal</option><option value="on">ON opens door</option><option value="off">OFF opens door</option></select></label><p>Entrance auto-open runs on the home laptop for verified Resident and Administrator profiles listed in FACE_AUTO_OPEN_PROFILE_IDS. Set FACE_AUTO_OPEN_DOOR=0 there to disable it.</p></div>}
        <SettingRow icon={<Activity />} label="Floor Mat Sensor" onClick={() => open('sensor')} expanded={section === 'sensor'} />
        {section === 'sensor' && <div className="fg-settings-expanded"><Status label="Sensor" value={device.status} /><Status label="Last reading" value={String(device.lastReading)} /><Status label="Buzzer" value={device.buzzerState ? 'Active' : 'Off'} /><Status label="Threshold reported by device" value={String(device.piezoThreshold)} /><Status label="Person detector on this backend" value={health.data?.floorVerifier || 'Checking'} /></div>}
        <SettingRow icon={<Wifi />} label="Connection Test" onClick={() => { open('connection'); void healthQuery.load(true); }} expanded={section === 'connection'} />
        {section === 'connection' && <div className="fg-settings-expanded"><Status label="Website API" value={health.data?.status === 'ONLINE' ? 'Connected' : 'Unavailable'} /><Status label="MongoDB history" value={health.data?.mongo || 'Checking'} /><Status label="Website MQTT" value={webStatus} /><Status label="Door device MQTT" value={deviceStatus} /><Status label="Entrance camera IP" value={draft.espCameraIp || 'Not configured'} /><Status label="Local camera relay" value={relayStatus === 'live' ? 'Connected' : relayStatus} /><Status label="Entrance Camera" value={relayCameras.esp32 ? 'Live' : 'Offline'} /><Status label="Cam 2" value={relayCameras.laptop ? 'Live' : 'Offline'} /><button type="button" className="fg-settings-recheck" onClick={() => void healthQuery.load(true)}>Recheck connections</button></div>}
      </section>
      <section className="fg-settings-panel"><PanelHeading icon={<Bell />} title="Notifications" subtitle="Get instant alerts on important events" color="red" />
        <Toggle icon={<UserRound />} label="Unknown Face Alert" checked={preferences.unknownFace} onChange={() => toggleNotification('unknownFace')} />
        <Toggle icon={<ShieldAlert />} label="Floor Mat Intrusion" checked={preferences.intrusion} onChange={() => toggleNotification('intrusion')} />
        <Toggle icon={<Server />} label="Device Offline Alert" checked={preferences.deviceOffline} onChange={() => toggleNotification('deviceOffline')} />
        <Toggle icon={<Activity />} label="Door Activity" checked={preferences.doorActivity} onChange={() => toggleNotification('doorActivity')} />
        <div className="fg-settings-expanded"><button type="button" className="fg-settings-recheck" onClick={() => void NotificationService.enablePush().then(setNotificationStatus).catch(cause => setNotificationStatus(cause instanceof Error ? cause.message : 'Could not enable notifications.'))}>Enable phone notifications</button><p role="status">{notificationStatus || `Background push: ${health.data?.push || 'Checking'}`}</p></div>
      </section>
      <section className="fg-settings-panel"><PanelHeading icon={<Palette />} title="App Preferences" subtitle="Theme and app settings" color="orange" /><label className="fg-settings-select"><Sun />Theme<select aria-label="Theme" value={draft.theme || 'light'} onChange={event => { const next = { ...draft, theme: event.target.value as 'light' | 'dark' }; setDraft(next); save(next); }}><option value="light">Light Theme</option><option value="dark">Dark Theme</option></select></label><div className="fg-settings-language"><Globe2 /><span>Language</span><b>English</b></div></section>
      <button type="submit" className="fg-settings-save"><Save />Save Settings</button>
      {error && <p className="fg-settings-error" role="alert">{error}</p>}{saved && <p className="fg-settings-success" role="status"><CheckCircle2 />Settings saved.</p>}
    </form>
  </main>;
};

const PanelHeading = ({ icon, title, subtitle, color }: { icon: React.ReactNode; title: string; subtitle: string; color: string }) => <header className="fg-settings-panel-heading"><span className={color}>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></header>;
const SettingRow = ({ icon, label, onClick, expanded }: { icon: React.ReactNode; label: string; onClick: () => void; expanded: boolean }) => <button type="button" className="fg-settings-row" onClick={onClick} aria-expanded={expanded}><span>{icon}</span><b>{label}</b><ChevronRight className={expanded ? 'expanded' : ''} /></button>;
const Toggle = ({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: () => void }) => <div className="fg-settings-toggle"><span>{icon}</span><b>{label}</b><button type="button" role="switch" aria-label={label} aria-checked={checked} className={checked ? 'on' : ''} onClick={onChange}><i /></button></div>;
const Field = ({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) => <label>{label}<input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
const Status = ({ label, value }: { label: string; value: string }) => <div className="fg-settings-status"><span>{label}</span><b>{value}</b></div>;
