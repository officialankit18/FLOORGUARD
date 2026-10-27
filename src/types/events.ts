import { SystemMode } from './device';

export type EventType =
  | 'Footstep Event'
  | 'Potential Intrusion'
  | 'Face Detected'
  | 'Known Face Match'
  | 'Unknown Face'
  | 'Camera Started'
  | 'Camera Stopped'
  | 'Device Connected'
  | 'Device Disconnected'
  | 'Alert Acknowledged'
  | 'Verification Required';

export type EventSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: EventType;
  source: 'Floor Mat Sensor' | 'ESP32-CAM' | 'Local Browser Camera' | 'System Controller' | 'User Action';
  description: string;
  severity: EventSeverity;
  mode: SystemMode;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  metadata?: {
    piezoVoltage?: number;
    piezoReading?: number;
    faceConfidence?: number;
    recognizedProfileId?: string;
    recognizedName?: string;
    distance?: number;
    snapshotUrl?: string;
    snapshotStoragePath?: string;
    details?: string;
  };
}

export interface EventFilterCriteria {
  eventType?: string;
  severity?: string;
  mode?: string;
  search?: string;
  acknowledged?: boolean | null;
}
