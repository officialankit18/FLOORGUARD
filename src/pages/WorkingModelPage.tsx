import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, Camera, CheckCircle2, Cpu, DoorOpen, History, ScanFace, ShieldAlert, Users, Waves } from 'lucide-react';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { useLocalRelay } from '../hooks/useLocalRelay';
import { historyQuery, isIntrusion } from '../services/securityWorkflow';

const visitorSteps = [
  { icon: Camera, title: 'Visitor arrives', detail: 'Entrance Camera captures a frame when a face appears at the door.' },
  { icon: ScanFace, title: 'Face verification', detail: 'The frame is compared with registered household members in the active app.' },
  { icon: Users, title: 'Identity decision', detail: 'A recognized member is logged by name. An unknown visitor is recorded with a snapshot.' },
  { icon: DoorOpen, title: 'Door response', detail: 'Auto-open can be enabled for verified members. An unknown visitor waits for the owner to open the door.' },
  { icon: History, title: 'Record and notify', detail: 'The event, photo and timestamp appear in activity history; unknown visitors generate a notification when enabled.' },
];
const intrusionSteps = [
  { icon: Waves, title: 'Floor mat senses pressure', detail: 'Piezo sensors send a candidate event through the controller and MQTT connection.' },
  { icon: Camera, title: 'Floor camera captures', detail: 'The local relay supplies a fresh camera frame for the floor-area check.' },
  { icon: Cpu, title: 'Person detection', detail: 'The backend classifies the frame as person, object or inconclusive.' },
  { icon: ShieldAlert, title: 'Alarm decision', detail: 'A confirmed person requests the buzzer alarm. An object is logged without the intrusion alarm.' },
  { icon: BellRing, title: 'Owner is informed', detail: 'The incident and available photo are saved, shown in the app and sent as a phone notification when push is configured.' },
];

export const WorkingModelPage: React.FC = () => {
  const [flow, setFlow] = useState<'visitor' | 'intrusion'>('visitor');
  const { device, wsConnected } = useDeviceStatus();
  const { cameras, status: relayStatus } = useLocalRelay();
  const history = useSyncExternalStore(historyQuery.subscribe, historyQuery.getSnapshot);
  useEffect(() => { void historyQuery.load(); }, []);
  const latest = (history.data || []).find(event => flow === 'visitor' ? ['Known Face Match', 'Unknown Face'].includes(event.eventType) : isIntrusion(event) || event.eventType === 'Floor Object Detected' || event.eventType === 'Floor Verification Unavailable');
  const steps = flow === 'visitor' ? visitorSteps : intrusionSteps;
  return <main className="fg-model-page">
    <div className="fg-model-intro"><span className="fg-model-kicker">FLOORGUARD · WORKING MODEL</span><h1>From arrival to action.</h1><p>Explore how the entrance camera and floor mat work together to monitor your home.</p></div>
    <div className="fg-model-switch" role="tablist" aria-label="Model flow"><button role="tab" aria-selected={flow === 'visitor'} className={flow === 'visitor' ? 'active' : ''} onClick={() => setFlow('visitor')}><Users size={19} /> Visitor flow</button><button role="tab" aria-selected={flow === 'intrusion'} className={flow === 'intrusion' ? 'active' : ''} onClick={() => setFlow('intrusion')}><ShieldAlert size={19} /> Intrusion flow</button></div>
    <section className="fg-model-status" aria-label="Live system status"><div><span className={wsConnected && device.status === 'Connected' ? 'online' : ''} /><b>Controller</b><small>{wsConnected && device.status === 'Connected' ? 'Connected' : 'Waiting'}</small></div><div><span className={cameras.esp32 ? 'online' : ''} /><b>Entrance Camera</b><small>{cameras.esp32 ? 'Live' : 'Offline'}</small></div><div><span className={cameras.laptop ? 'online' : ''} /><b>Cam 2</b><small>{cameras.laptop ? 'Live' : relayStatus === 'waiting' ? 'Waiting' : 'Offline'}</small></div></section>
    <section className="fg-model-flow" aria-label={`${flow} process`}><div className="fg-model-flow-heading"><h2>{flow === 'visitor' ? 'A visitor at the entrance' : 'Activity on the floor mat'}</h2><p>{flow === 'visitor' ? 'Capture → verify → decide → record' : 'Sense → capture → classify → alert'}</p></div><div className="fg-model-steps">{steps.map(({ icon: Icon, title, detail }, index) => <article key={title}><div className="fg-model-step-icon"><Icon size={23} /></div><div><span>STEP {String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{detail}</p></div>{index < steps.length - 1 && <ArrowRight className="fg-model-arrow" size={19} />}</article>)}</div></section>
    <section className="fg-model-latest"><CheckCircle2 size={22} /><div><h2>Latest recorded {flow === 'visitor' ? 'visitor' : 'floor'} event</h2>{latest ? <p><b>{latest.eventType}</b> · {new Date(latest.timestamp).toLocaleString()}</p> : <p>No event recorded for this flow yet.</p>}</div><Link to="/history">History <ArrowRight size={15} /></Link></section>
    <Link className="fg-model-camera-link" to="/camera"><Camera size={20} /> View live cameras <ArrowRight size={18} /></Link>
  </main>;
};
