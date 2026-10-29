import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Phone, VolumeX } from 'lucide-react';
import { subscribeLive } from '../../services/liveConnection';
import { SoundAlertService } from '../../services/soundAlertService';
import { ApiClient } from '../../services/apiClient';
import { isIntrusion } from '../../services/securityWorkflow';
import { useFloorGuardSettings } from '../../hooks/useFloorGuardSettings';
import { useMqttConnection } from '../../hooks/useMqttConnection';
import { SecurityEvent } from '../../types/events';

export const LiveAlarm: React.FC = () => {
  const [incident, setIncident] = useState<SecurityEvent | null>(null);
  const [photo, setPhoto] = useState('');
  const [notice, setNotice] = useState('');
  const activeId = useRef('');
  const { settings } = useFloorGuardSettings();
  const { stopDeviceAlarm } = useMqttConnection();
  useEffect(() => {
    const id = sessionStorage.getItem('floorguard.activeAlarm');
    if (!id) return;
    let cancelled = false;
    void fetch(`/api/events/${encodeURIComponent(id)}`).then(response => response.json()).then(({ data }) => {
      if (cancelled) return;
      if (data && !data.acknowledged && isIntrusion(data)) {
        activeId.current = data.id; setIncident(data); setPhoto(data.metadata?.snapshotUrl || ''); SoundAlertService.startContinuousAlarm();
      } else sessionStorage.removeItem('floorguard.activeAlarm');
    }).catch(() => undefined);
    return () => { cancelled = true; SoundAlertService.stopContinuousAlarm(); };
  }, []);
  useEffect(() => {
    const unlock = () => SoundAlertService.setSoundEnabled(true);
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  useEffect(() => subscribeLive(message => {
    if (message.type === 'SECURITY_EVENT_UPDATED' && message.data.id === activeId.current && message.data.metadata?.snapshotUrl) setPhoto(message.data.metadata.snapshotUrl);
    if (message.type === 'SECURITY_EVENT_UPDATED' && message.data.id === activeId.current && message.data.acknowledged) {
      SoundAlertService.stopContinuousAlarm(); setIncident(null); activeId.current = ''; sessionStorage.removeItem('floorguard.activeAlarm'); return;
    }
    if (message.type !== 'NEW_SECURITY_EVENT' || !isIntrusion(message.data)) return;
    const event: SecurityEvent = message.data;
    if (event.mode !== 'LIVE_CONNECTED' || event.acknowledged) return;
    activeId.current = event.id;
    sessionStorage.setItem('floorguard.activeAlarm', event.id);
    setIncident(event); setPhoto(event.metadata?.snapshotUrl || ''); setNotice('');
    SoundAlertService.startContinuousAlarm();
    if (!event.metadata?.snapshotUrl && settings.floorCameraIp) {
      void fetch(`/api/camera/capture?ip=${encodeURIComponent(settings.floorCameraIp)}`).then(async response => {
        if (!response.ok) throw new Error('Snapshot unavailable');
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          const image = String(reader.result); if (activeId.current === event.id) setPhoto(image);
          void fetch(`/api/events/${event.id}/snapshot`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotUrl: image }) }).then(response => { if (!response.ok) throw new Error('Save failed'); }).catch(() => { if (activeId.current === event.id) setNotice('Photo could not be saved.'); });
        };
        reader.readAsDataURL(blob);
      }).catch(() => setNotice('Floor-camera snapshot unavailable. Check its connection in Settings.'));
    } else if (!event.metadata?.snapshotUrl) setNotice('Configure a floor-area camera in Settings to capture intrusion photos.');
  }), [settings.floorCameraIp]);
  const stop = async () => {
    SoundAlertService.stopContinuousAlarm();
    const sent = stopDeviceAlarm();
    const current = incident; setIncident(null); activeId.current = '';
    sessionStorage.removeItem('floorguard.activeAlarm');
    if (current) {
      await ApiClient.acknowledgeEvent(current.id, 'Home owner').catch(() => undefined);
      await ApiClient.createEvent({ eventType: 'Alarm Stopped', source: 'User Action', severity: 'info', mode: 'LIVE_CONNECTED', description: `Phone alarm stopped by owner. ${sent ? 'Hardware stop requested; awaiting device confirmation.' : 'Device disconnected; hardware alarm was not stopped.'}`, metadata: { relatedEventId: current.id } }).catch(() => undefined);
    }
  };
  if (!incident) return null;
  return <div className="fg-alarm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="alarm-heading"><section><BellRing size={42} /><span className="fg-eyebrow">Immediate attention</span><h2 id="alarm-heading">Floor intrusion detected</h2><p>Activity detected on your floor mat.</p><time>{new Date(incident.timestamp).toLocaleString()}</time>{photo && <img src={photo} alt="Floor-area intrusion snapshot" />}{notice && <p>{notice}</p>}<button className="fg-button" onClick={() => void stop()}><VolumeX size={20} />Stop alarm</button>{settings.emergencyNumber ? <a className="fg-button secondary" href={`tel:${settings.emergencyNumber.replace(/[^+\d]/g, '')}`}><Phone size={18} />Call emergency</a> : <p>Add an emergency contact in Settings.</p>}<small>Stopping the hardware buzzer requires compatible device firmware.</small></section></div>;
};
