import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, DoorClosed, DoorOpen, Check, ArrowUpRight, Clock, Camera, Users, Bell } from 'lucide-react';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { useMqttConnection } from '../hooks/useMqttConnection';
import { historyQuery, isIntrusion } from '../services/securityWorkflow';
import { ApiClient } from '../services/apiClient';

export const DashboardPage: React.FC = () => {
  const { device, wsConnected } = useDeviceStatus();
  const snapshot = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  const { openDoor, closeDoor, commandStatus } = useMqttConnection();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { void historyQuery.load(); }, []);
  const events = snapshot.data || [];
  const today = events.filter(event => new Date(event.timestamp).toDateString() === new Date().toDateString());
  const waiting = events.filter(event => event.eventType === 'Unknown Face' && !event.acknowledged);
  const alert = device.isTriggered || device.buzzerState;
  const attend = async (id: string) => {
    setBusy(id);
    try {
      const result = await ApiClient.acknowledgeEvent(id, 'Home owner');
      historyQuery.update(current => current?.map(event => event.id === id ? result.data : event));
      await ApiClient.createEvent({ eventType: 'Visitor Attended', source: 'User Action', description: 'Visitor attended by the home owner.', severity: 'info', mode: 'LIVE_CONNECTED', metadata: { relatedEventId: id } });
    } catch { setNotice('Could not save attendance. Please retry.'); } finally { setBusy(''); }
  };
  const unlock = async (id?: string) => {
    if (!openDoor()) { setNotice('Configure the door-opening signal in Settings and connect MQTT first.'); return; }
    setNotice('Door-open request sent. Waiting for the device to confirm.');
    await ApiClient.createEvent({ eventType: 'Door Open Requested', source: 'User Action', description: 'Owner requested door opening.', severity: 'info', mode: 'LIVE_CONNECTED', metadata: { relatedEventId: id } }).catch(() => setNotice('Door request sent, but history could not be saved.'));
  };
  const close = async () => {
    if (!closeDoor()) { setNotice('Unable to send: check MQTT, door signal settings, or wait for the pending command.'); return; }
    setNotice('Door-close request sent. Waiting for device confirmation.');
    await ApiClient.createEvent({ eventType: 'Door Close Requested', source: 'User Action', description: 'Owner requested door closing.', severity: 'info', mode: 'LIVE_CONNECTED' }).catch(() => setNotice('Close request sent, but history could not be saved.'));
  };
  return <main className="fg-page">
    <section className={`fg-home-status ${alert ? 'alert' : ''}`}><span>HOME STATUS</span><h1>{alert ? 'Your home needs attention.' : 'Good to see you.'}</h1><div><p>{alert ? 'Active floor-sensor intrusion.' : wsConnected ? 'No active floor-sensor intrusion reported.' : 'Connecting to your home…'}</p><i className={alert ? 'danger' : wsConnected ? 'online' : ''} aria-label={alert ? 'Alert active' : wsConnected ? 'Live updates connected' : 'Connecting'} /></div></section>
    <div className="fg-home-stats"><section className="fg-card"><Users size={23} /><b>{snapshot.isLoading ? '—' : today.filter(e => ['Known Face Match', 'Unknown Face'].includes(e.eventType)).length}</b><span>people checked today</span></section><section className="fg-card"><ShieldCheck size={23} /><b>{snapshot.isLoading ? '—' : today.filter(e => e.eventType === 'Unknown Face').length}</b><span>unverified visitors today</span></section></div>
    {notice && <p className="fg-notice" role="status">{notice}</p>}
    {commandStatus !== 'No pending door request' && <p className="fg-notice" role="status">{commandStatus}</p>}
    {waiting.slice(0, 5).map(visitor => <article key={visitor.id} className="fg-card fg-visitor-review"><header><Bell size={19} />Visitor waiting for your review</header><div className="fg-visitor-content"><div className="flex gap-4">{visitor.metadata?.snapshotUrl ? <img src={visitor.metadata.snapshotUrl} alt="Visitor at the entrance" className="fg-visitor-photo" /> : <div className="fg-visitor-photo flex items-center justify-center"><Camera /></div>}<div className="min-w-0"><h3>Unverified visitor</h3><time><Clock size={14} />{new Date(visitor.timestamp).toLocaleString()}</time><p>This person is not in your household member list.</p></div></div><button className="fg-button w-full mt-5" onClick={() => void unlock(visitor.id)}><DoorOpen size={19} />Open the door</button><button className="fg-button secondary w-full mt-2" disabled={busy === visitor.id} onClick={() => void attend(visitor.id)}><Check size={17} />{busy === visitor.id ? 'Saving…' : 'Mark attended'}</button></div></article>)}
    {!waiting.length && <section className="fg-card fg-empty"><ShieldCheck size={30} /><h3>{snapshot.isLoading ? 'Checking visitor history…' : 'All visitors attended'}</h3><p>New visitor photos and arrival times will appear here.</p></section>}
    {snapshot.error && <p className="fg-notice">History is unavailable. <button onClick={() => void historyQuery.load(true)}>Retry</button></p>}
    <section className="fg-card fg-mat-block"><div className="fg-section-title"><div><span className="fg-eyebrow">Door &amp; floor mat</span><h2>{alert ? 'Intrusion detected' : wsConnected && device.status === 'Connected' ? 'All clear' : 'Waiting for device'}</h2></div><span className="fg-pill">{alert ? 'ALERT' : wsConnected && device.status === 'Connected' ? 'MONITORING' : 'CONNECTING'}</span></div><p>{alert ? 'Your floor sensor has reported activity. Review the alert.' : wsConnected && device.status === 'Connected' ? 'Piezo sensor is monitoring the entrance mat.' : 'Device status will appear when connected.'}</p><div className="fg-home-stats mt-4"><div><b>{today.filter(e => e.eventType === 'Known Face Match').length}</b><span>verified visits today</span></div><div><b>{today.filter(isIntrusion).length}</b><span>floor alerts today</span></div></div></section>
    <section className="fg-card"><div className="fg-section-title"><h2>Door control</h2><span className="fg-pill">{device.status}</span></div><p className="fg-muted">Reported device signal: {device.servoLocked ? 'ON' : 'OFF'}. Commands are confirmed by your controller.</p><div className="flex flex-wrap gap-3 mt-4"><button className="fg-button" onClick={() => void unlock()}><DoorOpen size={18} />Open door</button><button className="fg-button secondary" onClick={() => void close()}><DoorClosed size={18} />Close door</button></div></section>
    <section className="fg-card"><h2>Recent activity</h2>{events.slice(0, 4).map(event => <div className="fg-timeline-item" key={event.id}><div className={`fg-timeline-dot ${isIntrusion(event) ? 'danger' : ''}`} /><div><h3>{event.metadata?.recognizedName || event.eventType}</h3><p>{event.description}</p><time>{new Date(event.timestamp).toLocaleString()}</time></div></div>)}<Link className="fg-text-link" to="/history">Explore all activity <ArrowUpRight size={16} /></Link></section>
  </main>;
};
