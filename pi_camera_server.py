from __future__ import annotations

import os
import time
from pathlib import Path
from threading import Lock

from flask import Flask, Response, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
FRAME_PATH = Path(
    os.environ.get(
        "CAMERA_FRAME_PATH",
        "/data/home/qnxuser/camera-stream/latest.jpg",
    )
)

STREAM_FPS = float(os.environ.get("CAMERA_STREAM_FPS", "10"))
FRAME_INTERVAL = 1.0 / max(STREAM_FPS, 1.0)

app = Flask(
    __name__,
    static_folder=str(BASE_DIR),
    static_url_path="",
)

frame_lock = Lock()


def read_jpeg_frame() -> bytes | None:
    """
    Read one complete JPEG frame.

    The native QNX camera process should write to a temporary file and then
    rename it to FRAME_PATH so Flask never reads a partially written image.
    """
    try:
        with frame_lock:
            frame = FRAME_PATH.read_bytes()
    except (FileNotFoundError, PermissionError, OSError):
        return None

    # Validate the standard JPEG start/end markers.
    if (
        len(frame) < 4
        or not frame.startswith(b"\xff\xd8")
        or not frame.endswith(b"\xff\xd9")
    ):
        return None

    return frame


def generate_frames():
    last_frame: bytes | None = None

    while True:
        frame = read_jpeg_frame()

        if frame is not None:
            last_frame = frame

        # Briefly reuse the last valid frame if the native producer is between
        # writes. This prevents the HTTP stream from terminating.
        if last_frame is not None:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: "
                + str(len(last_frame)).encode("ascii")
                + b"\r\n"
                b"Cache-Control: no-cache\r\n"
                b"\r\n"
                + last_frame
                + b"\r\n"
            )

        time.sleep(FRAME_INTERVAL)


@app.route("/")
def index():
    index_path = BASE_DIR / "index.html"

    if not index_path.is_file():
        return Response(
            "Camera server is running. Use /stream.mjpg for the MJPEG stream.\n",
            mimetype="text/plain",
        )

    return send_from_directory(str(BASE_DIR), "index.html")


@app.route("/health")
def health():
    frame = read_jpeg_frame()

    if frame is None:
        return {
            "status": "waiting_for_camera",
            "frame_path": str(FRAME_PATH),
        }, 503

    return {
        "status": "ok",
        "frame_path": str(FRAME_PATH),
        "frame_bytes": len(frame),
    }


@app.route("/snapshot.jpg")
def snapshot():
    frame = read_jpeg_frame()

    if frame is None:
        return Response(
            f"No valid JPEG frame found at {FRAME_PATH}\n",
            status=503,
            mimetype="text/plain",
        )

    return Response(
        frame,
        mimetype="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.route("/stream.mjpg")
def stream():
    if read_jpeg_frame() is None:
        return Response(
            "The web server is running, but no QNX camera frame is available.\n"
            f"Expected a JPEG at: {FRAME_PATH}\n"
            "Start the native QNX Camera API capture helper first.\n",
            status=503,
            mimetype="text/plain",
        )

    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@app.route("/<path:path>")
def static_files(path: str):
    return send_from_directory(str(BASE_DIR), path)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=8001,
        debug=False,
        threaded=True,
    )