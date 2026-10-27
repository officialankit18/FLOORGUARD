import { Request, Response } from 'express';
import { store } from '../database/store';
import { broadcastEvent, broadcastDeviceUpdate } from '../services/websocketService';
import { SecurityEvent } from '../../../src/types/events';

export const getDevices = (_req: Request, res: Response) => {
  const devices = store.getDevices();
  return res.json({ success: true, count: devices.length, data: devices });
};

export const getDeviceStatus = (req: Request, res: Response) => {
  const { id } = req.params;
  const device = store.getDevice(id);
  if (!device) {
    return res.status(404).json({ success: false, error: `Device ${id} not found.` });
  }
  return res.json({ success: true, data: device });
};

export const ingestDeviceEvent = (req: Request, res: Response) => {
  const { id } = req.params;
  const device = store.getDevice(id);

  if (!device) {
    return res.status(404).json({ success: false, error: `Device ${id} not found in registry.` });
  }

  // Validate shared authentication key for IoT hardware (prevents spoofing)
  const authHeader = req.headers['x-device-auth'] || req.query.auth;
  const expectedSecret = process.env.DEVICE_AUTH_SECRET || 'floorguard-device-shared-secret-demo';
  
  if (device.mode === 'LIVE_CONNECTED' && authHeader !== expectedSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized IoT Device. Invalid device token.'
    });
  }

  const {
    eventType = 'Footstep Event',
    sensorReading = 512,
    analogVoltage = 2.5,
    description,
    isTriggered = true,
  } = req.body;

  // Construct Security Event
  const newEvent: SecurityEvent = {
    id: `EVT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    eventType: eventType,
    source: 'Floor Mat Sensor',
    description: description || `Piezoelectric vibration threshold exceeded on ${device.deviceName} (Sensor value: ${sensorReading}).`,
    severity: sensorReading > 700 ? 'critical' : 'warning',
    mode: device.mode,
    acknowledged: false,
    metadata: {
      piezoReading: sensorReading,
      piezoVoltage: analogVoltage,
      details: `Hardware telemetry: threshold ${device.piezoThreshold}, reading ${sensorReading}.`
    }
  };

  store.addEvent(newEvent);
  broadcastEvent(newEvent);

  // Update device telemetry
  const updatedDevice = store.updateDevice(id, {
    lastReading: sensorReading,
    isTriggered: isTriggered,
    buzzerState: isTriggered,
    lcdMessage: isTriggered ? 'INTRUSION ALERT!' : 'SYSTEM ARMED',
    lastHeartbeat: new Date().toISOString(),
    status: isTriggered ? 'Alert Active' : 'Monitoring'
  });

  if (updatedDevice) {
    broadcastDeviceUpdate(updatedDevice);
  }

  return res.status(201).json({
    success: true,
    message: 'Hardware event processed successfully.',
    data: newEvent
  });
};

export const updateDeviceHeartbeat = (req: Request, res: Response) => {
  const { id } = req.params;
  const { rssi, lastReading, firmwareVersion } = req.body;

  const device = store.getDevice(id);
  if (!device) {
    return res.status(404).json({ success: false, error: 'Device not found' });
  }

  const updated = store.updateDevice(id, {
    lastHeartbeat: new Date().toISOString(),
    status: 'Monitoring',
    ...(rssi !== undefined && { rssi }),
    ...(lastReading !== undefined && { lastReading }),
    ...(firmwareVersion && { firmwareVersion }),
  });

  if (updated) {
    broadcastDeviceUpdate(updated);
  }

  return res.json({ success: true, data: updated });
};

export const setDeviceMode = (req: Request, res: Response) => {
  const { id } = req.params;
  const { mode } = req.body;

  if (mode !== 'DEMO' && mode !== 'LIVE_CONNECTED') {
    return res.status(400).json({ success: false, error: 'Mode must be DEMO or LIVE_CONNECTED' });
  }

  const updated = store.updateDevice(id, {
    mode,
    status: mode === 'DEMO' ? 'Demo Mode' : 'Connected'
  });

  if (!updated) {
    return res.status(404).json({ success: false, error: 'Device not found' });
  }

  broadcastDeviceUpdate(updated);
  return res.json({ success: true, data: updated });
};
