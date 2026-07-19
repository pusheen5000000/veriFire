#!/usr/bin/env python3
"""Render the newest VeriFire JSONL reading on the optional QNX LCD.

Run this alongside sensor_service.py.  It intentionally refreshes at a low
rate because the QNX PCF8574 path uses the native isend utility; sensor input
must remain the higher-priority process.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from lcd_test import Lcd


def initialize_safe_outputs():
    """Keep the physical outputs in their safe power-on state while the LCD runs."""
    try:
        from alarm_controller import AlarmController

        return AlarmController(active_low=True)
    except (ImportError, RuntimeError) as exc:
        # The LCD remains usable for bench testing when GPIO is unavailable.
        print(f"Warning: could not initialize alarm outputs: {exc}")
        return None


def newest_record(path: Path) -> dict[str, Any] | None:
    """Return the final complete JSON object from an append-only JSONL log."""
    try:
        with path.open("rb") as log:
            log.seek(0, 2)
            size = log.tell()
            log.seek(max(0, size - 16_384))
            lines = log.read().decode("utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return None
    for line in reversed(lines):
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


def display_lines(reading: dict[str, Any], title: str = "LIVE SENSORS") -> tuple[str, str]:
    """Use a model verdict when available, otherwise show live sensor status."""
    state = str(reading.get("state") or reading.get("class") or title).upper()
    reason = reading.get("reason")
    if reason:
        return state[:16], str(reason)[:16]
    gas = reading.get("mq2_raw", "?")
    humidity = reading.get("humidity_pct", "?")
    temperature = reading.get("temp_c", "?")
    return state[:16], f"G{gas} H{humidity}% T{temperature}C"[:16]


def display_title(log_path: Path, refresh_number: int, session_id: str) -> tuple[str, str]:
    """Return the LCD heading and buzzer mode for the current three-second phase."""
    label_path = Path(f"{log_path}.lcd_title")
    try:
        label_session, label, alert = label_path.read_text(encoding="utf-8").splitlines()[:3]
        if label_session != session_id:
            label, alert = "", ""
        else:
            label, alert = label.strip().upper(), alert.strip().lower()
    except FileNotFoundError:
        label, alert = "", ""
    except ValueError:
        # A label from an earlier LCD run must not carry over to this one.
        label, alert = "", ""
    if label:
        if refresh_number % 2 == 0:
            return "LIVE SENSORS", "passive" if alert == "combustion" else "silent"
        if alert == "combustion":
            return label[:16], "active"
        if alert == "flammable":
            return label[:16], "passive"
        return label[:16], "silent"

    name = log_path.name.lower()
    normal_air_runs = (
        "baseline",
        "clear_air",
        "rubbing_alcohol",
        "wood",
        "mosquito_coil",
        "water_vapor",
    )
    if any(marker in name for marker in normal_air_runs):
        return ("LIVE SENSORS", "silent") if refresh_number % 2 == 0 else ("NORMAL AIR", "silent")
    return "LIVE SENSORS", "silent"


def main() -> int:
    parser = argparse.ArgumentParser(description="Show latest VeriFire reading on the QNX LCD")
    parser.add_argument("log", nargs="?", type=Path, default=Path("sensor_readings.jsonl"))
    parser.add_argument("--address", type=lambda value: int(value, 0), default=0x27)
    parser.add_argument("--interval", type=float, default=8.0, help="refresh period in seconds (default: 8)")
    args = parser.parse_args()
    if args.interval <= 0:
        parser.error("--interval must be positive")

    alarm = initialize_safe_outputs()
    lcd = Lcd(args.address, "/dev/i2c1")
    lcd.initialize()
    previous: tuple[str, str] | None = None
    refresh_number = 0
    session_path = Path(f"{args.log}.lcd_session")
    session_id = str(time.time_ns())
    session_path.write_text(session_id + "\n", encoding="utf-8")
    print(f"LCD status display watching {args.log}.")
    try:
        while True:
            reading = newest_record(args.log)
            if reading is None:
                lines = ("WAITING FOR DATA", "sensor_readings")
                buzzer_mode = "silent"
            else:
                title, buzzer_mode = display_title(args.log, refresh_number, session_id)
                lines = display_lines(reading, title)
            if alarm is not None:
                alarm.set_buzzer_mode(buzzer_mode)
            if lines != previous:
                lcd.write_line(0, lines[0])
                lcd.write_line(1, lines[1])
                previous = lines
            refresh_number += 1
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0
    finally:
        try:
            if session_path.read_text(encoding="utf-8").strip() == session_id:
                session_path.unlink()
        except FileNotFoundError:
            pass
        if alarm is not None:
            alarm.close()


if __name__ == "__main__":
    raise SystemExit(main())
