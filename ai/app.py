from __future__ import annotations

import base64
import io
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from PIL import Image
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = Path(__file__).resolve().parent / "models" / "best_nano_111.pt"

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Missing trained model: {MODEL_PATH}\n"
        "Run ai\\download_model.ps1 from PowerShell first."
    )

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
model = YOLO(str(MODEL_PATH))


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "model": MODEL_PATH.name})


@app.post("/api/predict")
def predict():
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image", "")
    if not image_data:
        return jsonify({"error": "Missing image"}), 400

    try:
        encoded = image_data.split(",", 1)[-1]
        image_bytes = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        frame = np.asarray(image)
    except Exception as exc:
        return jsonify({"error": f"Invalid image: {exc}"}), 400

    result = model.predict(frame, conf=0.35, iou=0.1, verbose=False)[0]
    scores = {"fire": 0.0, "smoke": 0.0}
    detections = []

    if result.boxes is not None:
        for box in result.boxes:
            class_id = int(box.cls.item())
            confidence = float(box.conf.item())
            label = str(model.names[class_id]).strip().lower()
            if label in scores:
                scores[label] = max(scores[label], confidence)
            xyxy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
            detections.append({"label": label, "confidence": confidence, "box": xyxy})

    fire = round(scores["fire"] * 100)
    smoke = round(scores["smoke"] * 100)
    normal = max(0, 100 - max(fire, smoke))

    # Steam is supplied later by sensor-fusion logic; this vision model only detects fire/smoke.
    classification = {
        "fire": fire,
        "smoke": smoke,
        "steam": 0,
        "normal": normal,
    }

    return jsonify({"classification": classification, "detections": detections})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
