import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceTelemetry, SystemMode, SystemStatusState } from '../types/device';
import { ApiClient } from '../services/apiClient';

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export function useDeviceStatus() {
  const [device, setDevice] = useState<DeviceTelemetry>({
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
    mode: 'DEMO',
  });

  const [mode, setMode] = useState<SystemMode>('DEMO');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isSimulatingFootstep, setIsSimulatingFootstep] = useState<boolean>(false);
  const [lastEventTime, setLastEventTime] = useState<string>(new Date().toISOString());
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial telemetry
  const fetchStatus = useCallback(async () => {
    try {
      const res = await ApiClient.getDevices();
      if (res.success && res.data.length > 0) {
        const primary = res.data[0];
        setDevice(primary);
        setMode(primary.mode);
      }
    } catch (e) {
      console.warn('Backend not responding yet, operating in local demonstration mode:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Setup WebSocket
    let ws: WebSocket;
    let reconnectTimeout: any;

    const connectWs = () => {
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'DEVICE_TELEMETRY_UPDATE') {
              setDevice(data.data);
              setMode(data.data.mode);
            } else if (data.type === 'NEW_SECURITY_EVENT') {
              setLastEventTime(data.data.timestamp);
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (e) {
        setWsConnected(false);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchStatus]);

  // Toggle Mode (Demo vs Live)
  const switchMode = useCallback(async (newMode: SystemMode) => {
    try {
      const res = await ApiClient.setDeviceMode(device.deviceId, newMode);
      if (res.success) {
        setDevice(res.data);
        setMode(res.data.mode);
      }
    } catch (e) {
      // Local fallback
      setMode(newMode);
      setDevice(prev => ({
        ...prev,
        mode: newMode,
        status: newMode === 'LIVE_CONNECTED' ? 'Connected' : 'Demo Mode'
      }));
    }
  }, [device.deviceId]);

  // Simulate a footstep pressure event in Demo Mode
  const triggerSimulatedFootstep = useCallback(async (analogReading = 720) => {
    setIsSimulatingFootstep(true);
    try {
      await ApiClient.postDeviceEvent(device.deviceId, {
        sensorReading: analogReading,
        analogVoltage: Number(((analogReading / 1023) * 5).toFixed(2)),
        description: `[DEMO SIMULATION] Piezoelectric impact spike detected on mat (Analog: ${analogReading}/1023). Local buzzer energized for 3 seconds.`,
        isTriggered: true,
      });
      setLastEventTime(new Date().toISOString());
    } catch (e) {
      console.warn('Could not post simulated event to backend:', e);
    } finally {
      setTimeout(() => {
        setIsSimulatingFootstep(false);
      }, 3000);
    }
  }, [device.deviceId]);

  const systemStatus: SystemStatusState = {
    sensor: mode === 'LIVE_CONNECTED' ? (device.isTriggered ? 'Alert Active' : 'Monitoring') : 'Demo Mode',
    controller: mode === 'LIVE_CONNECTED' ? 'Connected' : 'Demo Mode',
    camera: 'Monitoring',
    network: wsConnected ? 'Connected' : 'Disconnected',
    monitoringState: device.isTriggered ? 'Alert Active' : (mode === 'LIVE_CONNECTED' ? 'Monitoring' : 'Demo Mode'),
    mode: mode,
    lastHeartbeat: device.lastHeartbeat,
  };

  return {
    device,
    mode,
    systemStatus,
    wsConnected,
    isSimulatingFootstep,
    lastEventTime,
    switchMode,
    triggerSimulatedFootstep,
    refreshStatus: fetchStatus,
  };
}
