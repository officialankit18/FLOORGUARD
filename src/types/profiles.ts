export interface EnrolledProfile {
  id: string;
  name: string;
  role: 'Resident' | 'Authorized Staff' | 'Maintenance' | 'Guest' | 'Administrator';
  enrolledAt: string;
  photoPreviewUrl?: string; // Stored locally as data URI or blob preview for authorized verification
  photoStoragePath?: string;
  descriptor: number[]; // 128-dimensional floating point embedding vector
  notes?: string;
  consentGranted: boolean;
}

export interface ProfileEnrollmentPayload {
  name: string;
  role: 'Resident' | 'Authorized Staff' | 'Maintenance' | 'Guest' | 'Administrator';
  photoPreviewUrl?: string;
  descriptor: number[];
  notes?: string;
  consentGranted: boolean;
}
