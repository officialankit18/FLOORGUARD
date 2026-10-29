import fs from 'fs';
import path from 'path';
import { SecurityEvent } from '../../../src/types/events';
import { EnrolledProfile } from '../../../src/types/profiles';
import { DeviceTelemetry } from '../../../src/types/device';
import { clearCollection, removeEvent, removeProfile, saveDevice, saveEvent, saveProfile } from '../services/mongoPersistence';

interface DatabaseSchema {
  devices: DeviceTelemetry[];
  events: SecurityEvent[];
  profiles: EnrolledProfile[];
}

const DB_FILE = process.env.VITEST
  ? path.resolve(process.cwd(), 'server', 'data', `db.test-${process.pid}.json`)
  : path.resolve(process.cwd(), 'server', 'data', 'db.json');

const INITIAL_DATA: DatabaseSchema = {
  devices: [
    {
      deviceId: 'MAT-NODE-01',
      deviceName: 'Main Entrance Smart Mat (Zone A)',
      firmwareVersion: 'FG-FW-v1.4.2',
      piezoThreshold: 450,
      lastReading: 12,
      isTriggered: false,
      buzzerState: false,
      lcdMessage: 'SYSTEM ARMED - SECURE',
      servoLocked: false,
      lastHeartbeat: new Date().toISOString(),
      status: 'Demo Mode',
      mode: 'DEMO'
    }
  ],
  events: [
    {
      id: 'EVT-INIT-001',
      timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      eventType: 'Device Connected',
      source: 'System Controller',
      description: 'System booted. Ready in Demonstration Mode (Local Vision & Simulated Mat).',
      severity: 'info',
      mode: 'DEMO',
      acknowledged: true,
      acknowledgedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      acknowledgedBy: 'System'
    },
    {
      id: 'EVT-INIT-002',
      timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      eventType: 'Footstep Event',
      source: 'Floor Mat Sensor',
      description: 'Piezoelectric sensor triggered pressure transient (Analog: 684/1023). Local buzzer fired for 3s.',
      severity: 'warning',
      mode: 'DEMO',
      acknowledged: false,
      metadata: {
        piezoReading: 684,
        piezoVoltage: 3.34,
        details: 'Simulated demonstration footstep event at primary mat zone.'
      }
    }
  ],
  profiles: []
};

class Store {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.load();
  }

  private ensureDirectory() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to parse db.json, reinitializing with defaults.', e);
    }
    this.save(INITIAL_DATA);
    return INITIAL_DATA;
  }

  private save(data: DatabaseSchema) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving db.json:', e);
    }
  }

  // --- Devices ---
  public getDevices(): DeviceTelemetry[] {
    return this.data.devices;
  }

  public getDevice(id: string): DeviceTelemetry | undefined {
    return this.data.devices.find(d => d.deviceId === id);
  }

  public updateDevice(id: string, updates: Partial<DeviceTelemetry>): DeviceTelemetry | undefined {
    const idx = this.data.devices.findIndex(d => d.deviceId === id);
    if (idx !== -1) {
      this.data.devices[idx] = { ...this.data.devices[idx], ...updates };
      this.save(this.data);
      void saveDevice(this.data.devices[idx]).catch((error) => console.warn('[Firebase] Device sync failed:', error.message));
      return this.data.devices[idx];
    }
    return undefined;
  }

  public upsertDevice(device: DeviceTelemetry): DeviceTelemetry {
    const idx = this.data.devices.findIndex(d => d.deviceId === device.deviceId);
    if (idx !== -1) {
      this.data.devices[idx] = device;
    } else {
      this.data.devices.push(device);
    }
    this.save(this.data);
    void saveDevice(device).catch((error) => console.warn('[Firebase] Device sync failed:', error.message));
    return device;
  }

  // --- Events ---
  public getEvents(): SecurityEvent[] {
    return [...this.data.events].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public addEvent(event: SecurityEvent): SecurityEvent {
    this.data.events.unshift(event);
    this.save(this.data);
    void saveEvent(event).catch((error) => console.warn('[Firebase] Event sync failed:', error.message));
    return event;
  }

  public getEvent(id: string): SecurityEvent | undefined {
    return this.data.events.find(e => e.id === id);
  }

  public acknowledgeEvent(id: string, acknowledgedBy = 'Authorized Operator'): SecurityEvent | undefined {
    const event = this.data.events.find(e => e.id === id);
    if (event) {
      event.acknowledged = true;
      event.acknowledgedAt = new Date().toISOString();
      event.acknowledgedBy = acknowledgedBy;
      this.save(this.data);
      void saveEvent(event).catch((error) => console.warn('[Firebase] Event sync failed:', error.message));
      return event;
    }
    return undefined;
  }

  public deleteEvent(id: string): boolean {
    const initialLen = this.data.events.length;
    this.data.events = this.data.events.filter(e => e.id !== id);
    if (this.data.events.length !== initialLen) {
      this.save(this.data);
      void removeEvent(id).catch((error) => console.warn('[Firebase] Event deletion sync failed:', error.message));
      return true;
    }
    return false;
  }

  public clearEvents(): void {
    this.data.events = [];
    this.save(this.data);
    void clearCollection('events').catch((error) => console.warn('[MongoDB] Event clear sync failed:', error.message));
  }

  // --- Profiles ---
  public getProfiles(): EnrolledProfile[] {
    return this.data.profiles;
  }

  public addProfile(profile: EnrolledProfile): EnrolledProfile {
    this.data.profiles.push(profile);
    this.save(this.data);
    void saveProfile(profile).catch((error) => console.warn('[Firebase] Profile sync failed:', error.message));
    return profile;
  }

  public renameProfile(id: string, name: string): EnrolledProfile | undefined {
    const profile = this.data.profiles.find(item => item.id === id);
    if (!profile) return undefined;
    profile.name = name;
    this.save(this.data);
    void saveProfile(profile).catch((error) => console.warn('[MongoDB] Profile update sync failed:', error.message));
    return profile;
  }

  public deleteProfile(id: string): boolean {
    const initialLen = this.data.profiles.length;
    this.data.profiles = this.data.profiles.filter(p => p.id !== id);
    if (this.data.profiles.length !== initialLen) {
      this.save(this.data);
      void removeProfile(id).catch((error) => console.warn('[Firebase] Profile deletion sync failed:', error.message));
      return true;
    }
    return false;
  }

  public updateProfilePhoto(id: string, photoStoragePath: string): EnrolledProfile | undefined {
    const profile = this.data.profiles.find((item) => item.id === id);
    if (!profile) return undefined;
    profile.photoPreviewUrl = `/api/profiles/${id}/photo`;
    profile.photoStoragePath = photoStoragePath;
    this.save(this.data);
    void saveProfile(profile).catch((error) => console.warn('[Firebase] Profile photo sync failed:', error.message));
    return profile;
  }

  public clearProfiles(): void {
    this.data.profiles = [];
    this.save(this.data);
    void clearCollection('profiles').catch((error) => console.warn('[MongoDB] Profile clear sync failed:', error.message));
  }

  public setCloudSnapshot(data: DatabaseSchema) {
    this.data = data;
    this.save(this.data);
  }

  public updateEventSnapshot(id: string, snapshotStoragePath: string): SecurityEvent | undefined {
    const event = this.data.events.find((item) => item.id === id);
    if (!event) return undefined;
    event.metadata = { ...event.metadata, snapshotUrl: `/api/events/${id}/snapshot`, snapshotStoragePath };
    this.save(this.data);
    void saveEvent(event).catch((error) => console.warn('[Firebase] Snapshot sync failed:', error.message));
    return event;
  }

  public updateEventImage(id: string, snapshotUrl: string): SecurityEvent | undefined {
    const event = this.getEvent(id);
    if (!event) return undefined;
    event.metadata = { ...event.metadata, snapshotUrl };
    this.save(this.data);
    void saveEvent(event).catch(error => console.warn('[MongoDB] Snapshot sync failed:', error.message));
    return event;
  }
}

export const store = new Store();
