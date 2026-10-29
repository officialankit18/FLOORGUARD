import React, { useCallback, useEffect, useRef, useState } from 'react';

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [leaving, setLeaving] = useState(false);
  const finish = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    // A missing video or blocked playback must never trap the app behind the splash.
    const fallback = window.setTimeout(finish, 8000);
    return () => window.clearTimeout(fallback);
  }, [finish]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onComplete, 220);
    return () => window.clearTimeout(timer);
  }, [leaving, onComplete]);

  return <div className={`fg-video-splash ${leaving ? 'is-leaving' : ''}`} role="status" aria-label="Opening FLOORGUARD">
    <video ref={video} src="/splash-intro-3s-v1.mp4" autoPlay muted playsInline preload="auto"
      disablePictureInPicture onEnded={finish} onError={finish}
      onCanPlayThrough={() => { if (!leaving && video.current?.paused) void video.current.play().catch(finish); }}
      aria-hidden="true" />
    <button type="button" onClick={finish} className="fg-splash-skip">Skip</button>
  </div>;
};
