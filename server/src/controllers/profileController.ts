import { Request, Response } from 'express';
import { store } from '../database/store';
import { EnrolledProfile } from '../../../src/types/profiles';
import { broadcastProfilesChanged } from '../services/websocketService';

export const getProfiles = (_req: Request, res: Response) => {
  const profiles = store.getProfiles();
  return res.json({ success: true, count: profiles.length, data: profiles });
};

export const enrollProfile = (req: Request, res: Response) => {
  const { name, role = 'Authorized Staff', photoPreviewUrl, descriptor, notes, consentGranted } = req.body;

  if (!consentGranted) {
    return res.status(400).json({
      success: false,
      error: 'Explicit authorization/consent is strictly required to enroll biometric reference profiles.'
    });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Profile display name is required.'
    });
  }

  if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({
      success: false,
      error: 'Invalid face descriptor. A valid 128-dimensional embedding vector is required.'
    });
  }

  const newProfile: EnrolledProfile = {
    id: `PROF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
    name: name.trim(),
    role,
    enrolledAt: new Date().toISOString(),
    photoPreviewUrl,
    descriptor,
    notes,
    consentGranted: true
  };

  store.addProfile(newProfile);
  broadcastProfilesChanged();

  return res.status(201).json({
    success: true,
    message: `Reference profile for "${newProfile.name}" enrolled successfully.`,
    data: newProfile
  });
};


export const deleteProfile = (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = store.deleteProfile(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }
  broadcastProfilesChanged();
  return res.json({ success: true, message: 'Profile deleted successfully.' });
};

export const renameProfile = (req: Request, res: Response) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return res.status(400).json({ success: false, error: 'Enter a name of up to 80 characters.' });
  const profile = store.renameProfile(req.params.id, name.trim());
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found.' });
  broadcastProfilesChanged();
  return res.json({ success: true, data: profile });
};

export const clearAllProfiles = (_req: Request, res: Response) => {
  store.clearProfiles();
  broadcastProfilesChanged();
  return res.json({ success: true, message: 'All enrolled reference profiles cleared.' });
};
