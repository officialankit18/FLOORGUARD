import * as faceapi from '@vladmandic/face-api';
import { FaceDetectionResult } from '../types/vision';
import { EnrolledProfile } from '../types/profiles';

export class FaceRecognitionService {
  private static isInitialized = false;
  private static isLoading = false;
  private static initError: string | null = null;
  private static initializationPromise: Promise<void> | null = null;

  public static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.isLoading = true;
    this.initError = null;
    this.initializationPromise = (async () => {
      try {
      const MODEL_URL = '/models';

      console.log('[Face-API] Loading pre-trained recognition models from', MODEL_URL);

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      this.isInitialized = true;
      console.log('[Face-API] Face detection, 68 landmarks, and 128-d recognition nets ready.');
      } catch (err: any) {
      console.error('[Face-API] Failed loading recognition models:', err);
      this.initError = err.message || 'Failed to load face recognition models from local server.';
      throw err;
      } finally {
      this.isLoading = false;
      this.initializationPromise = null;
      }
    })();
    return this.initializationPromise;
  }

  public static isReady(): boolean {
    return this.isInitialized;
  }

  public static getError(): string | null {
    return this.initError;
  }

  /**
   * Euclidean distance between two 128-dimensional face embedding vectors.
   * Standard threshold for face-api ResNet: 0.58 - 0.60.
   */
  public static euclideanDistance(arr1: number[] | Float32Array, arr2: number[] | Float32Array): number {
    let sum = 0;
    const len = Math.min(arr1.length, arr2.length);
    for (let i = 0; i < len; i++) {
      const diff = arr1[i] - arr2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Extract face descriptor from a single image/canvas (used for profile enrollment)
   */
  public static async extractDescriptorFromElement(
    input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
  ): Promise<{ descriptor: number[]; box: { x: number; y: number; width: number; height: number } } | null> {
    await this.initialize();

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.4,
    });

    const detection = await faceapi
      .detectSingleFace(input, options)
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) return null;

    return {
      descriptor: Array.from(detection.descriptor),
      box: {
        x: detection.detection.box.x,
        y: detection.detection.box.y,
        width: detection.detection.box.width,
        height: detection.detection.box.height,
      },
    };
  }

  /**
   * Run real-time detection, landmarks, and identity comparison against enrolled reference profiles
   */
  public static async processVideoFrame(
    videoElement: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    enrolledProfiles: EnrolledProfile[],
    threshold = 0.58
  ): Promise<FaceDetectionResult[]> {
    const sourceWidth = videoElement instanceof HTMLVideoElement ? videoElement.videoWidth : videoElement instanceof HTMLImageElement ? videoElement.naturalWidth : videoElement.width;
    if (!this.isInitialized || !videoElement || sourceWidth === 0) return [];

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.45,
    });

    try {
      const detections = await faceapi
        .detectAllFaces(videoElement, options)
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      return detections.map(det => {
        const box = det.detection.box;
        const descriptor = Array.from(det.descriptor);
        const score = Math.round(det.detection.score * 100);

        // Compare against enrolled reference profiles
        let bestMatch: {
          profileId: string;
          name: string;
          role?: string;
          distance: number;
          isMatch: boolean;
        } | undefined = undefined;

        let minDistance = 999;
        let matchedProfile: EnrolledProfile | null = null;

        for (const profile of enrolledProfiles) {
          if (!profile.descriptor || profile.descriptor.length !== 128) continue;
          const dist = this.euclideanDistance(descriptor, profile.descriptor);
          if (dist < minDistance) {
            minDistance = dist;
            matchedProfile = profile;
          }
        }

        if (matchedProfile && minDistance <= threshold) {
          bestMatch = {
            profileId: matchedProfile.id,
            name: matchedProfile.name,
            role: matchedProfile.role,
            distance: Number(minDistance.toFixed(3)),
            isMatch: true,
          };
        } else if (matchedProfile && minDistance > threshold) {
          bestMatch = {
            profileId: 'UNKNOWN',
            name: 'Unknown Individual',
            distance: Number(minDistance.toFixed(3)),
            isMatch: false,
          };
        }

        let status: FaceDetectionResult['status'] = 'DETECTED_ONLY';
        if (enrolledProfiles.length === 0) {
          status = 'DETECTED_ONLY';
        } else if (bestMatch?.isMatch) {
          status = 'KNOWN_MATCH';
        } else if (score < 50) {
          status = 'LOW_CONFIDENCE';
        } else {
          status = 'UNKNOWN_FACE';
        }

        const landmarks = det.landmarks.positions.map(p => ({ x: p.x, y: p.y }));

        return {
          box: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
          confidence: score,
          landmarks,
          descriptor,
          recognitionMatch: bestMatch,
          status,
        };
      });
    } catch (err) {
      console.warn('[Face-API] Frame detection pass error:', err);
      return [];
    }
  }
}
