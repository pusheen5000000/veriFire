# Role 1 — Hardware & Sensors (QNX)

**You own:** MQ-2, humiture, ESP32, LCD, buzzers, relay, the QNX node, power.
**You unblock everyone.** Two deliverables outrank everything else:
- **T+0:10 — MQ-2 powered for burn-in** (2 wires, no software, no OS)
- **T+0:30 — `sensor_service.py --fake` pushed** (fake JSON so Roles 3 & 4 start)

---

## ⚠ Read first: QNX is not Linux

No `apt`. No `raspi-config`. No `i2cdetect`. No `smbus2`. No `gpiozero`. No `pip install` of compiled packages.

**What you get instead:** the QNX image for Raspberry Pi ships with **Python 3 preloaded**, and a QNX-native GPIO module with a deliberately RPi.GPIO-like API.

```python
import rpi_gpio as GPIO
```

**System basics:**
| Thing | QNX |
|---|---|
| Default user / host | `qnxuser@qnxpi` |
| Home dir | `/data/home/qnxuser` |
| Become root | `su root` |
| Copy code over | `scp myprogram.py qnxuser@qnxpi:python/` |
| Run remotely | `ssh -t qnxuser@qnxpi python3 python/myprogram.py` (**the `-t` matters** — without it the program keeps running after SSH exits) |
| Check a driver is running | `pidin -p "rpi_gpio" ar` |

**Architecture — we run two Pis (see the team note):** your **QNX node** is the safety-critical core (sensors, inference, alarm). Role 2's **Linux node** runs the OAK-1. That split is not a compromise; it's how real safety systems are built, and it's a strong story for the QNX judges.

---

## MINUTE ZERO — before any OS

1. **MQ-2 → 5V and GND.** Any USB supply or powered rail. No Pi, no code, no ADC.
2. Burn-in now runs in the background for hours. Cold MQ-2 data is garbage; 20–30 min minimum, longer is better.
3. Tell Role 3 the clock started.

## T+0:30 — ship the fake feed

`sensor_service.py --fake` emitting at 2 Hz to stdout + a `.jsonl` log:

```json
{"timestamp": 1721304000.1, "mq2_raw": 412, "mq2_baseline": 180, "mq2_delta": 232,
 "mq2_slope": 14.2, "temp_c": 24.8, "temp_slope": 0.9, "humidity_pct": 71.2,
 "humidity_slope": 12.4, "frame_id": 8842}
```

Made-up curves are fine. Roles 3 and 4 build against this all day.

## ⚠ Also hour one — the QNX prize hard requirement

The QNX track requires the product to **include one of the open-source AI modules from oss.qnx.com**. Check the **qnx-ports Open-Source Dashboard** (github.com/qnx-ports) for what's actually ported and passing tests — likely an ONNX/TFLite-class runtime. **Pick one and tell Role 3 immediately**, because it constrains how they ship the model. This is a pass/fail requirement, not a nice-to-have.

---

## QNX node setup

The loaner Pi 5s come **pre-loaded with QNX** — use those rather than building an image. If you must flash, it's the QNX quick-start image for Raspberry Pi (not Raspberry Pi Imager).

Verify the drivers you need are running:
```bash
su root
pidin -p "rpi_gpio" ar
pidin -p "i2c" ar
```
If a resource manager isn't running, start it before anything else works.

## GPIO / PWM on QNX

```python
import rpi_gpio as GPIO
GPIO.setmode(GPIO.BCM)              # or GPIO.BOARD
GPIO.setup(27, GPIO.OUT)
GPIO.output(27, GPIO.HIGH)
value = GPIO.input(4)
GPIO.cleanup()                      # closes the resource manager fd
```

⚠ **PWM channel constraint — this changes pin choice.** GPIO **12 and 18** share PWM channel 1; GPIO **13 and 19** share channel 2. Two pins on the same channel are forced to the same period and duty cycle.
→ **Passive buzzer must be on 12, 13, 18 or 19.** Use **GPIO 13**.

## MQ-2 → PCF8591 (Pi has no analog input; mandatory)

**Wiring:** PCF8591 VCC→5V(pin2), GND→GND(pin6), SDA→GPIO2(pin3), SCL→GPIO3(pin5). MQ-2 VCC→5V, GND→GND, **A0**→PCF8591 AIN0.

The QNX image exposes the running `i2c-dwc-rpi5` driver as **`/dev/i2c1`**.
`rpi_gpio` provides GPIO/PWM but no I2C API; use QNX's native `isendrecv`
utility (which performs `DCMD_I2C_SENDRECV`) instead. There is no `smbus2` or
`i2cdetect`. The transaction is:

```python
# isendrecv -a 0x48 -n /dev/i2c1 -l 2 0x40
# Write control byte 0x40 (select AIN0), then receive two bytes.
# DISCARD the first byte — PCF8591 returns the PREVIOUS conversion.
```

⚠ **The discarded read is mandatory.** Skip it and every value is one cycle stale — silent bug.
⚠ Pinned at 0 or 255 → you're on D0. Use **A0**.
⚠ No `i2cdetect` on QNX: write a 3-line address-scan script instead, or trust the datasheet address (0x48).

## Humiture sensor

**Identify it first:**
- Pins say **SDA/SCL** → I2C part (AHT10/20, SHT30/31). Same bus as the ADC, read from QNX directly.
- Single **DATA** pin → DHT11/DHT22. **Use the ESP32.** Bit-banged microsecond timing from Python on an RTOS is a bad idea, and you have a microcontroller sitting right there.

**ESP32 → QNX link: use UART pins, not USB.**
USB CDC device support on QNX is an unknown you don't want to discover at 2am. Wire the ESP32 directly to the Pi's UART instead.

- ESP32 TX → Pi **GPIO15 (RXD)**, ESP32 RX → Pi **GPIO14 (TXD)**, **common ground**.
- ⚠ **ESP32 is 3.3V — this is fine for the Pi. Never feed 5V logic into Pi GPIO.**
- Start the QNX serial driver (address and IRQ are Pi 5 specific):
  ```bash
  devc-serpl011-rpi5 -b115200 -v -c50000000 -e -F -u1 0x1f00030000,185
  ```
- ⚠ The port appears as **`/dev/ser1`** (not `/dev/ttyUSB0`; `-u0` isn't supported).
- ESP32 sketch prints one JSON line per reading at 115200:
  ```cpp
  Serial.printf("{\"temp_c\":%.1f,\"humidity_pct\":%.1f}\n", t, h);
  ```
- Poll no faster than ~2 Hz or DHT returns NaNs.
- Read `/dev/ser1` from Python and merge into the Reading.

## Baselines & slopes

- **Rolling baseline** = median of last ~60s clear, for gas *and* humidity. Absolute MQ-2 values are meaningless (drift with temp/humidity/age). Delta is the signal.
- **Slopes** = change per second over a short window. Humidity slope is the team's headline discriminator.
- Light smoothing (5-sample mean), but keep raw in the JSON for Role 3.

## LCD — two paths

**Check the back for a 4-pin daughterboard (GND/VCC/SDA/SCL) = PCF8574 I2C backpack.**

**Path 1 — has backpack:** wire GND/5V/SDA(GPIO2)/SCL(GPIO3). Address usually **0x27** or **0x3F**. `RPLCD` won't be available — write ~40 lines driving the PCF8574 over the QNX I2C API directly (set nibble, pulse enable). It's a well-documented chip and this is a contained job.

**Path 2 — no backpack (4-bit parallel):** all through `rpi_gpio` outputs.
VSS→GND, VDD→5V, RS→GPIO25, RW→GND, E→GPIO24, D4→GPIO23, D5→GPIO17, D6→GPIO18, D7→GPIO22, A→5V, K→GND, **V0→10k pot wiper**.
⚠ GPIO18 is a PWM pin — fine as a plain output here, just don't also assign it to the buzzer.

⚠ Blank or all-blocks on either path? **Contrast.** Turn the pot.
⚠ **Hard timebox: 90 minutes.** Then drop it and tell Role 4. The LCD is a nice-to-have; on QNX it's a nice-to-have with no library.

## Buzzers & relay

```python
import rpi_gpio as GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setup(27, GPIO.OUT)   # active buzzer — fixed tone
GPIO.setup(13, GPIO.OUT)   # passive buzzer — PWM channel 2
GPIO.setup(26, GPIO.OUT)   # relay
```

- **Passive buzzer on GPIO 13** via the `rpi_gpio` PWM API — different tones for different states. Soft low = ELEVATED, urgent high = HAZARD. This earns the "sophisticated human-computer interaction" wording in the Design criterion.
- **Relay → small fan** from the fan kits: "hazard → activates extraction." Visible physical actuation. **Low voltage only, never mains.**

Expose one function for Role 4:
```python
set_alarm_state("clear" | "elevated" | "benign" | "hazard")
```

## Hardening

- Tape-label every wire. **Photograph the wiring from 2 angles** — rebuilds in 3 min instead of 40.
- Glue/tape breadboard, sensors, ESP32 to a rigid base so the rig moves intact.
- Test on the actual demo power setup.

## Gotchas

- MQ-2 runs **hot** (heater). Mount **a few cm from the humiture sensor** or it biases temperature.
- MQ-2 also fires on alcohol, LPG, propane — hand sanitizer spikes it. Good story, but know it.
- DHT returns occasional NaN/checksum failures. **Guard against nulls** — one bad read must not kill the service.
- No `vcgencmd` on QNX. If behaviour is erratic, suspect power anyway — use the 27W supply and check for brownouts on the sensor rail.
- Pi 5 **debug serial port is not exposed on the GPIO header** — don't confuse it with UART0.

## Your timeline

| When | Deliverable |
|---|---|
| T+0:10 | MQ-2 burning in |
| T+0:30 | `--fake` service pushed |
| T+1:00 | QNX node reachable over SSH; `rpi_gpio` import works; **OSS AI module identified** |
| T+2:00 | MQ-2 reading real values |
| T+3:00 | Humiture reading over `/dev/ser1` → **tell Role 3 immediately** |
| T+4:00 | LCD decided; buzzers + relay responding to `set_alarm_state` |
| Halfway | Support Role 4's integration pass |
