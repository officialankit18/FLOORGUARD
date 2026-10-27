export interface VideoDeviceInfo {
  deviceId: string;
  label: string;
}

export class CameraService {
  private static activeStream: MediaStream | null = null;

  public static async isCameraSupported(): Promise<boolean> {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  public static async getAvailableVideoDevices(): Promise<VideoDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1}`
        }));
    } catch (e) {
      console.warn('Could not enumerate video devices:', e);
      return [];
    }
  }

  public static async startStream(deviceId?: string, facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
    if (!window.isSecureContext) {
      throw new Error('Phone camera needs a secure HTTPS link. Open FLOORGUARD through its HTTPS address, then allow camera access.');
    }
    if (!await this.isCameraSupported()) {
      throw new Error('Your browser does not support camera capture via getUserMedia.');
    }

    // Stop existing stream tracks first
    this.stopStream();

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : {
            facingMode,
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.activeStream = stream;
      return stream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera access permission was denied. Please allow camera permissions in browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No physical camera device was found on this system.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('Camera is currently in use by another application or tab.');
      } else if (err.name === 'OverconstrainedError') {
        // Fallback to basic unconstrained video
        const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.activeStream = fallback;
        return fallback;
      }
      throw new Error(err.message || 'An unexpected error occurred while starting the camera.');
    }
  }

  public static stopStream(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      this.activeStream = null;
    }
  }

  public static captureSnapshot(videoElement: HTMLVideoElement): string | null {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
}
