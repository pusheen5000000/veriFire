# Role 1 — Hardware & Sensors

**You own:** MQ-2, humiture sensor, ESP32, LCD, buzzers, relay, Pi flashing, power.
**You unblock everyone.** Two deliverables matter more than anything else you do:
- **T+0:10 — MQ-2 powered for burn-in** (2 wires, no software)
- **T+0:30 — `sensor_service.py --fake` pushed** (fake JSON so Roles 3 & 4 can start)

Real sensor values can come later. Those two unblock the whole team.

---

## MINUTE ZERO — do this before anything else

1. **MQ-2 → 5V and GND. That's it.** Any USB supply, powered breadboard rail, or Pi 5V pin. No ADC, no code, no Pi needed.
2. Burn-in now runs in the background for hours while you do everything else. Sensor is drifty and useless cold; 20–30 min is the minimum, longer is better.
3. Tell Role 3 the clock started.

## T+0:30 — ship the fake feed (before real hardware works)

Push `sensor_service.py` with a `--fake` flag emitting this at 2 Hz to stdout + a `.jsonl` log:

```json
{"timestamp": 1721304000.1, "mq2_raw": 412, "mq2_baseline": 180, "mq2_delta": 232,
 "mq2_slope": 14.2, "temp_c": 24.8, "temp_slope": 0.9, "humidity_pct": 71.2,
 "humidity_slope": 12.4, "frame_id": 8842}
```

Make up plausible curves. Roles 3 and 4 build against this all day.

---

## Pi setup

You have 3 Pi 5s. **Flash two.** One = integration Pi (yours + Role 4). One = **Role 3's collection rig — hand it over as soon as the MQ-2 reads.**

```bash
# Imager: 64-bit Bookworm+, preconfigure SSH/WiFi/user (no monitor needed)
vcgencmd get_throttled          # must be 0x0
sudo apt update && sudo apt full-upgrade -y
sudo raspi-config               # Interface: I2C on; Serial hardware on, login shell off
sudo apt install -y i2c-tools python3-smbus2 python3-gpiozero python3-serial git
```

## MQ-2 → PCF8591 (Pi has no analog input; this chip is mandatory)

**Wiring:** PCF8591 VCC→5V(pin2), GND→GND(pin6), SDA→GPIO2(pin3), SCL→GPIO3(pin5). MQ-2 VCC→5V, GND→GND, **A0**→PCF8591 AIN0.

```bash
i2cdetect -y 1     # expect 0x48
```

```python
from smbus2 import SMBus
with SMBus(1) as bus:
    bus.write_byte(0x48, 0x40)   # select AIN0
    bus.read_byte(0x48)          # DISCARD — chip returns PREVIOUS conversion
    val = bus.read_byte(0x48)
```

⚠ **The discarded read is mandatory.** Skip it and every value is one cycle stale — silent bug.

⚠ Pinned at 0 or 255 → you're on D0. Use **A0**.

**Alternative:** ESP32's built-in ADC (GPIO34/35) can read the MQ-2 instead if the PCF8591 fights you.

## Humiture sensor

**First identify it:**
- Pins say **SDA/SCL** → I2C part (AHT10/20, SHT30/31). Wire to same I2C bus as the ADC, `i2cdetect`, read from Pi directly. Easy.
- Single **DATA** pin → DHT11/DHT22. **Use the ESP32, not the Pi** — bit-banged timing is unreliable on Pi 5 and the old libraries don't support it.

**DHT via ESP32** (Arduino IDE, ESP32 board pkg + DHT library):
- DHT VCC→3V3, GND→GND, DATA→GPIO4, 10k pull-up DATA↔VCC (often already on the module).
- Sketch prints one JSON line per reading at 115200 baud:
  ```cpp
  Serial.printf("{\"temp_c\":%.1f,\"humidity_pct\":%.1f}\n", t, h);
  ```
- Poll no faster than ~2 Hz or you get NaNs.
- Pi reads `/dev/ttyUSB0` or `/dev/ttyACM0` with `pyserial`, parses, merges into the Reading.

## Baselines & slopes

- **Rolling baseline** = median of last ~60s of clear conditions, for gas *and* humidity. Absolute MQ-2 values are meaningless (drift with temp/humidity/age). Delta is the signal.
- **Slopes** = change per second over a short window. Humidity slope is the team's headline discriminator — get it right.
- Light smoothing (5-sample rolling mean), but keep raw in the JSON for Role 3.

## LCD — two paths

**Check the back for a 4-pin daughterboard (GND/VCC/SDA/SCL) = PCF8574 I2C backpack.**

**Path 1 — has backpack (~20 min):** wire GND/5V/SDA(GPIO2)/SCL(GPIO3), `i2cdetect` → usually **0x27** or 0x3F.
```python
from RPLCD.i2c import CharLCD
lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
```
⚠ Blank or all-blocks? **Turn the blue pot on the backpack.** That's contrast, and it's almost always the answer.

**Path 2 — no backpack (4-bit parallel, 60–90 min):**
VSS→GND, VDD→5V, RS→GPIO25, RW→GND, E→GPIO24, D4→GPIO23, D5→GPIO17, D6→GPIO18, D7→GPIO22, A→5V, K→GND, **V0→10k pot wiper** (pot legs to 5V/GND). No pot? Try ~1k fixed to GND.
```python
from RPLCD.gpio import CharLCD
lcd = CharLCD(pin_rs=25, pin_rw=None, pin_e=24, pins_data=[23,17,18,22], cols=16, rows=2)
```
⚠ **Hard timebox: 90 min. Then drop it and tell Role 4 to use HDMI.** The LCD is a nice-to-have.

## Buzzers & relay

⚠ **`RPi.GPIO` does NOT work on Pi 5.** Use `gpiozero` (lgpio backend). Every pre-2024 tutorial will hand you broken code.

```python
from gpiozero import Buzzer, TonalBuzzer, OutputDevice
from gpiozero.tones import Tone

active = Buzzer(27)                    # fixed tone — hazard alert
passive = TonalBuzzer(13)              # PWM — plays different tones
passive.play(Tone("A4"))               # elevated (soft)
passive.play(Tone("A6"))               # hazard (urgent)
relay = OutputDevice(26, initial_value=False)
```

- **Passive buzzer = graded escalation.** This is what earns the "sophisticated human-computer interaction" wording in the Design criterion.
- **Relay = switch a small fan** from the fan kits: "hazard → activates extraction." Visible physical actuation. **Low voltage only, never mains.**

Expose one function for Role 4:
```python
set_alarm_state("clear" | "elevated" | "benign" | "hazard")
```

## Hardening (do before you're tired)

- Tape-label every wire. **Photograph the working wiring from 2 angles** — rebuilds in 3 min instead of 40.
- Tape/glue breadboard, sensors and ESP32 to a rigid base so the rig moves to the demo table intact.
- Test on the actual demo power setup.

## Gotchas

- MQ-2 runs **hot** (heater). Mount it **a few cm from the humiture sensor** or it biases the temperature reading.
- MQ-2 also responds to alcohol, LPG, propane — hand sanitizer will spike it. Good story, but know it's happening.
- DHT returns occasional NaN/checksum failures. **Guard against nulls** — one bad read must not crash the service.
- Pi 5 undervoltage looks exactly like random software crashes. Check `vcgencmd get_throttled` first.

## Your timeline

| When | Deliverable |
|---|---|
| T+0:10 | MQ-2 burning in |
| T+0:30 | `--fake` service pushed |
| T+1:30 | Second Pi flashed → handed to Role 3 |
| T+2:00 | MQ-2 reading real values |
| T+3:00 | Humiture reading real values → **tell Role 3 immediately** |
| T+4:00 | LCD decided; buzzers + relay responding to `set_alarm_state` |
| Halfway | Support Role 4's integration pass |
