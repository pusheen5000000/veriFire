# VeriFIRE

VeriFIRE dashboard connected to a pretrained YOLO11 fire/smoke detector.

## Run on Windows

Open PowerShell in this folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start.ps1
```

Then open:

```text
http://127.0.0.1:5000
```

Allow camera access in the browser.

## Model outputs

- Fire: pretrained YOLO detection
- Smoke: pretrained YOLO detection
- Normal: no fire/smoke detection
- Steam: reserved for humidity-sensor fusion; the vision model does not detect steam

The model is a prototype aid and must never suppress or replace a certified smoke alarm.

Model source: https://github.com/sayedgamal99/Real-Time-Smoke-Fire-Detection-YOLO11
