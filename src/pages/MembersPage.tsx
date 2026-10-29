import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Pencil, Plus, ScanFace, Trash2, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProfileManager } from '../components/security/ProfileManager';
import { profilesQuery } from '../services/dashboardData';
import { ApiClient } from '../services/apiClient';
import type { EnrolledProfile } from '../types/profiles';

const EMPTY: EnrolledProfile[] = [];
export const MembersPage: React.FC = () => {
  const navigate = useNavigate();
  const snapshot = useSyncExternalStore(profilesQuery.subscribe, profilesQuery.getSnapshot);
  const profiles = snapshot.error ? EMPTY : snapshot.data?.data || EMPTY;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EnrolledProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void profilesQuery.load(true);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void profilesQuery.load(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const remove = async (profile: EnrolledProfile) => {
    if (!window.confirm(`Remove ${profile.name} from your household?`)) return;
    try { await ApiClient.deleteProfile(profile.id); await profilesQuery.load(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove member.'); }
  };
  const edit = (profile: EnrolledProfile) => { setEditing(profile); setAdding(true); };
  return <main className="fg-household-page">
    <header className="fg-household-title"><button type="button" onClick={() => navigate('/')} aria-label="Go home"><ArrowLeft /></button><h1>Household Members</h1><button type="button" className="add" onClick={() => { setEditing(null); setAdding(true); }} aria-label="Add member"><Plus /></button></header>
    <div className="fg-household-avatars" aria-label="Household members">{profiles.slice(0, 5).map(member => <div key={member.id}><span>{member.photoPreviewUrl ? <img src={member.photoPreviewUrl} alt="" /> : <UserRound />}</span><b>{member.name.split(' ')[0]}</b></div>)}<button type="button" onClick={() => { setEditing(null); setAdding(true); }}><span><Plus /></span><b>Add</b></button></div>
    <section className="fg-household-feature"><span><ScanFace /></span><div><h2>Face Verification</h2><p>Manage family members for accurate identification</p></div></section>
    <section className="fg-household-list" aria-label="Enrolled members">{snapshot.isLoading && !snapshot.data && <p>Loading household…</p>}{snapshot.error && <p role="alert">MongoDB is unavailable. Member changes are paused. <button onClick={() => void profilesQuery.load(true)}>Retry</button></p>}{!snapshot.error && !snapshot.isLoading && profiles.length === 0 && <p>No members added yet. Add someone using your device camera.</p>}{profiles.map(member => <article key={member.id}><span className="fg-household-photo">{member.photoPreviewUrl ? <img src={member.photoPreviewUrl} alt="" /> : <UserRound />}</span><div><h2>{member.name}</h2><p>{member.role === 'Administrator' ? 'Home Owner' : 'Family Member'}</p></div>{member.role === 'Administrator' && <span className="fg-household-owner" aria-label="Home owner">★</span>}<button type="button" className="edit" onClick={() => edit(member)} aria-label={`Edit ${member.name}`}><Pencil /></button><button type="button" onClick={() => void remove(member)} aria-label={`Remove ${member.name}`}><Trash2 /></button></article>)}</section>
    {error && <p className="fg-household-error" role="alert">{error}</p>}
    <button type="button" className="fg-household-add" onClick={() => { setEditing(null); setAdding(true); }}><Plus />Add New Member</button>
    <ProfileManager isOpen={adding} editingProfile={editing} onClose={() => { setAdding(false); setEditing(null); }} profiles={profiles} showList={false} onProfilesChanged={() => { void profilesQuery.load(true); }} />
  </main>;
};
