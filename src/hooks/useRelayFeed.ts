import { RefObject, useEffect, useState } from 'react';

// Acknowledge only after decoding. The relay sends the latest frame rather than
// queueing older frames behind a slow phone/network.
export function useRelayFeed(base: string, camera: string, image: RefObject<HTMLImageElement>) {
  const [feed, setFeed] = useState({ status: 'Connecting to relay…', src: '' });
  useEffect(() => {
    if (!base) return;
    let stopped = false, socket: WebSocket, retry: ReturnType<typeof setTimeout>, blobUrl = '', lastFrame = Date.now(), sequence = 0, displayed = 0;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(`${base.replace(/^http/, 'ws')}/live?camera=${camera}`);
      socket.binaryType = 'blob';
      socket.onopen = () => { lastFrame = Date.now(); setFeed(current => ({ ...current, status: 'Waiting for camera…' })); };
      socket.onmessage = async event => {
        const active = socket;
        const frameNumber = ++sequence;
        const next = URL.createObjectURL(event.data);
        const frame = new Image(); frame.src = next;
        try {
          await frame.decode();
          if (stopped || socket !== active || frameNumber < displayed) return;
          displayed = frameNumber;
          // Store the decoded frame in React state. This avoids React clearing a
          // ref-written src on the next status render and keeps slow clients on
          // only the newest frame.
          setFeed({ status: 'Live relay', src: next });
          URL.revokeObjectURL(blobUrl); blobUrl = next; lastFrame = Date.now();
        } catch { setFeed(current => ({ ...current, status: 'Frame unavailable' })); }
        finally { if (blobUrl !== next) URL.revokeObjectURL(next); if (active.readyState === WebSocket.OPEN) active.send('ready'); }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => { if (!stopped) { setFeed(current => ({ ...current, status: 'Relay reconnecting…' })); retry = setTimeout(connect, 1500); } };
    };
    connect();
    const watchdog = setInterval(() => { if (Date.now() - lastFrame > 5000) setFeed(current => ({ ...current, status: 'Waiting for fresh camera frames…' })); }, 2000);
    return () => { stopped = true; clearTimeout(retry); clearInterval(watchdog); socket?.close(); URL.revokeObjectURL(blobUrl); };
  }, [base, camera, image]);
  return feed;
}
