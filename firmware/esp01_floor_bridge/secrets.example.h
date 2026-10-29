#pragma once
// Copy to secrets.h in this folder, then fill in the same Wi-Fi/MQTT values
// used by the currently flashed ESP-01 bridge. Never commit secrets.h.
#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-wifi-password"
#define MQTT_HOST "your-mqtt-host"
#define MQTT_PORT 8883
#define MQTT_USERNAME "your-device-username"
#define MQTT_PASSWORD "your-device-password"
#define TOPIC_PREFIX "your/current/topic/prefix"
static const char MQTT_CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
PASTE_THE_CURRENT_MQTT_CA_CERTIFICATE_HERE
-----END CERTIFICATE-----
)EOF";
