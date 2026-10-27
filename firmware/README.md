# Hardware integration — verify the flashed variant first

The web application is updated locally. No board was flashed and no physical door command was sent during verification.

## Door semantics

There are two old UNO sketches. The servo version drives A4 to 90 degrees on `DOOR:ON`; the other uses ON as sensor arming. They are not interchangeable. In Settings choose **ON opens the door** or **OFF opens the door** only after checking your actual controller. Auto opening defaults to disabled. The app logs a requested opening separately from a reported signal; no limit switch exists to prove the physical door position.

## Persistent alarm support

`uno_floorguard_v2/uno_floorguard_v2.ino` is an optional replacement for the existing **servo** sketch: piezo A0, buzzer A1, servo A4, serial 9600. It latches the buzzer until stopped, acknowledges commands and sends heartbeat states. This sketch has not been compiled/flashed here because Arduino CLI and the connected board toolchain were unavailable. Verify wiring and servo angles first. Disconnect the ESP from UNO D0/D1 during upload; use the existing 5V-to-3.3V level shifter.

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
}
```

Continue forwarding UNO JSON lines unchanged to `<prefix>/event`; subscribe to `<prefix>/command`. Preserve `requestId` in the event. Increase serial receive buffers to at least 192 characters if the old bridge uses a smaller line buffer. Keep commands non-retained. Do not print Wi-Fi/broker credentials.

Expected commands:

```json
{"type":"set_door","on":true,"requestId":"uuid"}
{"type":"stop_alarm","requestId":"uuid"}
```

Expected acknowledgements (only after UNO changes the output):

```json
{"type":"door_state","on":true,"requestId":"uuid"}
{"type":"buzzer_state","on":false,"requestId":"uuid"}
```

The old firmware cannot stop the hardware buzzer remotely. Until this integration is flashed, Stop alarm silences the phone and sends a request, but does not claim the hardware stopped.

## Acceptance checks on actual hardware

1. Confirm the open/close signal with the door unobstructed.
2. Enable automatic opening; approach with a registered face and check one arrival + one request + controller confirmation.
3. Approach as an unverified visitor: photo and silent notice, no buzzer. Verify Open door and Mark attended independently.
4. Trigger the floor mat: persistent buzzer, app alarm, floor photo. Stop alarm and confirm both outputs stop.
5. Repeat on a second phone, disconnect/reconnect Wi-Fi, and test a new physical arrival after leaving the camera view.
6. Verify emergency calling launches the phone dialer. The application never calls automatically.
