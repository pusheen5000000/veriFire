# Role 4 — Interface, Demo & Integration

**You own:** the readout, state machine, replay mode, backup video, demo script, final integration.
**You are never blocked.** You build the entire UI against Role 1's `--fake` feed from minute one. Real data just swaps in later.

---

## The two contracts (locked in the first 30 min — hold everyone to them)

```json
// Reading — from Role 1, 2 Hz
{"timestamp": 1721304000.1, "mq2_raw": 412, "mq2_baseline": 180, "mq2_delta": 232,
 "mq2_slope": 14.2, "temp_c": 24.8, "temp_slope": 0.9, "humidity_pct": 71.2,
 "humidity_slope": 12.4, "frame_id": 8842}
```
```json
// Verdict — from Role 3's model
{"class": "clear"|"benign"|"hazard", "confidence": 0.87,
 "reason": "humidity spiked 18% with flat gas — consistent with steam",
 "contributions": {"gas": 0.1, "humiture": 0.7, "vision": 0.2}}
```

Put them in `/contracts/schema.json`. Fixtures in `/fixtures/`.

## Phase A — UI on fixtures (first 2 hours)

**Primary display** (HDMI monitor off the Pi): live camera feed, current state in colour, confidence, the **`reason` string**, and scrolling gas + humidity + temperature traces.

> The reason string is the star. It turns *"it beeped"* into *"it understood."*

**Secondary — the 16×2 LCD:** compact status. Agree the API with Role 1 and write it so **either LCD path (I2C or parallel) is the same function call** — a last-minute switch then costs nothing.
```
CLEAR  g:12 h:44
BENIGN steam?
HAZARD! 0.94
```
⚠ If Role 1 drops the LCD (90-min timebox), have an on-screen widget mimicking it so your layout doesn't change.

## Phase B — State machine

**CLEAR → ELEVATED → BENIGN-IDENTIFIED → HAZARD**

⚠ **Add hysteresis + dwell times** — a verdict must hold for N consecutive windows before the state changes. Without this the display flickers and looks broken. **This single detail separates "polished" from "prototype."**

| State | Display | Sound | Relay |
|---|---|---|---|
| CLEAR | calm ambient | silent | off |
| ELEVATED | "watching" | soft low tone (passive buzzer) | off |
| **BENIGN** | **states why it is NOT alarming** | **silent** | off |
| HAZARD | loud red | active buzzer + urgent high tone | fires the fan |

BENIGN is the money state. Log every transition with a timestamp.

## Phase C — Replay mode (**do not skip — this is your demo insurance**)

Feed **logged sensor traces + saved frames** through the *exact same pipeline* as live input. Same code path, different source.

This gives you the real-fire case with zero fire: the model genuinely classifies genuinely recorded fire data, live, on stage. **You are not faking anything — say exactly that to judges.** The honesty plays well.

Add a keyboard trigger to launch a scenario on cue so you're never fumbling.

⚠ Check with Role 2 whether replay needs the OAK's feature outputs recorded alongside frames. Settle it before Role 3 bulk-collects.

## Phase D — Integration

- **Own the halfway-mark integration checkpoint.** All services end-to-end, however ugly. Contract violations will surface — fix them there, not Sunday morning.
- `run_demo.sh` — starts everything, right order, right flags. At 3am nobody types four commands from memory.
- One-command kill-and-restart if a service dies mid-demo.

## Phase E — The demo

**Record the backup video the moment end-to-end works** — not the night before. Full demo, both cases, narrated. If hardware misbehaves on stage you narrate over it and lose almost nothing.

**Order matters — lead with the benign case:**

1. **Steam.** Hold a kettle/mug near the sensor. ELEVATED → **BENIGN**, reason: *"humidity +18%, gas flat — steam."* **It does not alarm.** Let the silence sit. This is the money moment.
2. **Incense.** Within seconds: **HAZARD** — buzzer sounds, relay fires the fan, reason: *"combustion signature: gas spike with flat humidity."*
3. *(Optional)* Replay the real-fire trace.

**Under two minutes. Rehearse 3× including failure branches** ("if no response in 10s, I switch to replay").

**Lead the pitch with the physics, not the ML:** *"Steam is water, fire is carbon — our sensor fusion sees the difference, and here's the trace."* Far more memorable than "we trained a classifier."

**Turn WiFi off during the demo and say so.** Nothing sells "runs on the embedded hardware, not the cloud" like an airplane-mode device that keeps working.

## The three questions judges will ask

| Question | Answer |
|---|---|
| On-device or cloud? | All of it. Here's the fps — **and WiFi is off**. |
| How much is the API doing? | Nothing. Our model, our data, collected this weekend. |
| How accurate? | Confusion matrix + honest limitations (from Role 3). |

## Gotchas

- Don't build the UI last. A great model with an unreadable readout scores badly on Design.
- Don't make the display a wall of numbers. **One clear state, one clear reason.**
- Rehearse on the actual demo table, actual lighting, actual power.

## Your timeline

| When | Deliverable |
|---|---|
| T+0:30 | Contracts locked in repo |
| T+2:00 | Full UI running on fixtures |
| T+4:00 | State machine + hysteresis done |
| Halfway | **Integration pass — real sensors → real verdict → real display + buzzer** |
| −8h | Replay working; **backup video recorded** |
| −4h | Rehearsed 3×; `run_demo.sh` works from cold boot |
| −2h | Devpost written, repo clean, everyone knows their speaking part |

## Team fallback ladder (call these fast)

1. Blob conversion fails → OAK-1 as smart camera + Pi CPU classifier.
2. Vision broken → **gas + humiture only. Still complete and novel** — arguably the cleanest version of the thesis.
3. MQ-2 dead → humiture + vision.
4. Humiture dead → gas + vision.
5. LCD nightmare → HDMI only.
6. Buzzer/relay fails → on-screen alarm. Cosmetic loss.

**A working two-modality device beats a broken three-modality one on Completeness every time. Ship what works.**
