// VeriFire ESP32 humiture sender. Install "DHT sensor library" by Adafruit.
// Wiring: DHT VCC -> 3V3, GND -> GND, DATA -> GPIO4 (with a 10k pull-up).
// QNX UART: ESP32 GPIO17 (TX2) -> Pi GPIO15 (RXD), and common ground.
// ESP32 GPIO16 (RX2) <- Pi GPIO14 (TXD) is optional for this one-way feed.

#include <DHT.h>

constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t DHT_TYPE = DHT11;  // Change to DHT11 if that is your sensor.
constexpr unsigned long SAMPLE_INTERVAL_MS = 2000;
constexpr uint8_t PI_UART_RX_PIN = 16;
constexpr uint8_t PI_UART_TX_PIN = 17;

DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial piUart(2);
unsigned long lastSample = 0;

void setup() {
  // USB serial is for the Arduino Serial Monitor; UART2 is the physical
  // 3.3V link to the QNX Pi.  Do not rely on USB CDC for the Pi connection.
  Serial.begin(115200);
  piUart.begin(115200, SERIAL_8N1, PI_UART_RX_PIN, PI_UART_TX_PIN);
  dht.begin();
}

void loop() {
  if (millis() - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = millis();

  const float humidity = dht.readHumidity();
  const float tempC = dht.readTemperature();
  // Never emit NaN: the Pi service retains its last good reading on a bad sample.
  if (isnan(humidity) || isnan(tempC)) {
    Serial.println("{\"error\":\"dht_read_failed\"}");
    piUart.println("{\"error\":\"dht_read_failed\"}");
    return;
  }
  Serial.printf("{\"temp_c\":%.1f,\"humidity_pct\":%.1f}\n", tempC, humidity);
  piUart.printf("{\"temp_c\":%.1f,\"humidity_pct\":%.1f}\n", tempC, humidity);
}
