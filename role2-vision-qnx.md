# Role 2 — Vision (OAK-1, Linux node)

**You own:** the Luxonis OAK-1 **and the Linux node it runs on**, plus the bridge that feeds its verdict to the QNX node.
**You are never blocked.** Fully independent of the gas/humiture hardware — plug in and start.

---

## ⚠ Read first: why you're on Linux, not QNX

DepthAI (the OAK-1 SDK) ships prebuilt for Linux, macOS, Windows and Raspberry Pi OS. **There is no QNX build.** Same for `libcamera`/`picamera2` if you fall back to Camera Module 3. Porting either to an RTOS is not a weekend job.

**So we run two nodes:**

| Node | OS | Job |
|---|---|---|
| **QNX Pi** (Role 1) | QNX | Safety-critical core: sensors, fusion, alarm actuation |
| **Linux Pi** (you) | Raspberry Pi OS | Perception co-processor: OAK-1 vision → verdict over the wire |

**This is not a cop-out — say it proudly to judges.** Splitting a hard-real-time safety core from a general-purpose perception stack is exactly how automotive and medical systems are built. The QNX node is the thing that must never fail; vision is an advisory input it can lose without becoming unsafe. That's a genuinely good architecture answer and it directly serves the "cannot-fail embedded application" criterion.

⚠ **Confirm it's an OAK-1, not the Raspberry Pi AI Kit (Hailo).** Black USB-C camera module = OAK-1, this doc applies. M.2 HAT on the PCIe connector = Hailo, ask for other instructions.

**Priority note:** vision is the *third* modality. The project ships on gas + humiture if this sinks. Timebox hard.

---

## Phase A — Alive (first hour)

Flash a spare Pi (4 or 5) with **Raspberry Pi OS 64-bit** — this node is plain Linux.

1. OAK-1 → **USB 3 port** (blue) with a **USB-C data cable**.
   ⚠ **Charge-only cables are the #1 setup failure.** Silent non-detection.
2. ```bash
   python3 -m pip install depthai depthai-sdk --break-system-packages
   sudo wget -qO- https://docs.luxonis.com/install_dependencies.sh | bash
   sudo reboot
   ```
   ⚠ That script installs **udev rules**. Without them the device won't enumerate → cryptic "no device found".
3. ```bash
   python3 -c "import depthai; print(depthai.Device.getAllAvailableDevices())"
   ```
4. Run a stock DepthAI example. **Do not proceed until you've seen it infer on its own feed.**
5. Frames into Python:
   ```python
   import depthai as dai
   pipeline = dai.Pipeline()
   cam = pipeline.create(dai.node.ColorCamera)
   cam.setPreviewSize(640, 480); cam.setInterleaved(False)
   xout = pipeline.create(dai.node.XLinkOut); xout.setStreamName("rgb")
   cam.preview.link(xout.input)
   with dai.Device(pipeline) as device:
       frame = device.getOutputQueue("rgb").get().getCvFrame()
   ```

## Phase B — The bridge to QNX (**your unique job — build it early**)

The QNX node needs your verdict. Two options, pick by T+2:00:

**Option 1 — TCP over Ethernet (recommended).** Both Pis on the same switch/router. You push one JSON line per verdict to a socket the QNX node reads. Simple, debuggable, and QNX has a full POSIX networking stack.

**Option 2 — UART.** Your Pi's TX → QNX Pi's RX, common ground. More "embedded" looking, but Role 1 is already using `/dev/ser1` for the ESP32, so you'd need a second UART. **Prefer TCP.**

Send at ~2 Hz:
```json
{"frame_id": 8842, "timestamp": 1721304000.1,
 "vision_class": "benign", "vision_conf": 0.81,
 "features": {"flow_rise": 0.9, "opacity": 0.2, "persistence": 0.3}}
```

⚠ **Design for the link dropping.** The QNX node must degrade gracefully to gas+humiture if vision goes silent — and **demo that on purpose**: unplug the vision node mid-demo, show the device stays safe and says "vision unavailable, operating on gas+humiture." That is a *fantastic* "cannot-fail" moment for the QNX judges. Build it deliberately.

## Phase C — Power (do early, causes fake bugs)

OAK-1 draws real current over USB3. Undersupply shows as **mid-pipeline disconnects, `X_LINK_ERROR`, device vanishing after ~30s** — all look like software bugs.
- Fix: **powered USB hub**, or the OAK's own power input if present.
- It gets **warm**. Use the aluminium case if you have it; keep airflow.

## Phase D — Features (your OAK-1 advantage — before training anything)

The Myriad X has hardware-accelerated CV blocks. **Optical flow is your best smoke-vs-steam discriminator and it's free:**

- **Optical flow / motion estimation** — steam rises fast in a narrow plume and dissipates; smoke billows, spreads laterally, persists.
- **Feature tracking** — smoke holds trackable structure longer.
- Cheap software features alongside: greyness/saturation drop, edge-density reduction, frame-to-frame change rate, region growth.

These need no training, are robust on small data, and may beat a rushed neural net. **Build them first; treat any model as a bonus.**

## Phase E — Model decision (**call it by mid-Saturday**)

Custom networks need conversion to **MyriadX blob** (train → ONNX → OpenVINO IR → `.blob`). `blobconverter` calls a cloud service by default — **build time only**. Compile ahead, ship the blob, runtime is offline.

- **Path A (recommended)** — pre-trained DepthAI model-zoo model as feature extractor; Role 3's classifier decides on top.
- **Path B** — custom blob. Only if someone's used OpenVINO before.
- **Path C (fine)** — OAK-1 as a smart camera: frames + hardware CV features, small classifier on the Linux Pi's CPU.

## Deliverables

- `vision_service.py` with `--fake` and `--replay <dir>` modes (**replay is essential for the demo**)
- The TCP bridge, with graceful-degradation behaviour agreed with Role 4
- Benchmarked fps

⚠ **Replay design decision — settle before Role 3 bulk-collects:** either run feature extraction on saved images outside the OAK pipeline, or **record the OAK's feature outputs alongside frames during collection**. Tell Role 3 which.

## The judge answer you own

> *"Perception runs on a Linux co-processor. The safety core runs on QNX and never blocks on it — if vision drops, the device stays safe on gas and humidity. Here's me unplugging it."*

Rehearse that. Note your fps and where inference runs (on the camera's own VPU, host CPU near idle).

## Gotchas

- Charge-only USB-C cable → silent failure. #1 killer.
- Missing udev rules → won't enumerate.
- **Lighting is the #1 demo killer.** Test under venue lighting; bring a clip-on light.
- **Lock exposure and white balance manually** — auto-exposure "corrects" when smoke fills frame and washes out your signal.
- **Lock focus** for close range (autofocus is 8cm–∞) so it doesn't hunt while a plume crosses frame.
- Rolling shutter — fine for smoke.
- Keep camera position **fixed** between training and demo.

## Your timeline

| When | Deliverable |
|---|---|
| T+1:00 | Linux node flashed; OAK-1 enumerating; stock model running |
| T+2:00 | **Bridge decision made**; `--fake` verdict streaming to QNX node |
| T+3:00 | Hardware optical-flow features extracting |
| T+4:00 | Path A/B/C decision — tell the team |
| Halfway | Real verdicts into Role 4's integration pass |
| −8h | Replay working; **graceful-degradation unplug demo rehearsed** |

## Fallbacks

1. **Blob conversion fails** → Path C (smart camera + Linux Pi CPU classifier).
2. **OAK-1 dead** → **Camera Module 3 on the Linux Pi** with `picamera2`. ⚠ Pi 5 needs the **narrow FPC cable** — check it fits before you need it. (Do *not* try this on the QNX Pi; no libcamera.)
3. **Vision entirely broken** → fold into Role 3. Gas + humiture on QNX is still complete and novel, and the architecture story survives intact.

cd /data/home/qnxuser

silence the buzzer:
python3 -c "import rpi_gpio as GPIO; GPIO.setmode(GPIO.BCM); GPIO.setup(27, GPIO.OUT); GPIO.output(27, GPIO.HIGH)"

start sensor feed:
nohup python3 sensor_service.py --pcf8591 --serial-port /dev/ser1 --log sensor_readings.jsonl </dev/null >sensor_service.out 2>sensor_service.err &

start lcd display:
python3 lcd_status.py sensor_readings.jsonl --interval 3

---

python3 sensor_service.py --pcf8591 --serial-port /dev/ser10 --log combustion_readings/baseline_trial_01.jsonl
python3 lcd_status.py combustion_readings/baseline_trial_01.jsonl --interval 3

python3 sensor_service.py --pcf8591 --serial-port /dev/ser10 --log combustion_readings/rubbing_alcohol_trial_01.jsonl
python3 lcd_status.py combustion_readings/rubbing_alcohol_trial_01.jsonl --interval 3
python3 lcd_label.py combustion_readings/rubbing_alcohol_trial_01.jsonl "FLAMMABLE VAPOR" --alert flammable

python3 sensor_service.py --pcf8591 --serial-port /dev/ser10 --log combustion_readings/wood_trial_01.jsonl
python3 lcd_status.py combustion_readings/wood_trial_01.jsonl --interval 3
python3 lcd_label.py combustion_readings/wood_trial_01.jsonl "COMBUSTION SMOKE" --alert combustion

python3 sensor_service.py --pcf8591 --serial-port /dev/ser10 --log combustion_readings/mosquito_coil_trial_01.jsonl
python3 lcd_status.py combustion_readings/mosquito_coil_trial_01.jsonl --interval 3
python3 lcd_label.py combustion_readings/mosquito_coil_trial_01.jsonl "COMBUSTION SMOKE" --alert combustion

python3 sensor_service.py --pcf8591 --serial-port /dev/ser10 --log combustion_readings/water_vapor_trial_01.jsonl
python3 lcd_status.py combustion_readings/water_vapor_trial_01.jsonl --interval 3
python3 lcd_label.py combustion_readings/water_vapor_trial_01.jsonl "WATER VAPOR"