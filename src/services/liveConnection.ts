type MessageListener = (message: { type: string; data?: any }) => void;
const listeners = new Set<MessageListener>();
const statusListeners = new Set<() => void>();
let socket: WebSocket | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let started = false;
let lastMessageAt = 0;
export const subscribeLive = (listener: MessageListener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const subscribeConnection = (listener: () => void) => {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
};
export const getConnectionStatus = () => connected;
function setConnected(value: boolean) {
  connected = value;
  statusListeners.forEach(listener => listener());
}
function connect() {
  if (!started || socket || !navigator.onLine) return;
  const url = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => { reconnectAttempt = 0; lastMessageAt = Date.now(); setConnected(true); };
  socket.onmessage = event => {
    lastMessageAt = Date.now();
    try {
      const message = JSON.parse(event.data);
      listeners.forEach(listener => listener(message));
    } catch { /* Ignore malformed messages. */ }
  };
  socket.onerror = () => socket?.close();
  socket.onclose = () => {
    socket = null;
    setConnected(false);
    if (started) reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** reconnectAttempt++, 30_000));
  };
}
// The app owns one connection, independent of which route is mounted.
export function startLiveConnection() {
  if (started) return;
  started = true;
  const resume = () => {
    if (document.visibilityState === 'hidden') return;
    clearTimeout(reconnectTimer);
    if (socket && Date.now() - lastMessageAt > 45_000) { socket.close(); return; }
    connect();
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      if (Date.now() - lastMessageAt > 60_000) socket.close();
      else socket.send(JSON.stringify({ type: 'PING' }));
    }
  }, 25_000);
  connect();
}
