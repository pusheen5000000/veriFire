#!/usr/bin/env python3
"""Read-only QNX HTTP endpoint for the VeriFire dashboard.

The endpoint selects the most recently updated JSONL recording, returns its
newest complete sensor record, and exposes the active lcd_label.py trigger for
that same recording.  It uses only Python's standard library so it can run on
the QNX Pi without installing packages.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any


def newest_record(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("rb") as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size - 16_384))
            lines = stream.read().decode("utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return None
    for line in reversed(lines):
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


def newest_log(directory: Path, fallback: Path) -> Path | None:
    candidates = list(directory.glob("*.jsonl")) if directory.exists() else []
    if fallback.exists():
        candidates.append(fallback)
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def active_trigger(log_path: Path) -> dict[str, Any]:
    inactive = {"active": False, "label": None, "mode": "none", "event_id": None}
    session_path = Path(f"{log_path}.lcd_session")
    label_path = Path(f"{log_path}.lcd_title")
    try:
        session_id = session_path.read_text(encoding="utf-8").strip()
        lines = label_path.read_text(encoding="utf-8").splitlines()
        label_session, label, mode = lines[:3]
    except (FileNotFoundError, ValueError):
        return inactive
    if not session_id or label_session != session_id or not label.strip():
        return inactive
    event_id = f"{session_id}:{label_path.stat().st_mtime_ns}"
    return {
        "active": True,
        "label": label.strip().upper()[:32],
        "mode": mode.strip().lower() or "none",
        "event_id": event_id,
    }


def build_handler(directory: Path, fallback: Path):
    class SensorHandler(BaseHTTPRequestHandler):
        def send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
            self.send_json(204, {})

        def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
            if self.path.rstrip("/") not in ("/api/status", "/health"):
                self.send_json(404, {"error": "not found"})
                return
            log_path = newest_log(directory, fallback)
            if log_path is None:
                self.send_json(503, {"error": "no sensor recording found"})
                return
            reading = newest_record(log_path)
            if reading is None:
                self.send_json(503, {"error": "recording contains no complete reading"})
                return
            self.send_json(
                200,
                {
                    "ok": True,
                    "log": str(log_path),
                    "reading": reading,
                    "trigger": active_trigger(log_path),
                },
            )

        def log_message(self, format: str, *args: object) -> None:
            print(f"{self.address_string()} - {format % args}")

    return SensorHandler


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the latest QNX VeriFire sensor reading")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--directory", type=Path, default=Path("combustion_readings"))
    parser.add_argument("--fallback", type=Path, default=Path("sensor_readings.jsonl"))
    args = parser.parse_args()
    server = HTTPServer((args.host, args.port), build_handler(args.directory, args.fallback))
    print(f"VeriFire sensor API listening on http://{args.host}:{args.port}/api/status")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
