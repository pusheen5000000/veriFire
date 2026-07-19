#!/usr/bin/env python3
"""Non-destructive QNX hardware readiness check for VeriFire."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys


def report(command: list[str]) -> None:
    try:
        result = subprocess.run(command, text=True, capture_output=True, check=False)
    except OSError as exc:
        print(f"{' '.join(command)}: {exc}")
        return
    print(f"$ {' '.join(command)}")
    print((result.stdout or result.stderr).strip() or f"exit {result.returncode}")


def main() -> int:
    print(f"Python: {sys.version.split()[0]}")
    try:
        import rpi_gpio as GPIO
    except ImportError as exc:
        print(f"FAIL: cannot import rpi_gpio: {exc}")
        return 2
    print("OK: rpi_gpio imported")
    print("rpi_gpio I2C symbols:", ", ".join(name for name in dir(GPIO) if "i2c" in name.lower()) or "none")
    print("QNX isendrecv utility:", shutil.which("isendrecv") or "missing")
    print("rpi_gpio PWM available:", hasattr(GPIO, "PWM"))
    print("UART /dev/ser1:", "present" if os.path.exists("/dev/ser1") else "missing")
    report(["pidin", "-p", "rpi_gpio", "ar"])
    report(["pidin", "-p", "i2c", "ar"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
