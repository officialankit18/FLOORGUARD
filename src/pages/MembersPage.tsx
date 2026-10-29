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
  const profiles = snapshot.data?.data || EMPTY;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void profilesQuery.load(); }, []);
  const remove = async (profile: EnrolledProfile) => {
    if (!window.confirm(`Remove ${profile.name} from your household?`)) return;
    try { await ApiClient.deleteProfile(profile.id); await profilesQuery.load(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove member.'); }
  };
  const rename = async (profile: EnrolledProfile) => {
    const name = window.prompt('Member name', profile.name)?.trim();
    if (!name || name === profile.name) return;
    try { await ApiClient.renameProfile(profile.id, name); await profilesQuery.load(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update member.'); }
  };
  return <main className="fg-household-page">
    <header className="fg-household-title"><button type="button" onClick={() => navigate('/')} aria-label="Go home"><ArrowLeft /></button><h1>Household Members</h1><button type="button" className="add" onClick={() => setAdding(true)} aria-label="Add member"><Plus /></button></header>
    <div className="fg-household-avatars" aria-label="Household members">{profiles.slice(0, 5).map(member => <div key={member.id}><span>{member.photoPreviewUrl ? <img src={member.photoPreviewUrl} alt="" /> : <UserRound />}</span><b>{member.name.split(' ')[0]}</b></div>)}<button type="button" onClick={() => setAdding(true)}><span><Plus /></span><b>Add</b></button></div>
    <section className="fg-household-feature"><span><ScanFace /></span><div><h2>Face Verification</h2><p>Manage family members for accurate identification</p></div></section>
    <section className="fg-household-list" aria-label="Enrolled members">{snapshot.isLoading && !snapshot.data && <p>Loading household…</p>}{snapshot.error && <p role="alert">Could not load members. <button onClick={() => void profilesQuery.load(true)}>Retry</button></p>}{!snapshot.isLoading && profiles.length === 0 && <p>No members added yet. Add someone using your device camera.</p>}{profiles.map(member => <article key={member.id}><span className="fg-household-photo">{member.photoPreviewUrl ? <img src={member.photoPreviewUrl} alt="" /> : <UserRound />}</span><div><h2>{member.name}</h2><p>{member.role === 'Administrator' ? 'Home Owner' : 'Family Member'}</p></div>{member.role === 'Administrator' && <span className="fg-household-owner" aria-label="Home owner">★</span>}<button type="button" className="edit" onClick={() => void rename(member)} aria-label={`Edit ${member.name}`}><Pencil /></button><button type="button" onClick={() => void remove(member)} aria-label={`Remove ${member.name}`}><Trash2 /></button></article>)}</section>
    {error && <p className="fg-household-error" role="alert">{error}</p>}
    <button type="button" className="fg-household-add" onClick={() => setAdding(true)}><Plus />Add New Member</button>
    <ProfileManager isOpen={adding} onClose={() => setAdding(false)} profiles={profiles} showList={false} onProfilesChanged={() => { void profilesQuery.load(true); }} />
  </main>;
};
