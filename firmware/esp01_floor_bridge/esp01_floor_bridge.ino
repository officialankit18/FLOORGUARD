#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "secrets.h"

WiFiClientSecure secureClient;
BearSSL::X509List brokerCa(MQTT_CA_CERT);
PubSubClient mqtt(secureClient);
String commandTopic = String(TOPIC_PREFIX) + "/command";
String eventTopic = String(TOPIC_PREFIX) + "/event";

bool validRequestId(const char* id) {
  if (!id || strlen(id) > 48) return false;
  for (const char* p = id; *p; ++p)
    if (!isalnum(*p) && *p != '-') return false;
  return true;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (String(topic) != commandTopic || length > 255) return;
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, length)) return;
  const char* type = doc["type"] | "";
  const char* requestId = doc["requestId"] | "";
  if (!validRequestId(requestId)) return;
  if (strcmp(type, "set_door") == 0 && doc["on"].is<bool>()) {
    Serial.print(doc["on"].as<bool>() ? F("DOOR:ON:") : F("DOOR:OFF:")); Serial.println(requestId);
  } else if (strcmp(type, "stop_alarm") == 0) {
    Serial.print(F("ALARM:STOP:")); Serial.println(requestId);
  } else if (strcmp(type, "start_alarm") == 0 && *requestId) {
    Serial.print(F("ALARM:START:")); Serial.println(requestId);
  } else if (strcmp(type, "reject_floor_candidate") == 0) {
    Serial.println(F("FLOOR:REJECT"));
  }
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(250);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  unsigned long started = millis();
  while (time(nullptr) < 1700000000 && millis() - started < 20000) delay(250);
}
void connectMqtt() {
  while (!mqtt.connected()) {
    String clientId = "floorguard-" + String(ESP.getChipId(), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      mqtt.subscribe(commandTopic.c_str(), 1);
      Serial.println(F("STATUS"));
    } else delay(3000);
  }
}
void setup() {
  Serial.begin(9600);
  secureClient.setTrustAnchors(&brokerCa);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(384);
  connectWifi();
}
void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  static String line;
  while (Serial.available()) {
    const char ch = Serial.read();
    if (ch == '\n') {
      line.trim();
      if (line.startsWith("{\"type\":") && line.length() <= 240) mqtt.publish(eventTopic.c_str(), line.c_str(), false);
      line = "";
    } else if (ch != '\r' && line.length() < 240) line += ch;
    else if (line.length() >= 240) line = "";
  }
}
