import { Request, Response } from 'express';
import { store } from '../database/store';
import { EnrolledProfile } from '../../../src/types/profiles';
import { broadcastProfilesChanged } from '../services/websocketService';
import { mongoDatabase } from '../services/mongoPersistence';

const unavailable = (res: Response) => res.status(503).json({ success: false, error: 'MongoDB is unavailable. Your member change was not saved. Check the database connection and try again.' });
const failed = (res: Response, error: unknown) => { console.warn('[MongoDB] Profile operation failed:', (error as Error).message); return unavailable(res); };
const validPhoto = (photo: unknown) => typeof photo === 'string' && photo.length <= 1_800_000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo);
const validDescriptor = (descriptor: unknown) => Array.isArray(descriptor) && descriptor.length === 128 && descriptor.every(value => typeof value === 'number' && Number.isFinite(value));
const publicProfile = ({ _id, ...profile }: Record<string, unknown>) => profile as unknown as EnrolledProfile;

// On the home laptop, use the deployed backend as the profile database gateway.
// Atlas may block the laptop's changing public IP while allowing Render's stable service.
async function proxyProfiles(req: Request, res: Response): Promise<boolean> {
  const remote = process.env.FLOOR_REMOTE_API_URL?.replace(/\/$/, '');
  // Render exposes one of these runtime signals. The port guard also prevents
  // a production process from proxying profile calls back to itself.
  if (!remote || process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PORT === '10000') return false;
  try {
    const path = req.params.id ? `/api/profiles/${encodeURIComponent(req.params.id)}` : '/api/profiles';
    const response = await fetch(`${remote}${path}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'GET' ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.json() as { success?: boolean; data?: EnrolledProfile[] | EnrolledProfile; error?: string };
    if (response.ok) {
      if (req.method === 'GET' && Array.isArray(body.data)) store.replaceProfilesFromCloud(body.data);
      else if (req.method === 'DELETE' && req.params.id) store.replaceProfilesFromCloud(store.getProfiles().filter(item => item.id !== req.params.id));
      else if (req.method === 'DELETE') store.replaceProfilesFromCloud([]);
      else if (body.data && !Array.isArray(body.data)) store.replaceProfilesFromCloud([...store.getProfiles().filter(item => item.id !== (body.data as EnrolledProfile).id), body.data as EnrolledProfile]);
      if (req.method !== 'GET') broadcastProfilesChanged();
    }
    res.status(response.status).set('Cache-Control', 'no-store').json(body);
  } catch (error) {
    console.warn('[MongoDB] Remote profile gateway unavailable:', (error as Error).message);
    unavailable(res);
  }
  return true;
}

export const getProfiles = async (_req: Request, res: Response) => {
  if (await proxyProfiles(_req, res)) return;
  try {
    const db = await mongoDatabase();
    if (!db) return unavailable(res);
    const profiles = (await db.collection('profiles').find({}).toArray()).map(publicProfile);
    store.replaceProfilesFromCloud(profiles);
    return res.set('Cache-Control', 'no-store').json({ success: true, count: profiles.length, data: profiles });
  } catch (error) { return failed(res, error); }
};

export const enrollProfile = async (req: Request, res: Response) => {
  if (await proxyProfiles(req, res)) return;
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

  if (!validDescriptor(descriptor) || !validPhoto(photoPreviewUrl)) {
    return res.status(400).json({
      success: false,
      error: 'A valid face descriptor and JPEG, PNG, or WebP photo under 1.8 MB are required.'
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

  try {
    const db = await mongoDatabase();
    if (!db) return unavailable(res);
    await db.collection('profiles').insertOne(newProfile);
    store.replaceProfilesFromCloud([...store.getProfiles().filter(item => item.id !== newProfile.id), newProfile]);
    broadcastProfilesChanged();
    return res.status(201).json({
    success: true,
    message: `Reference profile for "${newProfile.name}" enrolled successfully.`,
    data: newProfile
  });
  } catch (error) { return failed(res, error); }
};

export const deleteProfile = async (req: Request, res: Response) => {
  if (await proxyProfiles(req, res)) return;
  const { id } = req.params;
  try {
    const db = await mongoDatabase();
    if (!db) return unavailable(res);
    const result = await db.collection('profiles').deleteOne({ id });
    if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Profile not found' });
    store.replaceProfilesFromCloud(store.getProfiles().filter(item => item.id !== id));
    broadcastProfilesChanged();
    return res.json({ success: true, message: 'Profile and biometric deleted from MongoDB.' });
  } catch (error) { return failed(res, error); }
};

export const renameProfile = async (req: Request, res: Response) => {
  if (await proxyProfiles(req, res)) return;
  const { name, photoPreviewUrl, descriptor } = req.body || {};
  const changes: Partial<EnrolledProfile> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return res.status(400).json({ success: false, error: 'Enter a name of up to 80 characters.' });
    changes.name = name.trim();
  }
  if (photoPreviewUrl !== undefined || descriptor !== undefined) {
    if (!validPhoto(photoPreviewUrl) || !validDescriptor(descriptor)) return res.status(400).json({ success: false, error: 'A valid photo and matching face descriptor are required together.' });
    changes.photoPreviewUrl = photoPreviewUrl;
    changes.descriptor = descriptor;
  }
  if (!Object.keys(changes).length) return res.status(400).json({ success: false, error: 'No member changes provided.' });
  try {
    const db = await mongoDatabase();
    if (!db) return unavailable(res);
    const result = await db.collection<EnrolledProfile>('profiles').findOneAndUpdate({ id: req.params.id }, { $set: changes }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ success: false, error: 'Profile not found.' });
    const profile = publicProfile(result as unknown as Record<string, unknown>);
    store.replaceProfilesFromCloud([...store.getProfiles().filter(item => item.id !== profile.id), profile]);
    broadcastProfilesChanged();
    return res.json({ success: true, data: profile });
  } catch (error) { return failed(res, error); }
};

export const clearAllProfiles = async (_req: Request, res: Response) => {
  if (await proxyProfiles(_req, res)) return;
  try {
    const db = await mongoDatabase();
    if (!db) return unavailable(res);
    await db.collection('profiles').deleteMany({});
    store.replaceProfilesFromCloud([]);
    broadcastProfilesChanged();
    return res.json({ success: true, message: 'All enrolled biometric profiles removed from MongoDB.' });
  } catch (error) { return failed(res, error); }
};
