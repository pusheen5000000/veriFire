#!/usr/bin/env python3
"""Set the alternating context label used by lcd_status.py for one recording."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Set the LCD context label for a VeriFire JSONL recording")
    parser.add_argument("log", type=Path, help="the same JSONL path passed to lcd_status.py")
    parser.add_argument("label", nargs="?", help="text to alternate with LIVE SENSORS")
    parser.add_argument(
        "--alert",
        choices=("none", "flammable", "combustion"),
        default="none",
        help="buzzer behavior: passive on LIVE SENSORS, plus active on COMBUSTION SMOKE for combustion",
    )
    parser.add_argument("--clear", action="store_true", help="remove the label for this recording")
    args = parser.parse_args()
    label_path = Path(f"{args.log}.lcd_title")

    if args.clear:
        try:
            label_path.unlink()
        except FileNotFoundError:
            pass
        print(f"LCD label cleared for {args.log}.")
        return 0
    if not args.label:
        parser.error("provide a label or use --clear")
    session_path = Path(f"{args.log}.lcd_session")
    try:
        session_id = session_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        parser.error("start lcd_status.py for this recording before setting its label")
    if not session_id:
        parser.error("the LCD session identifier is empty; restart lcd_status.py")
    label_path.write_text(f"{session_id}\n{args.label.strip()[:16]}\n{args.alert}\n", encoding="utf-8")
    print(f"LCD will alternate LIVE SENSORS and {args.label.strip()[:16].upper()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
