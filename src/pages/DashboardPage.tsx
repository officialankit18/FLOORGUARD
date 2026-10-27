import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Clock3, DoorOpen, ImageOff, ShieldAlert, UsersRound } from 'lucide-react';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { useEventLog } from '../hooks/useEventLog';
import { useFloorGuardSettings } from '../hooks/useFloorGuardSettings';
import { useMqttConnection } from '../hooks/useMqttConnection';

export const DashboardPage: React.FC = () => {
  const { device } = useDeviceStatus();
  const { events, acknowledge } = useEventLog();
  const { settings } = useFloorGuardSettings();
  const { openDoor } = useMqttConnection(settings);
  const [doorNotice, setDoorNotice] = useState('');
  const today = new Date().toDateString();
  const todaysFaces = useMemo(() => events.filter((event) => ['Known Face Match', 'Unknown Face'].includes(event.eventType) && new Date(event.timestamp).toDateString() === today), [events, today]);
  const intrusions = useMemo(() => events.filter((event) => event.eventType === 'Unknown Face' || event.eventType === 'Potential Intrusion'), [events]);
  const visitor = useMemo(() => events.find((event) => event.eventType === 'Unknown Face' && !event.acknowledged) || events.find((event) => event.eventType === 'Unknown Face'), [events]);
  const liveAlert = device.isTriggered || device.buzzerState;
  const grantEntry = () => { if (openDoor()) { setDoorNotice('Door-open command sent to the controller.'); if (visitor) acknowledge(visitor.id, 'Home owner'); } else setDoorNotice('Add MQTT details in Settings before sending door commands.'); };

  return <main className={`mx-auto max-w-xl space-y-5 px-5 py-6 ${liveAlert ? 'fg-alert-mode' : ''}`}>
    <section className="rounded-[2rem] bg-fg-ink p-6 text-white shadow-fg-card">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-fg-yellow">Home status</p>
      <div className="mt-3 flex items-end justify-between gap-4"><div><h1 className="text-3xl font-black leading-tight">Good to see you.</h1><p className="mt-2 text-sm text-white/65">{liveAlert ? 'Floor sensor needs your attention.' : 'No active floor-sensor intrusion.'}</p></div><span className={`mb-1 h-3 w-3 rounded-full ${liveAlert ? 'animate-pulse bg-red-500' : 'bg-emerald-400'}`} /></div>
    </section>

    <section className="grid grid-cols-2 gap-3">
      <div className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><UsersRound className="h-5 w-5 text-fg-amber" /><p className="mt-5 text-3xl font-black">{todaysFaces.length}</p><p className="mt-1 text-xs font-bold text-fg-muted">people checked today</p></div>
      <div className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><ShieldAlert className={`h-5 w-5 ${intrusions.length ? 'text-red-500' : 'text-emerald-500'}`} /><p className="mt-5 text-3xl font-black">{intrusions.length}</p><p className="mt-1 text-xs font-bold text-fg-muted">unverified visitor{intrusions.length === 1 ? '' : 's'}</p></div>
    </section>

    {visitor ? <section className="overflow-hidden rounded-3xl border border-red-200 bg-white shadow-fg-card"><div className="flex items-center gap-2 bg-red-50 px-5 py-3 text-sm font-black text-red-700"><CircleAlert className="h-5 w-5" />Visitor waiting for your review</div><div className="p-5"><div className="flex gap-4">{visitor.metadata?.snapshotUrl ? <img src={visitor.metadata.snapshotUrl} alt="Unverified visitor snapshot" className="h-24 w-24 rounded-2xl object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-fg-yellowSoft text-fg-amber"><ImageOff className="h-7 w-7" /></div>}<div className="min-w-0"><h2 className="text-lg font-black">Unverified visitor</h2><p className="mt-1 flex items-center gap-1 text-sm text-fg-muted"><Clock3 className="h-3.5 w-3.5" />{new Date(visitor.timestamp).toLocaleString()}</p><p className="mt-2 text-xs leading-5 text-fg-muted">This person is not in your household member list.</p></div></div><button onClick={grantEntry} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-fg-yellow px-4 py-3.5 text-sm font-black text-fg-ink"><DoorOpen className="h-5 w-5" />Open the door</button>{doorNotice && <p className="mt-3 text-center text-xs font-bold text-fg-amber">{doorNotice}</p>}</div></section> : <section className="rounded-3xl border border-fg-line bg-white p-6 text-center shadow-fg-card"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-3 text-lg font-black">No unverified visitor right now</h2><p className="mt-2 text-sm text-fg-muted">When the camera finds an unknown person, their photo and arrival time will appear here automatically.</p></section>}

    <section className="rounded-3xl border border-fg-line bg-white p-5 shadow-fg-card"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-fg-muted">Door & floor mat</p><h2 className="mt-1 text-xl font-black">{liveAlert ? 'Intrusion alert active' : 'All clear'}</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${liveAlert ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{liveAlert ? 'ALERT' : 'MONITORING'}</span></div><p className="mt-3 text-sm text-fg-muted">{liveAlert ? 'Piezo sensor triggered. The physical buzzer and red alarm state are active.' : 'Piezo sensor is monitoring the entrance mat.'}</p></section>
  </main>;
};
