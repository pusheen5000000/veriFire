# Role 4 — Interface, Demo & Integration (QNX)

**You own:** the readout, state machine, replay mode, backup video, demo script, two-node integration.
**You are never blocked.** Build the whole UI against Role 1's `--fake` feed from minute one.

---

## ⚠ Read first: where your UI actually runs

**Don't try to build a graphical dashboard on QNX.** QNX Screen is a different graphics stack from anything you know, and a weekend is not the time to learn it.

**Three-surface split:**

| Surface | Runs on | Shows |
|---|---|---|
| **LCD + buzzers + relay** | **QNX node** | The real-time alarm state. This is the *product*. |
| **Dashboard** | Linux node or a laptop | Live traces, camera feed, reason string — fed over TCP from QNX |
| **Console log** | QNX node | Plain-text state line, always works |

⚠ **The QNX node must never depend on the dashboard.** If the laptop dies, the device still detects and alarms. Say that to judges — it's the "cannot-fail" point made concrete. The dashboard is a *monitor*, not the product.

**Build the console line first.** A one-line stdout status on QNX is your guaranteed-working readout and takes ten minutes. Everything else is upside.

---

## The contracts (locked in 30 min — hold everyone to them)

```json
// Reading — from Role 1 on QNX, 2 Hz
{"timestamp": 1721304000.1, "mq2_raw": 412, "mq2_baseline": 180, "mq2_delta": 232,
 "mq2_slope": 14.2, "temp_c": 24.8, "temp_slope": 0.9, "humidity_pct": 71.2,
 "humidity_slope": 12.4, "frame_id": 8842}
```
```json
// Vision — from Role 2 over TCP, may go silent
{"frame_id": 8842, "vision_class": "benign", "vision_conf": 0.81, "features": {...}}
```
```json
// Verdict — from Role 3's pure-Python model on QNX
{"class": "clear"|"benign"|"hazard", "confidence": 0.87,
 "reason": "humidity spiked 18% with flat gas — consistent with steam",
 "contributions": {"gas": 0.1, "humiture": 0.7, "vision": 0.2}}
```

`/contracts/schema.json` in the repo, fixtures in `/fixtures/`.

## Phase A — Readouts

**QNX console line** (first, ten minutes):
```
[HAZARD 0.94] gas+232 hum-2 temp+3.1 | combustion signature: gas spike, humidity flat
```

**LCD** (Role 1 owns the driver, you own the content). Write it so **either LCD path is the same function call** — a last-minute switch costs nothing.
```
CLEAR  g:12 h:44
BENIGN steam?
HAZARD! 0.94
```

**Dashboard** (Linux/laptop, fed by TCP from QNX): live camera feed, state in colour, confidence, **the `reason` string**, scrolling gas + humidity + temperature traces.

> The reason string is the star. It turns *"it beeped"* into *"it understood."*

## Phase B — State machine (runs on QNX)

**CLEAR → ELEVATED → BENIGN-IDENTIFIED → HAZARD**

⚠ **Hysteresis + dwell times** — a verdict must hold for N consecutive windows before the state changes. Without this the display flickers and looks broken. **This single detail separates "polished" from "prototype."**

| State | Display | Sound | Relay |
|---|---|---|---|
| CLEAR | calm | silent | off |
| ELEVATED | "watching" | soft low tone (passive buzzer, GPIO13) | off |
| **BENIGN** | **states why it is NOT alarming** | **silent** | off |
| HAZARD | loud red | active buzzer + urgent high tone | fires the fan |

⚠ **Add a DEGRADED indicator.** When Role 2's vision link goes silent, the state machine keeps running on gas+humiture and the readout says so: `HAZARD 0.91 [vision offline]`. This is deliberate, it's rehearsed, and it's your strongest QNX-track moment.

Log every transition with a timestamp.

## Phase C — Replay mode (**do not skip — demo insurance**)

Feed **logged sensor traces + saved frames** through the *exact same pipeline* as live input. Same code path, different source.

Gives you the real-fire case with zero fire: the model genuinely classifies genuinely recorded fire data, live, on stage. **You're not faking anything — say exactly that.** The honesty plays well.

Keyboard trigger to launch a scenario on cue. Settle the OAK-feature question with Role 2 before Role 3 bulk-collects.

## Phase D — Two-node integration (**your hardest job — start early**)

More moving parts than a single-Pi build. Own it from T+2:00, not at the checkpoint.

- **Networking first.** Both Pis on the same switch, static IPs or known hostnames, ping working, TCP bridge passing fake JSON. Do this before either side has real data.
- **Deploy loop:** `scp` to `qnxuser@qnxpi:python/`, run with `ssh -t qnxuser@qnxpi python3 python/main.py`. ⚠ **The `-t` matters** — without it the process survives your SSH exit and you'll have zombie copies fighting over GPIO.
- **`run_demo.sh`** starts both nodes in the right order. At 3am nobody types six commands across two machines from memory.
- **Kill-and-restart** in one command, per node.
- ⚠ **QNX node boots and runs standalone.** If it needs the laptop to start, you've built the wrong thing.

## Phase E — The demo

**Record the backup video the moment end-to-end works** — not the night before.

**Order matters — lead with benign:**

1. **Steam.** Kettle near the sensor. ELEVATED → **BENIGN**, reason: *"humidity +18%, gas flat — steam."* **It does not alarm.** Let the silence sit. Money moment.
2. **Incense.** Within seconds: **HAZARD** — buzzer, relay fires the fan, reason: *"combustion signature: gas spike, humidity flat."*
3. **Unplug the vision node.** Device drops to DEGRADED, keeps working, still catches the incense. *"The safety core is on QNX and never depends on perception."*
4. *(Optional)* Replay the real-fire trace.

**Under two minutes. Rehearse 3× including failure branches.**

**Lead with the physics, not the ML:** *"Steam is water, fire is carbon — our sensor fusion sees the difference."* Then the architecture: *"and the part that must not fail runs on an RTOS."*

**Turn WiFi off on the QNX node and say so.**

## The four questions judges will ask

| Question | Answer |
|---|---|
| Is it a cannot-fail application? | Safety core on QNX, standalone, degrades gracefully — **watch me unplug the vision node.** |
| Does it need real-time / reliability? | Fire detection with a hard latency budget; RTOS scheduling, no GC pauses in the alarm path. |
| Running on embedded hardware, not cloud? | Entirely. WiFi off. Model is dependency-free Python on the Pi itself. |
| How much is the API doing? | Nothing. Our model, our data, collected this weekend. |

## Gotchas

- Don't build the UI last. A great model with an unreadable readout scores badly on Design.
- **One clear state, one clear reason** — not a wall of numbers.
- Rehearse on the actual demo table, actual lighting, actual power, **both nodes**.
- Bring a **network switch and Ethernet cables**. Venue WiFi is hostile and you're demoing with WiFi off anyway.

## Your timeline

| When | Deliverable |
|---|---|
| T+0:30 | Contracts locked |
| T+1:00 | **QNX console status line working** |
| T+2:00 | Two-node networking up, fake JSON crossing the bridge |
| T+3:00 | Dashboard running on fixtures |
| T+4:00 | State machine + hysteresis + DEGRADED path |
| Halfway | **Integration pass: real sensors → real verdict → LCD + buzzer + dashboard** |
| −8h | Replay working; **backup video recorded** |
| −4h | Rehearsed 3×; `run_demo.sh` works from cold boot on both nodes |
| −2h | Devpost written, repo clean, everyone knows their speaking part |

## Team fallback ladder (call fast)

1. Blob conversion fails → OAK-1 as smart camera + Linux CPU classifier.
2. Vision broken → **gas + humiture on QNX only. Still complete and novel** — and the DEGRADED path means this is a *supported mode*, not a failure.
3. MQ-2 dead → humiture + vision.
4. Humiture dead → gas + vision.
5. LCD nightmare → console line + dashboard.
6. Buzzer/relay fails → on-screen alarm. Cosmetic.
7. **Networking fails entirely** → run everything on the QNX node with gas+humiture, dashboard on the QNX console. Ugly but demoable.

**A working two-modality device beats a broken three-modality one on Completeness every time. Ship what works.**
