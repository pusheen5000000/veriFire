# VeriFire hardware scripts — QNX Pi 5

## Fake feed (start immediately)

```bash
python3 sensor_service.py --fake
```

This emits the agreed JSON schema to stdout at 2 Hz and appends the identical
records to `sensor_readings.jsonl`.  Send a different log location with
`--log data/session-01.jsonl`.

## QNX readiness

There is no `apt`, `pip`, `raspi-config`, `i2cdetect`, `smbus2`, or `gpiozero`
on the QNX node. Confirm the resource managers and native I2C client:

```bash
pidin -p rpi_gpio ar
pidin -p i2c ar
python3 qnx_preflight.py
```

## Live feed (QNX)

Upload the ESP32 sketch in `esp32_dht/esp32_dht.ino`; wire it to the Pi UART
pins and start QNX's serial driver. The sketch sends JSON over ESP32 UART2:
ESP32 GPIO17 (TX2) goes to Pi GPIO15 (RXD), with a common ground. Its USB
Serial Monitor output alone does not prove the Pi UART link works.

```bash
devc-serpl011-rpi5 -b115200 -v -c50000000 -e -F -u1 0x1f00030000,185
```

```bash
python3 sensor_service.py --pcf8591 --serial-port /dev/ser1
```

PCF8591 uses AIN0 by default. The service deliberately discards its first read
because that chip returns the previous conversion. It calculates a 60-second
rolling-median gas baseline and 2 Hz slopes. QNX's native `isendrecv` utility
performs the I2C transaction on `/dev/i2c1`; `rpi_gpio` is used for GPIO/PWM,
not I2C. Slopes use a five-sample window so DHT11's 1%-resolution readings do
not create artificial ±2%/s spikes.

## Alarm output (QNX Pi 5)

```bash
python3 alarm_controller.py hazard --hold 5
```

GPIO mapping: active buzzer 27, passive buzzer 13 (QNX PWM channel 2), relay
26. Keep the relay on low-voltage loads only. In application code, call
`AlarmController().set_alarm_state("clear" | "elevated" | "benign" | "hazard")`.

If the active buzzer sounds when GPIO 27 is LOW, it is an active-low module.
Use `--active-low` in the command-line test, or set
`VERIFIRE_ACTIVE_LOW=1` before calling the module-level `set_alarm_state`.

## LCD (optional)

The wired LCD backpack answered at I2C address `0x27`. Test the common
PCF8574/HD44780 16x2 mapping with:

```bash
python3 lcd_test.py
```

If the backlight comes on but characters are blank, adjust the small contrast
potentiometer on the backpack before changing code.

To show the live sensor status, start this in a second QNX terminal while
`sensor_service.py` is logging to `sensor_readings.jsonl`:

```bash
python3 lcd_status.py sensor_readings.jsonl
```

It displays `LIVE SENSORS` plus gas, humidity, and temperature. If a later
model app writes `state`/`class` and `reason` fields to the JSONL record, the
LCD automatically shows that verdict and its short explanation.

## Live dashboard

Start the read-only dashboard endpoint in another QNX terminal. Keep this
running while the website is open:

```bash
cd /data/home/qnxuser
python3 sensor_api.py --host 0.0.0.0 --port 8765
```

On the Windows laptop, serve the repository over HTTP from Git Bash:

```bash
cd /c/work/project/git-repo/veriFire
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`. The page polls the Pi once per second. It reads
the latest JSONL record and treats the session-matched `lcd_label.py` sidecar
as the third-command trigger, so the website and LCD show the same event.
