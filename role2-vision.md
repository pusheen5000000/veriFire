# Role 2 — Vision (OAK-1)

**You own:** the Luxonis OAK-1 — camera + Myriad X accelerator in one USB-C device.
**You are never blocked.** The OAK-1 is fully independent of the gas/humiture hardware. Plug into any Pi (or a laptop) and start immediately.

⚠ **First: confirm it's an OAK-1, not the Raspberry Pi AI Kit (Hailo).** Different products, different toolchains. Black USB-C camera module = OAK-1, this doc applies. M.2 HAT that bolts onto the Pi's PCIe = Hailo, ask for the other instructions.

**Priority note:** with the humiture sensor in play, vision is the *third* modality, not essential. Timebox hard. If this becomes a sinkhole, the project ships on gas + humiture.

---

## Phase A — Alive (first hour)

1. OAK-1 → **USB 3 port** (blue) on the Pi with a **USB-C data cable**.
   ⚠ **Charge-only cables are the #1 setup failure.** Silent non-detection. Use a known data cable.
2. Install:
   ```bash
   python3 -m pip install depthai depthai-sdk --break-system-packages
   sudo wget -qO- https://docs.luxonis.com/install_dependencies.sh | bash
   sudo reboot
   ```
   ⚠ That script installs **udev rules**. Without them the device won't enumerate → cryptic "no device found".
3. Prove it:
   ```bash
   python3 -c "import depthai; print(depthai.Device.getAllAvailableDevices())"
   ```
4. Run a stock DepthAI example (RGB preview, then stock MobileNet detection). **Do not proceed until you've seen it infer on its own feed.**
5. Frames into Python:
   ```python
   import depthai as dai
   pipeline = dai.Pipeline()
   cam = pipeline.create(dai.node.ColorCamera)
   cam.setPreviewSize(640, 480); cam.setInterleaved(False)
   xout = pipeline.create(dai.node.XLinkOut); xout.setStreamName("rgb")
   cam.preview.link(xout.input)
   with dai.Device(pipeline) as device:
       q = device.getOutputQueue("rgb")
       frame = q.get().getCvFrame()
   ```
6. Ship a frame-grabber writing timestamped frames + `frame_id` so Role 3 can align vision with sensor data.

## Phase B — Power (do early, it causes fake bugs)

The OAK-1 draws real current over USB3. Undersupply presents as **mid-pipeline disconnects, `X_LINK_ERROR`, or the device vanishing after ~30s** — all look like software bugs.

- Fix: **powered USB hub** between Pi and OAK-1, or the OAK's own power input if your unit has one.
- Check the Pi isn't browning out: `vcgencmd get_throttled`.
- It gets **warm** under sustained inference. Use the aluminium case if you have it; keep airflow.

## Phase C — Model decision (**call it by mid-Saturday**)

Custom networks need conversion to **MyriadX blob** (train → ONNX → OpenVINO IR → `.blob`). `blobconverter` calls a **cloud compile service by default** — that's *build time only*. Compile ahead, ship the `.blob`, runtime is fully offline.

> Say it precisely to judges: *compilation done in advance; inference needs no network.*

**Pick one:**
- **Path A (recommended)** — pre-trained DepthAI model-zoo model as a feature extractor; Role 3's light classifier does the smoke/steam call on top.
- **Path B (custom blob)** — only if someone's touched OpenVINO before. High payoff, rabbit hole otherwise.
- **Path C (fallback, fine)** — OAK-1 as a **smart camera**: pull frames + hardware CV outputs, run a small classifier on the Pi 5 CPU at 5–10 fps. Preserves the on-device claim entirely.

## Phase D — Features (your OAK-1 advantage — do this before training anything)

The Myriad X has hardware-accelerated CV blocks. **Optical flow is your single best smoke-vs-steam discriminator and you get it free:**

- **Optical flow / motion estimation** — steam rises fast in a narrow plume and dissipates; smoke billows, spreads laterally, persists.
- **Feature tracking** — how long tracked features persist in the plume region; smoke holds structure longer.
- Cheap software features alongside: greyness/saturation drop, edge-density reduction (smoke blurs edges), frame-to-frame change rate, region growth rate.

These hand-crafted features are robust, need no training, and may outperform a rushed neural net on a small dataset. **Build them first, treat the model as a bonus.**

## Phase E — Deliver

Ship `vision_service.py` emitting per frame:
```json
{"frame_id": 8842, "timestamp": 1721304000.1, "features": {...}, "model_output": {...}}
```

- `--fake` mode (so Role 4 isn't blocked)
- `--replay <dir>` mode over saved frames — **essential for the demo**

⚠ **Replay design decision, make it before Role 3 collects:** either run feature extraction on saved images outside the OAK pipeline, or **record the OAK's feature outputs alongside frames during collection** so replay has them. Tell Role 3 which.

Benchmark and record fps + where inference runs. *"30 fps, inference on the camera's own VPU, host CPU at 8%, WiFi off"* is a very strong answer to the judges' inevitable question.

## Gotchas

- Charge-only USB-C cable → silent failure. #1 killer.
- Missing udev rules → won't enumerate.
- **Lighting is the #1 demo killer.** Test under venue lighting; bring a clip-on light.
- **Lock exposure and white balance manually** in the ColorCamera node — auto-exposure "corrects" when smoke fills the frame and washes out your signal.
- **Lock focus** for close-range demo so it doesn't hunt while a plume crosses frame (autofocus is 8cm–∞).
- Rolling shutter — fine for smoke, bad for fast motion.
- Never stream frames over the network "just for now" — hides latency, undercuts the offline story.
- Keep camera position **fixed** between training and demo.

## Your timeline

| When | Deliverable |
|---|---|
| T+1:00 | OAK-1 enumerating, stock model running |
| T+1:30 | Power/thermal sorted; frame-grabber shipped |
| T+2:00 | `--fake` vision service pushed |
| T+3:00 | Hardware optical-flow features extracting |
| T+4:00 | **Path A/B/C decision made** — tell the team |
| Halfway | Real feature stream into Role 4's integration pass |
| −8h | Replay mode working |

## Fallbacks

1. **Blob conversion fails** → Path C (smart camera + Pi CPU classifier).
2. **OAK-1 dead/unstable** → **Camera Module 3** on the Pi CSI port with `picamera2`. ⚠ Pi 5 needs the **narrow FPC cable** — check it physically fits *before* you need it.
3. **Vision entirely broken** → fold into Role 3. Project ships on gas + humiture and is still complete.
