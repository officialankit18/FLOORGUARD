#include <Servo.h>

// Optional replacement for the SERVO variant only. Verify wiring before upload.
constexpr byte PIEZO_PIN = A0, BUZZER_PIN = A1, SERVO_PIN = A4;
constexpr int PIEZO_THRESHOLD = 365;
Servo door;
bool doorOn = false, alarmActive = false, sensorHigh = false, floorPending = false;
unsigned long heartbeatAt = 0, stoppedAt = 0, candidateAt = 0;
char command[100];
byte used = 0;
bool overflow = false;

void state(const char* type, bool on, const char* requestId = nullptr) {
  Serial.print(F("{\"type\":\"")); Serial.print(type);
  Serial.print(F("\",\"on\":")); Serial.print(on ? F("true") : F("false"));
  if (requestId && *requestId) { Serial.print(F(",\"requestId\":\"")); Serial.print(requestId); Serial.print('"'); }
  Serial.println('}');
}

void handle(char* line) {
  if (strncmp(line, "DOOR:ON", 7) == 0 && (line[7] == 0 || line[7] == ':')) {
    doorOn = true; door.write(90); state("door_state", true, line[7] == ':' ? line + 8 : nullptr);
  } else if (strncmp(line, "DOOR:OFF", 8) == 0 && (line[8] == 0 || line[8] == ':')) {
    doorOn = false; door.write(0); state("door_state", false, line[8] == ':' ? line + 9 : nullptr);
  } else if (strncmp(line, "ALARM:STOP", 10) == 0 && (line[10] == 0 || line[10] == ':')) {
    alarmActive = false; floorPending = false; digitalWrite(BUZZER_PIN, LOW); stoppedAt = millis();
    state("buzzer_state", false, line[10] == ':' ? line + 11 : nullptr);
  } else if (strncmp(line, "ALARM:START:", 12) == 0 && strlen(line + 12) <= 48) {
    if (floorPending && millis() - candidateAt < 20000) {
      floorPending = false; alarmActive = true; digitalWrite(BUZZER_PIN, HIGH);
      state("buzzer_state", true, line + 12);
    }
  } else if (strcmp(line, "FLOOR:REJECT") == 0) {
    floorPending = false; stoppedAt = millis();
  } else if (strcmp(line, "STATUS") == 0) {
    state("door_state", doorOn); state("buzzer_state", alarmActive);
  }
}

void setup() {
  pinMode(PIEZO_PIN, INPUT); pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW);
  door.attach(SERVO_PIN); door.write(0); Serial.begin(9600);
}

void loop() {
  while (Serial.available()) {
    const char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (used && !overflow) { command[used] = 0; handle(command); }
      used = 0; overflow = false;
    } else if (used < sizeof(command) - 1 && !overflow) command[used++] = ch;
    else overflow = true;
  }
  const bool high = analogRead(PIEZO_PIN) >= PIEZO_THRESHOLD;
  if (high && !sensorHigh && !alarmActive && !floorPending && millis() - stoppedAt > 2000) {
    floorPending = true; candidateAt = millis();
    Serial.println(F("{\"type\":\"floor_candidate\"}"));
  }
  sensorHigh = high;
  if (floorPending && millis() - candidateAt >= 20000) { floorPending = false; stoppedAt = millis(); }
  // Alarm intentionally remains latched until ALARM:STOP.
  if (millis() - heartbeatAt > 10000) {
    heartbeatAt = millis(); state("door_state", doorOn); state("buzzer_state", alarmActive);
  }
}
