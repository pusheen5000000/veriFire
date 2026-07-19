#!/usr/bin/env python3
"""Emit VeriFire sensor readings.

``--fake`` works immediately on QNX.  ``--pcf8591`` reads MQ-2 from PCF8591
AIN0 through the QNX ``rpi_gpio`` I2C binding, and ``--serial-port`` merges
ESP32 UART JSON such as
``{"temp_c":24.8,"humidity_pct":71.2}``.  Every mode keeps the same
production contract: one JSON object per line on stdout and in a JSONL log at
2 Hz.  Stdout is deliberately reserved for data so it can be piped directly
into collection and UI processes.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import select
import signal
import subprocess
import sys
import time
from pathlib import Path
from statistics import median
from typing import Iterator


RATE_HZ = 2.0
PERIOD_SECONDS = 1.0 / RATE_HZ
BASELINE_WINDOW_SAMPLES = int(60 * RATE_HZ)
SLOPE_WINDOW_SAMPLES = 5


def clamp(value: float, low: float, high: float) -> float:
    """Keep simulated sensor readings within credible hardware ranges."""
    return max(low, min(high, value))


def fake_readings(start_time: float) -> Iterator[dict[str, float | int]]:
    """Yield a repeating clear -> steam -> smoke -> clear demo scenario.

    The 150-second loop gives consumers both sides of the project's key
    discriminator: steam has rapidly rising humidity with nearly flat gas;
    smoke has a rising gas signal and temperature with stable humidity.
    """
    frame_id = 0
    previous_mq2 = 180.0
    previous_temp = 24.2
    previous_humidity = 47.0

    while True:
        elapsed = time.time() - start_time
        phase = elapsed % 150.0

        # Small, smooth ambient movement makes clear conditions non-static.
        mq2 = 180.0 + 4.0 * math.sin(elapsed / 7.0)
        temp = 24.2 + 0.25 * math.sin(elapsed / 19.0)
        humidity = 47.0 + 0.8 * math.sin(elapsed / 13.0)

        if 35.0 <= phase < 70.0:  # steam: humidity rises while gas stays flat
            progress = (phase - 35.0) / 35.0
            humidity += 23.0 * progress
            temp += 0.8 * progress
        elif 70.0 <= phase < 95.0:  # steam dissipating
            progress = (phase - 70.0) / 25.0
            humidity += 23.0 * (1.0 - progress)
            temp += 0.8 * (1.0 - progress)
        elif 105.0 <= phase < 130.0:  # smoke: gas and temperature rise
            progress = (phase - 105.0) / 25.0
            mq2 += 175.0 * progress
            temp += 6.2 * progress
            humidity -= 2.0 * progress
        elif 130.0 <= phase < 150.0:  # smoke clearing
            progress = (phase - 130.0) / 20.0
            mq2 += 175.0 * (1.0 - progress)
            temp += 6.2 * (1.0 - progress)
            humidity -= 2.0 * (1.0 - progress)

        timestamp = time.time()
        mq2 = clamp(mq2, 0.0, 255.0)
        temp = clamp(temp, -20.0, 80.0)
        humidity = clamp(humidity, 0.0, 100.0)
        reading: dict[str, float | int] = {
            "timestamp": round(timestamp, 3),
            "mq2_raw": round(mq2),
            "mq2_baseline": 180,
            "mq2_delta": round(mq2 - 180.0, 1),
            "mq2_slope": round((mq2 - previous_mq2) * RATE_HZ, 2),
            "temp_c": round(temp, 1),
            "temp_slope": round((temp - previous_temp) * RATE_HZ, 2),
            "humidity_pct": round(humidity, 1),
            "humidity_slope": round((humidity - previous_humidity) * RATE_HZ, 2),
            "frame_id": frame_id,
        }
        yield reading
        previous_mq2, previous_temp, previous_humidity = mq2, temp, humidity
        frame_id += 1


class RollingReading:
    """Build contract records while calculating baseline and per-second slope."""

    def __init__(self) -> None:
        self.mq2_history: list[float] = []
        self.mq2_slope_history: list[float] = []
        self.temp_slope_history: list[float] = []
        self.humidity_slope_history: list[float] = []
        self.frame_id = 0

    @staticmethod
    def _window_slope(history: list[float], value: float) -> float:
        """Return a per-second slope over up to five 2 Hz samples.

        DHT11 values are quantized to whole percentages.  Using only the most
        recent 0.5-second step turns a normal 1% change into a misleading
        ±2%/s spike, while this short window preserves real sustained change.
        """
        history.append(value)
        if len(history) > SLOPE_WINDOW_SAMPLES:
            history.pop(0)
        if len(history) < 2:
            return 0.0
        return (history[-1] - history[0]) / ((len(history) - 1) * PERIOD_SECONDS)

    def build(self, mq2_raw: float, temp_c: float, humidity_pct: float) -> dict[str, float | int]:
        self.mq2_history.append(mq2_raw)
        if len(self.mq2_history) > BASELINE_WINDOW_SAMPLES:
            self.mq2_history.pop(0)
        baseline = median(self.mq2_history)
        mq2_slope = self._window_slope(self.mq2_slope_history, mq2_raw)
        temp_slope = self._window_slope(self.temp_slope_history, temp_c)
        humidity_slope = self._window_slope(self.humidity_slope_history, humidity_pct)
        reading: dict[str, float | int] = {
            "timestamp": round(time.time(), 3),
            "mq2_raw": round(mq2_raw),
            "mq2_baseline": round(baseline, 1),
            "mq2_delta": round(mq2_raw - baseline, 1),
            "mq2_slope": round(mq2_slope, 2),
            "temp_c": round(temp_c, 1),
            "temp_slope": round(temp_slope, 2),
            "humidity_pct": round(humidity_pct, 1),
            "humidity_slope": round(humidity_slope, 2),
            "frame_id": self.frame_id,
        }
        self.frame_id += 1
        return reading


def read_pcf8591(bus_number: int, address: int, channel: int) -> float:
    """Read PCF8591 AINx through QNX's native ``isendrecv`` I2C utility.

    QNX does not support Linux-style I2C read/write calls.  ``isendrecv``
    performs the correct QNX DCMD_I2C_SENDRECV transaction: it writes the
    PCF8591 control byte, then receives two bytes.  The first is stale by chip
    design, so only the second is returned.
    """
    command = [
        "isendrecv", "-a", hex(address), "-n", f"/dev/i2c{bus_number}",
        "-l", "2", hex(0x40 | channel),
    ]
    try:
        result = subprocess.run(command, text=True, capture_output=True, check=False)
    except OSError as exc:
        raise RuntimeError(
            "QNX I2C utility is unavailable. Confirm /system/bin/isendrecv exists."
        ) from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"PCF8591 read failed ({detail or result.returncode}).")

    # QNX 8 prints: 'Data recvd: 80h 0h'.  The second value is the new ADC conversion.
    tokens = result.stdout.replace("Data recvd:", "").replace("data:", "").split()
    received = [token for token in tokens if token.lower().endswith("h")]
    if len(received) < 2:
        raise RuntimeError(f"Unexpected isendrecv output: {result.stdout.strip()!r}")
    try:
        return float(int(received[-1][:-1], 16))
    except ValueError as exc:
        raise RuntimeError(f"Cannot parse PCF8591 response: {result.stdout.strip()!r}") from exc


class QnxSerial:
    """Minimal non-blocking reader for QNX's /dev/ser1; no pyserial needed."""

    def __init__(self, port: str) -> None:
        try:
            self.fd = os.open(port, os.O_RDONLY | os.O_NONBLOCK)
        except OSError as exc:
            raise RuntimeError(
                f"Cannot open {port}. Start devc-serpl011-rpi5 first; QNX UART is /dev/ser1."
            ) from exc
        self.buffer = b""

    def lines(self) -> list[str]:
        ready, _, _ = select.select([self.fd], [], [], 0)
        if not ready:
            return []
        try:
            self.buffer += os.read(self.fd, 4096)
        except BlockingIOError:
            return []
        complete, _, self.buffer = self.buffer.rpartition(b"\n")
        return [line.decode("utf-8", errors="replace").strip() for line in complete.splitlines()]

    def close(self) -> None:
        os.close(self.fd)


def open_serial(port: str, _baudrate: int) -> QnxSerial:
    return QnxSerial(port)


def drain_humiture(serial_connection, last_temp: float, last_humidity: float) -> tuple[float, float]:
    """Use the newest valid ESP32 line; retain the last values on bad reads."""
    for raw_line in serial_connection.lines():
        try:
            payload = json.loads(raw_line)
            temp = float(payload["temp_c"])
            humidity = float(payload["humidity_pct"])
            if math.isfinite(temp) and math.isfinite(humidity):
                last_temp, last_humidity = temp, humidity
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            print(f"Ignoring malformed ESP32 reading: {raw_line!r}", file=sys.stderr)
    return last_temp, last_humidity


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VeriFire sensor data service")
    parser.add_argument("--fake", action="store_true", help="emit simulated readings")
    parser.add_argument("--pcf8591", action="store_true", help="read MQ-2 via PCF8591")
    parser.add_argument("--i2c-bus", type=int, default=1, help="QNX rpi_gpio I2C bus (default: 1)")
    parser.add_argument("--pcf8591-address", type=lambda value: int(value, 0), default=0x48)
    parser.add_argument("--pcf8591-channel", type=int, choices=range(4), default=0)
    parser.add_argument("--serial-port", default="/dev/ser1", help="ESP32 UART (default: /dev/ser1)")
    parser.add_argument("--serial-baud", type=int, default=115200)
    parser.add_argument(
        "--log", type=Path, default=Path("sensor_readings.jsonl"),
        help="JSONL output path (default: sensor_readings.jsonl)",
    )
    parser.add_argument(
        "--duration", type=float, default=None, metavar="SECONDS",
        help="optional run limit; useful for tests and recorded demos",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.fake == args.pcf8591:
        print("Select exactly one MQ-2 source: --fake or --pcf8591.", file=sys.stderr)
        return 2
    if args.duration is not None and args.duration <= 0:
        print("--duration must be positive.", file=sys.stderr)
        return 2

    stop_requested = False

    def request_stop(_signum: int, _frame: object) -> None:
        nonlocal stop_requested
        stop_requested = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    args.log.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    next_tick = started
    serial_connection = None
    last_temp, last_humidity = 24.2, 47.0
    if args.pcf8591:
        try:
            serial_connection = open_serial(args.serial_port, args.serial_baud)
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            return 2

    with args.log.open("a", encoding="utf-8") as log_file:
        fake_source = fake_readings(time.time()) if args.fake else None
        builder = RollingReading()
        while True:
            if stop_requested or (args.duration is not None and time.monotonic() - started >= args.duration):
                break
            try:
                if fake_source is not None:
                    reading = next(fake_source)
                else:
                    assert serial_connection is not None
                    last_temp, last_humidity = drain_humiture(serial_connection, last_temp, last_humidity)
                    mq2_raw = read_pcf8591(args.i2c_bus, args.pcf8591_address, args.pcf8591_channel)
                    reading = builder.build(mq2_raw, last_temp, last_humidity)
            except RuntimeError as exc:
                print(exc, file=sys.stderr)
                return 2
            line = json.dumps(reading, separators=(",", ":"))
            print(line, flush=True)
            log_file.write(line + "\n")
            log_file.flush()

            next_tick += PERIOD_SECONDS
            time.sleep(max(0.0, next_tick - time.monotonic()))
    if serial_connection is not None:
        serial_connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
