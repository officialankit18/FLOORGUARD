# Hardware integration — verify the flashed variant first

The web application is updated locally. No board was flashed and no physical door command was sent during verification.

## Door semantics

There are two old UNO sketches. The servo version drives A4 to 90 degrees on `DOOR:ON`; the other uses ON as sensor arming. They are not interchangeable. In Settings choose **ON opens the door** or **OFF opens the door** only after checking your actual controller. Auto opening defaults to disabled. The app logs a requested opening separately from a reported signal; no limit switch exists to prove the physical door position.

## Camera verified floor alarm

`uno_floorguard_v2/uno_floorguard_v2.ino` is for the **servo** wiring: piezo A0, buzzer A1, servo A4, serial 9600. It now emits `floor_candidate` without energizing the buzzer. The laptop backend captures Cam 2, runs the person detector, then sends `start_alarm` only for a detected person. For an object or unavailable camera/model, the buzzer remains off and an informational phone event is sent. The detector cannot prove what physically pressed the mat; it only checks whether a person is visible in the camera image. Keep the full mat approach area in frame. Test with people and common objects under actual lighting before relying on this behavior.

The laptop backend and local camera relay must stay running. Set `FLOOR_CAMERA_CAPTURE_URL=http://127.0.0.1:3012/camera/laptop/capture` (default), or `FLOOR_CAMERA_IP` when a separate floor camera has a `/capture` endpoint. Preload requires internet once to download the quantized YOLOS model into the local model cache. Set `FLOOR_REMOTE_API_URL=https://floorguard.onrender.com` in the laptop backend `.env` if the deployed application should receive these events and issue phone push notifications. Keep this unset in the Render service. The Render backend does not try to reach a private laptop IP. A cold or sleeping Render instance can still delay phone push delivery.

The sketch has not been compiled or flashed here. Verify wiring and servo angles first. Disconnect the ESP from UNO D0/D1 during upload; use the existing 5V-to-3.3V level shifter. Until the new sketch and ESP bridge translation are flashed, the old sketch can still sound the buzzer immediately, before ML classification.

Your ESP-01 MQTT bridge also needs these command translations in its existing JSON command callback (retain its current Wi-Fi/TLS/broker configuration):

```cpp
// json is your already-parsed ArduinoJson document.
const char* type = json["type"] | "";
const char* requestId = json["requestId"] | "";
// Accept only UUID-style IDs, never arbitrary serial text.
bool validId = strlen(requestId) <= 48;
for (const char* p = requestId; *p; ++p)
  if (!isalnum(*p) && *p != '-') validId = false;
if (!validId) return;
if (strcmp(type, "set_door") == 0 && json["on"].is<bool>()) {
  Serial.print(json["on"].as<bool>() ? "DOOR:ON:" : "DOOR:OFF:");
  Serial.println(requestId);
} else if (strcmp(type, "stop_alarm") == 0) {
  Serial.print("ALARM:STOP:"); Serial.println(requestId);
} else if (strcmp(type, "start_alarm") == 0) {
  Serial.print("ALARM:START:"); Serial.println(requestId);
} else if (strcmp(type, "reject_floor_candidate") == 0) {
  Serial.println("FLOOR:REJECT");
}
```

Continue forwarding UNO JSON lines unchanged to `<prefix>/event`; subscribe to `<prefix>/command`. Preserve `requestId` in the event. Increase serial receive buffers to at least 192 characters if the old bridge uses a smaller line buffer. Keep commands non-retained. Do not print Wi-Fi/broker credentials.

Expected commands:

```json
{"type":"set_door","on":true,"requestId":"uuid"}
{"type":"stop_alarm","requestId":"uuid"}
{"type":"start_alarm","requestId":"uuid"}
{"type":"reject_floor_candidate"}
```

Expected acknowledgements (only after UNO changes the output):

```json
{"type":"door_state","on":true,"requestId":"uuid"}
{"type":"buzzer_state","on":false,"requestId":"uuid"}
```

The old firmware cannot stop the hardware buzzer remotely. Until this integration is flashed, Stop alarm silences the phone and sends a request, but does not claim the hardware stopped.

The ESP bridge must keep forwarding the UNO's `{"type":"floor_candidate"}` event to `<prefix>/event` and must translate the new commands above from `<prefix>/command`. A compatible sketch is provided in `esp01_floor_bridge/`. Copy `secrets.example.h` to an ignored `secrets.h`, fill in the existing Wi-Fi, broker and CA certificate values from your current bridge, then flash it alongside the updated UNO sketch. The old DoorGuard project files are unchanged. Without this bridge update, the candidate will be classified but the hardware buzzer cannot be started or reset by the decision.

## Acceptance checks on actual hardware

1. Confirm the open/close signal with the door unobstructed.
2. Enable automatic opening; approach with a registered face and check one arrival + one request + controller confirmation.
3. Approach as an unverified visitor: photo and silent notice, no buzzer. Verify Open door and Mark attended independently.
4. Trigger the floor mat: persistent buzzer, app alarm, floor photo. Stop alarm and confirm both outputs stop.
5. Repeat on a second phone, disconnect/reconnect Wi-Fi, and test a new physical arrival after leaving the camera view.
6. Verify emergency calling launches the phone dialer. The application never calls automatically.
