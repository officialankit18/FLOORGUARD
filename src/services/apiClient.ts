import { DeviceTelemetry, SystemMode } from '../types/device';
import { SecurityEvent, EventFilterCriteria } from '../types/events';
import { EnrolledProfile, ProfileEnrollmentPayload } from '../types/profiles';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiClient {
  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    };

    try {
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) {
        let errMessage = `HTTP Error ${res.status}: ${res.statusText}`;
        try {
          const errData = await res.json();
          if (errData.error) errMessage = errData.error;
        } catch (_) {}
        throw new Error(errMessage);
      }
      return await res.json();
    } catch (err: any) {
      console.warn(`[API] Failed call to ${endpoint}:`, err.message);
      throw err;
    }
  }

  // --- Health ---
  public static async getHealth(): Promise<any> {
    return this.request('/health');
  }

  // --- Devices ---
  public static async getDevices(): Promise<{ success: boolean; data: DeviceTelemetry[] }> {
    return this.request('/devices');
  }

  public static async getDeviceStatus(id: string): Promise<{ success: boolean; data: DeviceTelemetry }> {
    return this.request(`/devices/${id}/status`);
  }

  public static async setDeviceMode(id: string, mode: SystemMode): Promise<{ success: boolean; data: DeviceTelemetry }> {
    return this.request(`/devices/${id}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  public static async postDeviceEvent(
    id: string,
    payload: {
      sensorReading: number;
      analogVoltage?: number;
      description?: string;
      isTriggered?: boolean;
    }
  ): Promise<{ success: boolean; data: SecurityEvent }> {
    return this.request(`/devices/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // --- Events ---
  public static async getEvents(
    criteria?: EventFilterCriteria,
    page = 1,
    limit = 50
  ): Promise<{ success: boolean; total: number; page: number; totalPages: number; data: SecurityEvent[] }> {
    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));

    if (criteria?.eventType) query.set('eventType', criteria.eventType);
    if (criteria?.from) query.set('from', criteria.from);
    if (criteria?.to) query.set('to', criteria.to);
    if (criteria?.severity) query.set('severity', criteria.severity);
    if (criteria?.mode) query.set('mode', criteria.mode);
    if (criteria?.search) query.set('search', criteria.search);
    if (criteria?.acknowledged !== undefined && criteria?.acknowledged !== null) {
      query.set('acknowledged', String(criteria.acknowledged));
    }

    return this.request(`/events?${query.toString()}`);
  }

  public static async createEvent(
    payload: Partial<SecurityEvent>
  ): Promise<{ success: boolean; data: SecurityEvent; deduplicated?: boolean }> {
    return this.request('/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static async acknowledgeEvent(
    id: string,
    acknowledgedBy = 'Security Operator'
  ): Promise<{ success: boolean; data: SecurityEvent }> {
    return this.request(`/events/${id}/acknowledge`, {
      method: 'PATCH',
      body: JSON.stringify({ acknowledgedBy }),
    });
  }

  public static async deleteEvent(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/events/${id}`, { method: 'DELETE' });
  }

  public static async clearAllEvents(): Promise<{ success: boolean; message: string }> {
    return this.request('/events', { method: 'DELETE' });
  }

  // --- Profiles ---
  public static async getProfiles(): Promise<{ success: boolean; data: EnrolledProfile[] }> {
    return this.request('/profiles');
  }

  public static async enrollProfile(
    payload: ProfileEnrollmentPayload
  ): Promise<{ success: boolean; data: EnrolledProfile }> {
    return this.request('/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static async deleteProfile(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/profiles/${id}`, { method: 'DELETE' });
  }

  public static async clearAllProfiles(): Promise<{ success: boolean; message: string }> {
    return this.request('/profiles', { method: 'DELETE' });
  }
}
