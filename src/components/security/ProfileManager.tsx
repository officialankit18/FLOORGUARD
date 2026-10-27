import React, { useState, useRef } from 'react';
import { UserCheck, UserPlus, Trash2, Camera, Upload, AlertCircle, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { EnrolledProfile, ProfileEnrollmentPayload } from '../../types/profiles';
import { FaceRecognitionService } from '../../services/faceRecognitionService';
import { ApiClient } from '../../services/apiClient';

interface ProfileManagerProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: EnrolledProfile[];
  onProfilesChanged: () => void;
  onCaptureSnapshot?: () => string | null;
}

export const ProfileManager: React.FC<ProfileManagerProps> = ({
  isOpen,
  onClose,
  profiles,
  onProfilesChanged,
  onCaptureSnapshot,
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<EnrolledProfile['role']>('Resident');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName('');
    setRole('Resident');
    setNotes('');
    setConsent(false);
    setPhotoPreview(null);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleCaptureCamera = () => {
    if (!onCaptureSnapshot) {
      setErrorMsg('Camera snapshot capture unavailable. Please start the camera first or upload an image.');
      return;
    }
    const snapshot = onCaptureSnapshot();
    if (!snapshot) {
      setErrorMsg('Could not capture frame. Ensure camera is running.');
      return;
    }
    setPhotoPreview(snapshot);
    setErrorMsg(null);
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Please enter a display name for the profile.');
      return;
    }

    if (!consent) {
      setErrorMsg('Explicit authorization/consent is required to enroll biometric reference profiles.');
      return;
    }

    if (!photoPreview) {
      setErrorMsg('Please provide a reference photograph with a clear, visible face.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Create an image element to extract the 128-d descriptor
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = photoPreview;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to decode image data for descriptor extraction.'));
      });

      // 2. Extract 128-d ResNet descriptor using FaceRecognitionService
      const extractResult = await FaceRecognitionService.extractDescriptorFromElement(img);

      if (!extractResult || !extractResult.descriptor || extractResult.descriptor.length !== 128) {
        throw new Error('No face detected in reference photo. Ensure proper lighting and a frontal facial angle.');
      }

      // 3. Post to backend
      const payload: ProfileEnrollmentPayload = {
        name: name.trim(),
        role,
        photoPreviewUrl: photoPreview,
        descriptor: extractResult.descriptor,
        notes: notes.trim(),
        consentGranted: true,
      };

      const res = await ApiClient.enrollProfile(payload);
      if (res.success) {
        resetForm();
        setSuccessMsg(`${res.data.name} added to your household.`);
        onProfilesChanged();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to enroll profile.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteProfile = async (id: string, profileName: string) => {
    if (!window.confirm(`Are you sure you want to delete profile "${profileName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await ApiClient.deleteProfile(id);
      onProfilesChanged();
    } catch (err: any) {
      alert(`Failed to delete profile: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all enrolled reference profiles? Facial recognition will return to UNKNOWN for all individuals.')) {
      return;
    }
    try {
      await ApiClient.clearAllProfiles();
      onProfilesChanged();
    } catch (err: any) {
      alert(`Failed to clear profiles: ${err.message}`);
    }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title="Household members" subtitle="Add the people who belong at home." maxWidth="lg">
    <div className="fg-members space-y-5">
      <form onSubmit={handleEnroll} className="fg-card space-y-5">
        <div><h4 className="text-lg font-bold">Add a member</h4><p className="text-sm mt-1">A name and one clear photo. That’s it.</p></div>
        <fieldset disabled={isProcessing} className="space-y-5 min-w-0">
          <label className="block text-sm font-semibold">Full name<input autoComplete="off" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex Taylor" maxLength={80} required /></label>
          <div className="fg-member-photo">
            {photoPreview ? <img src={photoPreview} alt="Selected member photo" /> : <div className="fg-member-placeholder"><Camera size={32} /><span>Member photo</span></div>}
            <p>Use a clear photo of one person, facing the camera.</p>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} hidden aria-label="Choose member photo" />
            <div className="flex flex-wrap justify-center gap-2 mt-4"><button type="button" className="fg-button secondary" onClick={() => fileInputRef.current?.click()}><Upload size={16} />{photoPreview ? 'Change photo' : 'Choose photo'}</button>{onCaptureSnapshot && <button type="button" className="fg-button secondary" onClick={handleCaptureCamera}><Camera size={16} />Use camera</button>}</div>
          </div>
          <label className="flex items-start gap-3 text-xs leading-5 cursor-pointer"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>This person agrees to save their photo for face recognition.</span></label>
          <button type="submit" disabled={isProcessing || !name.trim() || !photoPreview || !consent} className="fg-button w-full"><UserPlus size={18} />{isProcessing ? 'Adding member…' : 'Add member'}</button>
        </fieldset>
        {errorMsg && <p role="alert" className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{errorMsg}</p>}
        {successMsg && <p role="status" className="fg-notice flex items-center gap-2"><CheckCircle2 size={18} />{successMsg}</p>}
      </form>
      <section><div className="fg-section-title mb-3"><h4 className="font-bold">Your household</h4><span className="fg-pill">{profiles.length} {profiles.length === 1 ? 'member' : 'members'}</span></div>
        {!profiles.length ? <div className="fg-member-empty"><UserPlus size={28} /><p>No members yet</p><span>Add your first household member above.</span></div> : <div className="space-y-2">{profiles.map(member => <article key={member.id} className="fg-member-row"><div className="flex items-center gap-3 min-w-0">{member.photoPreviewUrl ? <img src={member.photoPreviewUrl} alt="" loading="lazy" /> : <span className="fg-member-initial">{member.name.charAt(0)}</span>}<div className="min-w-0"><h5 className="font-bold text-sm break-words">{member.name}</h5><p className="text-xs text-fg-muted">Household member</p></div></div><button type="button" disabled={isProcessing} onClick={() => handleDeleteProfile(member.id, member.name)} aria-label={`Remove ${member.name}`} className="fg-member-remove"><Trash2 size={17} /></button></article>)}</div>}
      </section>
    </div>
  </Modal>;
};
