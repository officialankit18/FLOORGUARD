import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceDetectionResult, VisionEngineType, VisionProcessingState } from '../types/vision';
import { EnrolledProfile } from '../types/profiles';
import { MediaPipeFaceService } from '../services/faceDetectionService';
import { FaceRecognitionService } from '../services/faceRecognitionService';
import { SoundAlertService } from '../services/soundAlertService';

interface UseVisionProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isCameraActive: boolean;
  uploadedImage: string | null;
  enrolledProfiles: EnrolledProfile[];
  onSecurityEventTrigger?: (event: {
    eventType: 'Face Detected' | 'Known Face Match' | 'Unknown Face';
    severity: 'info' | 'warning' | 'success';
    name?: string;
    distance?: number;
    description: string;
  }) => void;
}

export function useVision({
  videoRef,
  isCameraActive,
  uploadedImage,
  enrolledProfiles,
  onSecurityEventTrigger,
}: UseVisionProps) {
  const [engine, setEngine] = useState<VisionEngineType>('face-api');
  const [state, setState] = useState<VisionProcessingState>('idle');
  const [detections, setDetections] = useState<FaceDetectionResult[]>([]);
  const [matchThreshold, setMatchThreshold] = useState<number>(0.58);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const isRunningRef = useRef<boolean>(false);
  const lastProcessedTimeRef = useRef<number>(0);
  const lastEventCooldownRef = useRef<{ [key: string]: number }>({});
  const animationFrameIdRef = useRef<number | null>(null);

  // Initialize models on mount
  useEffect(() => {
    let mounted = true;

    async function loadModels() {
      setState('loading_models');
      setModelError(null);
      try {
        if (engine === 'face-api') {
          await FaceRecognitionService.initialize();
        } else {
          await MediaPipeFaceService.initialize();
        }
        if (mounted) {
          setState('ready');
        }
      } catch (err: any) {
        if (mounted) {
          setState('error');
          setModelError(err.message || 'Failed to initialize vision models.');
        }
      }
    }

    loadModels();

    return () => {
      mounted = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [engine]);

  // Handle cooldown deduplication for events
  const emitDetectionEvent = useCallback(
    (result: FaceDetectionResult) => {
      if (!onSecurityEventTrigger) return;
      const now = Date.now();
      const eventKey = result.recognitionMatch?.isMatch
        ? `KNOWN_${result.recognitionMatch.name}`
        : 'UNKNOWN_FACE';

      const lastTime = lastEventCooldownRef.current[eventKey] || 0;
      if (now - lastTime < 6000) {
        return; // Still in 6-second cooldown for this identity
      }
      lastEventCooldownRef.current[eventKey] = now;

      if (result.recognitionMatch?.isMatch) {
        SoundAlertService.playAuthorizedMatchTone();
        onSecurityEventTrigger({
          eventType: 'Known Face Match',
          severity: 'success',
          name: result.recognitionMatch.name,
          distance: result.recognitionMatch.distance,
          description: `Authorized face match: "${result.recognitionMatch.name}" (${result.recognitionMatch.role || 'Personnel'}) confirmed with Euclidean distance ${result.recognitionMatch.distance}.`,
        });
      } else if (result.status === 'UNKNOWN_FACE') {
        SoundAlertService.playNotificationSound();
        onSecurityEventTrigger({
          eventType: 'Unknown Face',
          severity: 'warning',
          description: `Unknown face detected at camera entrance. No matching profile in authorized database.`,
        });
      } else {
        onSecurityEventTrigger({
          eventType: 'Face Detected',
          severity: 'info',
          description: `Visual presence detected at entrance (${result.confidence}% confidence).`,
        });
      }
    },
    [onSecurityEventTrigger]
  );

  // Video Frame Loop
  useEffect(() => {
    if (!isCameraActive || state !== 'ready' || !videoRef.current) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (!uploadedImage) {
        setDetections([]);
      }
      isRunningRef.current = false;
      return;
    }

    isRunningRef.current = true;
    const FRAME_INTERVAL_MS = 100; // ~10 FPS for reliable, non-blocking performance

    const processLoop = async () => {
      if (!isRunningRef.current || !videoRef.current) return;

      const now = performance.now();
      if (now - lastProcessedTimeRef.current >= FRAME_INTERVAL_MS) {
        lastProcessedTimeRef.current = now;

        if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
          try {
            let results: FaceDetectionResult[] = [];

            if (engine === 'face-api') {
              results = await FaceRecognitionService.processVideoFrame(
                videoRef.current,
                enrolledProfiles,
                matchThreshold
              );
            } else {
              results = MediaPipeFaceService.detectVideoFrame(videoRef.current, now);
            }

            setDetections(results);

            // Trigger events if faces detected
            if (results.length > 0) {
              results.forEach(res => emitDetectionEvent(res));
            }
          } catch (e) {
            console.warn('Inference error in loop:', e);
          }
        }
      }

      if (isRunningRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(processLoop);
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(processLoop);

    return () => {
      isRunningRef.current = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isCameraActive, state, engine, matchThreshold, enrolledProfiles, videoRef, uploadedImage, emitDetectionEvent]);

  // Static uploaded image inference
  useEffect(() => {
    if (!uploadedImage) return;

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = uploadedImage;

    img.onload = async () => {
      try {
        await FaceRecognitionService.initialize();
        const results = await FaceRecognitionService.processVideoFrame(
          img as any,
          enrolledProfiles,
          matchThreshold
        );
        if (isMounted) {
          setDetections(results);
          if (results.length > 0) {
            results.forEach(res => emitDetectionEvent(res));
          }
        }
      } catch (err) {
        console.warn('Failed to process uploaded image:', err);
      }
    };

    return () => {
      isMounted = false;
    };
  }, [uploadedImage, enrolledProfiles, matchThreshold, emitDetectionEvent]);

  return {
    engine,
    setEngine,
    state,
    detections,
    matchThreshold,
    setMatchThreshold,
    showOverlay,
    setShowOverlay,
    showLandmarks,
    setShowLandmarks,
    modelError,
  };
}
