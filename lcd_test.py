#!/usr/bin/env python3
"""QNX test for a 16x2 HD44780 LCD with the common PCF8574 I2C backpack.

The verified backpack address defaults to 0x27.  It uses QNX's native isend
utility rather than Linux RPLCD/smbus packages.
"""

from __future__ import annotations

import argparse
import subprocess
import time


RS = 0x01
ENABLE = 0x04
BACKLIGHT = 0x08


class Lcd:
    """HD44780 4-bit driver for the common PCF8574 pin mapping."""

    def __init__(self, address: int, device: str) -> None:
        self.address = address
        self.device = device

    def _write_expander(self, value: int) -> None:
        command = ["isend", "-a", hex(self.address), "-n", self.device, hex(value & 0xFF)]
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "PCF8574 write failed")

    def _write_nibble(self, nibble: int, rs: bool) -> None:
        value = ((nibble & 0x0F) << 4) | BACKLIGHT | (RS if rs else 0)
        self._write_expander(value)
        self._write_expander(value | ENABLE)
        time.sleep(0.0005)
        self._write_expander(value)

    def command(self, value: int) -> None:
        self._write_nibble(value >> 4, False)
        self._write_nibble(value, False)
        if value in (0x01, 0x02):
            time.sleep(0.002)

    def data(self, value: int) -> None:
        self._write_nibble(value >> 4, True)
        self._write_nibble(value, True)

    def initialize(self) -> None:
        time.sleep(0.05)
        # Reset sequence, then change from 8-bit reset mode to 4-bit mode.
        self._write_nibble(0x03, False)
        time.sleep(0.005)
        self._write_nibble(0x03, False)
        time.sleep(0.005)
        self._write_nibble(0x03, False)
        self._write_nibble(0x02, False)
        self.command(0x28)  # 4-bit, 2 lines, 5x8 font
        self.command(0x0C)  # display on, cursor off
        self.command(0x06)  # move cursor right
        self.command(0x01)  # clear

    def write_line(self, row: int, text: str) -> None:
        self.command(0x80 if row == 0 else 0xC0)
        for character in text[:16].ljust(16):
            self.data(ord(character))


def main() -> int:
    parser = argparse.ArgumentParser(description="Test a QNX PCF8574 LCD backpack")
    parser.add_argument("--address", type=lambda value: int(value, 0), default=0x27)
    parser.add_argument("--device", default="/dev/i2c1")
    parser.add_argument("--line1", default="VeriFire QNX")
    parser.add_argument("--line2", default="LCD connected")
    args = parser.parse_args()

    lcd = Lcd(args.address, args.device)
    try:
        lcd.initialize()
        lcd.write_line(0, args.line1)
        lcd.write_line(1, args.line2)
    except RuntimeError as exc:
        print(f"LCD test failed: {exc}")
        return 2
    print(f"LCD updated at {args.device}, address {args.address:#04x}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
