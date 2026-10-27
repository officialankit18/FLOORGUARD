import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { DeviceTelemetry, SystemMode, SystemStatusState } from '../types/device';
import { ApiClient } from '../services/apiClient';
import { devicesQuery } from '../services/dashboardData';
import { subscribeConnection, getConnectionStatus, subscribeLive } from '../services/liveConnection';

const INITIAL_DEVICE: DeviceTelemetry = {
  deviceId: 'MAT-NODE-01', deviceName: 'Main Entrance Smart Mat (Zone A)',
  firmwareVersion: '', piezoThreshold: 450, lastReading: 0, isTriggered: false,
  buzzerState: false, lcdMessage: '', servoLocked: false, lastHeartbeat: '',
  status: 'Initializing', mode: 'DEMO',
};
export function useDeviceStatus() {
  const snapshot = useSyncExternalStore(devicesQuery.subscribe, devicesQuery.getSnapshot);
  const wsConnected = useSyncExternalStore(subscribeConnection, getConnectionStatus);
  const device = snapshot.data?.data[0] || INITIAL_DEVICE;
  const mode = device.mode;
  const [isSimulatingFootstep, setIsSimulatingFootstep] = useState(false);
  const [lastEventTime, setLastEventTime] = useState('');
  useEffect(() => { void devicesQuery.load(); }, []);
  useEffect(() => subscribeLive(message => {
    if (message.type === 'NEW_SECURITY_EVENT') setLastEventTime(message.data.timestamp);
  }), []);
  const switchMode = useCallback(async (newMode: SystemMode) => {
    const response = await ApiClient.setDeviceMode(device.deviceId, newMode);
    if (response.success) devicesQuery.update(current => ({
      success: true, data: [response.data, ...(current?.data.filter(item => item.deviceId !== device.deviceId) || [])],
    }));
  }, [device.deviceId]);
  const triggerSimulatedFootstep = useCallback(async (analogReading = 720) => {
    setIsSimulatingFootstep(true);
    try {
      await ApiClient.postDeviceEvent(device.deviceId, {
        sensorReading: analogReading, analogVoltage: Number(((analogReading / 1023) * 5).toFixed(2)),
        description: '[DEMO SIMULATION] Piezoelectric impact spike detected on mat.', isTriggered: true,
      });
      setLastEventTime(new Date().toISOString());
    } finally { setTimeout(() => setIsSimulatingFootstep(false), 3000); }
  }, [device.deviceId]);
  const systemStatus: SystemStatusState = {
    sensor: mode === 'LIVE_CONNECTED' ? (device.isTriggered ? 'Alert Active' : 'Monitoring') : 'Demo Mode',
    controller: device.status, camera: 'Monitoring',
    network: wsConnected ? 'Connected' : 'Disconnected',
    monitoringState: device.isTriggered ? 'Alert Active' : (mode === 'LIVE_CONNECTED' ? 'Monitoring' : 'Demo Mode'),
    mode, lastHeartbeat: device.lastHeartbeat,
  };
  return { device, mode, systemStatus, wsConnected, isSimulatingFootstep, lastEventTime,
    isLoading: snapshot.isLoading, switchMode, triggerSimulatedFootstep, refreshStatus: () => devicesQuery.load(true) };
}
