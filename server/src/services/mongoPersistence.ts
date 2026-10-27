import { MongoClient, Db } from 'mongodb';
import { DeviceTelemetry } from '../../../src/types/device';
import { SecurityEvent } from '../../../src/types/events';
import { EnrolledProfile } from '../../../src/types/profiles';

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<boolean> | null = null;

async function connect() {
  if (db) return true;
  const uri = process.env.MONGODB_URI;
  if (!uri) return false;
  if (!connecting) {
    connecting = (async () => {
      try {
        client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
        await client.connect();
        db = client.db(process.env.MONGODB_DATABASE || 'floorguard');
        await Promise.all([
          db.collection('devices').createIndex({ deviceId: 1 }, { unique: true }),
          db.collection('events').createIndex({ timestamp: -1 }),
          db.collection('profiles').createIndex({ id: 1 }, { unique: true }),
        ]);
        console.log('[MongoDB] Atlas connected.');
        return true;
      } catch (error) {
        console.warn('[MongoDB] Connection failed; local history remains active:', (error as Error).message);
        await client?.close().catch(() => undefined);
        client = null;
        db = null;
        return false;
      }
    })();
  }
  const result = await connecting;
  if (!result) connecting = null;
  return result;
}

export async function mongoDatabase() { return await connect() ? db : null; }

export function isMongoEnabled() { return Boolean(process.env.MONGODB_URI); }

export async function getMongoStatus(): Promise<'Connected' | 'Not configured' | 'Offline'> {
  if (!process.env.MONGODB_URI) return 'Not configured';
  return await connect() ? 'Connected' : 'Offline';
}

export async function saveDevice(device: DeviceTelemetry) {
  if (!await connect() || !db) return;
  await db.collection('devices').replaceOne({ deviceId: device.deviceId }, device, { upsert: true });
}

export async function saveEvent(event: SecurityEvent) {
  if (!await connect() || !db) return;
  await db.collection('events').replaceOne({ id: event.id }, event, { upsert: true });
}

export async function removeEvent(id: string) {
  if (!await connect() || !db) return;
  await db.collection('events').deleteOne({ id });
}

export async function saveProfile(profile: EnrolledProfile) {
  if (!await connect() || !db) return;
  await db.collection('profiles').replaceOne({ id: profile.id }, profile, { upsert: true });
}

export async function removeProfile(id: string) {
  if (!await connect() || !db) return;
  await db.collection('profiles').deleteOne({ id });
}

export async function clearCollection(name: 'events' | 'profiles') {
  if (!await connect() || !db) return;
  await db.collection(name).deleteMany({});
}

export async function hydrate() {
  if (!await connect() || !db) return null;
  const [devices, events, profiles] = await Promise.all([
    db.collection('devices').find({}).toArray(),
    db.collection('events').find({}).toArray(),
    db.collection('profiles').find({}).toArray(),
  ]);
  return {
    devices: devices.map(({ _id, ...item }) => item as unknown as DeviceTelemetry),
    events: events.map(({ _id, ...item }) => item as unknown as SecurityEvent),
    profiles: profiles.map(({ _id, ...item }) => item as unknown as EnrolledProfile),
  };
}

export async function closeMongo() {
  await client?.close();
  client = null;
  db = null;
  connecting = null;
}
