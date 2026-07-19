# Role 3 — Data & Model (QNX deployment)

**You own the novelty.** Anyone builds a smoke detector; you build the one that *knows the difference*.

## ⚠ Read first: the QNX constraint that shapes your whole job

**Do not assume scikit-learn, numpy, pandas or PyTorch will run on the QNX node.** Compiled Python wheels for an RTOS are not a thing you `pip install` at a hackathon.

**The fix — and it's a clean one:**

> **Train on your laptop with whatever you like. Ship the model to QNX as plain Python (or C) with zero dependencies.**

A decision tree, random forest, or gradient-boosted ensemble **exports to pure if/else code**. A 200-tree forest becomes a few hundred lines of dependency-free Python that runs anywhere, including QNX, in microseconds. Write a small exporter (`sklearn tree → nested if/else`) — it's ~30 lines and it eliminates your single biggest deployment risk.

**This is also why you must not reach for a neural net.** A deep model needs a runtime on the target; a tree ensemble needs nothing. On this project the simple model is both more accurate on small data *and* radically easier to deploy.

⚠ **Coordinate with Role 1 on the QNX prize requirement:** the track requires an open-source AI module from oss.qnx.com in the product. Role 1 identifies which one hour one. If it's an ONNX/TFLite-class runtime, you may be *required* to route some inference through it — find out before you finalise your model format. Worst case you run your tree ensemble as the fusion logic and put a small ONNX model in the vision or preprocessing path to satisfy the requirement.

---

## You are not blocked — work in this order

Gas data needs burn-in. So **don't start with the gas sensor.**

| When | What | Needs hardware? |
|---|---|---|
| T+0:00 | **Phone-video collection** (steam vs. incense vs. clear) | No |
| T+0:30 | **Feature + training pipeline on Role 1's `--fake` feed** | No |
| T+1:00 | **Write the model exporter** (sklearn → pure Python) | No |
| T+1:30 | Public fire/smoke datasets pulled | No |
| T+2:00 | Take the **Linux node** with Role 2 for collection | Yes |
| T+3:00 | Gas + humiture logging once Role 1 says the sensor is stable | Yes |

By the time sensors are warm, your pipeline and exporter are written. **Zero idle time.**

> Collect and train on **Linux/laptop**, never on the QNX node. QNX only ever sees the exported `predict()`.

---

## The thesis (know it cold — it's the whole project)

**Steam is water vapour:** big fast **humidity spike**, gas flat.
**Combustion smoke:** **gas spike + temperature rise**, humidity flat or falling.

Physical separator, not a hope. Your headline feature:

```python
steam_ratio = humidity_slope / (gas_slope + 1e-6)
```

## Classes

**clear** · **benign** (steam, cooking, vaping, dust, aerosol) · **hazard** (real combustion smoke)

Log metadata per sample: source, distance, duration, ambient, which sensor. **Decide the decision window now:** rolling ~10s, not an instant — the temporal shape is where the information lives.

## PRIORITY SESSION — the moment sensors are warm

**Kettle steam vs. incense, back to back, all modalities, synced timestamps.**

Proves or kills the thesis in ~20 minutes. Run it before bulk collection. If the humidity/gas divergence isn't there, you need to know **now**, not Sunday.

## Collection

**Benign:** kettle/mug steam, shower steam, cooking smoke if reachable, vape/fog, dust from clapping a cushion, aerosol spray. **Many short sessions, varied distance and angle** — not one long one.

**Hazard:** incense + smoke-test aerosol (safe, real combustion particulate the MQ-2 genuinely responds to). Plus **phone video of real fire** and **public fire/smoke datasets** for the vision set.

**Clear:** long baselines *in the actual demo room*, people walking past included.

⚠ Ask Role 2 whether replay needs the OAK's feature outputs recorded alongside frames — **before** you bulk-collect.

## Features

**Gas:** delta from baseline, max delta, slope, time-to-peak, decay rate, variance, area under curve.
**Humiture (headline):** humidity delta + slope, temp delta + slope, `humidity_slope / gas_slope`.
**Vision (from Role 2, over the network):** optical-flow rise/spread, feature-track persistence, opacity, edge-density drop.

⚠ **Vision features arrive over a link that can drop.** Train the model to work **with and without** the vision block — either two models (fusion / sensor-only) or vision features that default to neutral. Role 2 is demoing an unplug-the-vision-node moment; your model must not fall over when they do. Agree the null behaviour with Roles 2 and 4.

## Model

**Gradient boosting or random forest over ~20 engineered features.** Trains in seconds, beats a rushed net on small data, exports to dependency-free code, and gives **feature importances you drop straight into the `reason` string**:

> *"humidity +18%, gas flat → steam"*

That explainability scores on Design and Technical Difficulty. A black box doesn't.

⚠ **Hold out a test set from a SEPARATE session.** Same-session splits give a fake 99% and a humiliating live demo.

**Tune the operating point deliberately:** a missed fire is worse than a false alarm, but the whole pitch is not false-alarming. Pick a threshold that never misses hazard on your test set while minimising benign false-positives — **and be ready to explain the tradeoff.** That answer alone shows real engineering thought.

## Deliverables

A single dependency-free `model.py` on the QNX node:

```python
def predict(window) -> dict:
    # pure if/else, no imports
    return {"class": "clear"|"benign"|"hazard",
            "confidence": 0.87,
            "reason": "humidity spiked 18% with flat gas — consistent with steam",
            "contributions": {"gas": 0.1, "humiture": 0.7, "vision": 0.2}}
```

Version it (`model_v1.py`, `v2`…) so Role 4 never wonders which is loaded. Deploy with `scp model_v2.py qnxuser@qnxpi:python/`.

**For the pitch, hand Role 4:**
- Confusion matrix
- **The killer plot: humidity and gas traces overlaid, steam vs. incense.** The divergence is visually obvious and lands the thesis in three seconds.
- 3–5 sentences of honest limitations ("untested on grease fires; alcohol vapour triggers the gas channel"). Judges respect stated limits far more than overclaiming.

## Gotchas

- Don't collect with a cold MQ-2. Wait for Role 1's all-clear.
- Class imbalance: you'll over-collect "clear". Balance or weight.
- **Test the exported pure-Python model against the sklearn original** before shipping — a broken exporter is a silent accuracy killer. Assert identical predictions on your test set.
- Floating-point: keep the exported thresholds at full precision; don't round them into a different tree.
- If temperature readings look oddly high, the MQ-2 heater is too close to the humiture sensor. Tell Role 1.
