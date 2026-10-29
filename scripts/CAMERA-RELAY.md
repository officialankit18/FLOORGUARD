# Local Wi-Fi camera relay

This relay is local only. It shares the ESP32-CAM and the laptop webcam with devices connected to the same Wi-Fi network. It does not create an internet link, upload video, or expose door controls, member profiles, MQTT credentials, or history. Camera frames stay in memory and are not saved to disk.

## Start on the laptop

1. Keep the laptop and ESP32 on the same Wi-Fi network. Close other apps that may be using the laptop webcam or ESP32 stream.
2. Set the current ESP32 IP in `.env.relay` as `RELAY_ESP_IP`. Leave `RELAY_WEBCAM` as the laptop webcam name.
3. In the project folder, run `npm run relay` and keep its window open.
4. The relay prints an address such as `http://172.22.188.45:3012`. On any phone connected to the same Wi-Fi, open that address to view both cameras.
5. For the FLOORGUARD app, open `http://<laptop-ip>:5173/camera?relay=http%3A%2F%2F<laptop-ip>%3A3012`, or paste the relay address into Settings → Local Wi-Fi camera relay and save.

The laptop must stay powered on, awake, connected to Wi-Fi, and running the relay. A phone or another laptop on a different Wi-Fi/mobile-data connection cannot access this relay.

## Smooth playback

The relay opens one shared ESP32 stream and one shared laptop-webcam capture, rather than opening a new source stream for every phone. Frames are delivered by WebSocket and stale frames are dropped if a viewer is slow, keeping the feed close to live. The laptop camera targets 15 FPS at 640px width; ESP32 smoothness depends on its Wi-Fi signal and firmware settings.

If an ESP32 feed is offline, confirm its current IP, power, and Wi-Fi connection. Close direct ESP32 stream tabs/apps first: many ESP32 camera firmwares accept only one stream client.

Press Ctrl+C in the relay terminal to stop local sharing.
