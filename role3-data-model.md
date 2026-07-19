# Role 3 — Data & Model

**You own the novelty.** Anyone builds a smoke detector; you build the one that *knows the difference*.

## You are not blocked — work in this order

The gas sensor needs burn-in before its data is trustworthy. So **do not start with the gas sensor.** Start with the two things that need no hardware at all:

| When | What | Needs hardware? |
|---|---|---|
| T+0:00 | **Phone-video collection** (steam vs. incense vs. clear) | No — just a phone |
| T+0:30 | **Feature + training pipeline built on Role 1's `--fake` feed** | No |
| T+1:30 | Public fire/smoke datasets pulled, vision set assembled | No |
| T+2:00 | Take **your own dedicated Pi 5** from Role 1 (they're flashing you one) | Yes |
| T+3:00 | Gas + humiture logging once Role 1 says the sensor is stable | Yes |

By the time the sensors are warm, your pipeline is written and your vision data is already collected. **Zero idle time.**

---

## The thesis (know this cold — it's the whole project)

**Steam is water vapour:** big fast **humidity spike**, gas response flat.
**Combustion smoke:** **gas spike + temperature rise**, humidity flat or falling.

That's a physical separator, not a hope. Your headline engineered feature:

```python
steam_ratio = humidity_slope / (gas_slope + 1e-6)
```

## Classes

- **clear**
- **benign** — steam, cooking, vaping, dust, aerosol
- **hazard** — real combustion smoke

Log metadata every sample: source, distance, duration, ambient, which Pi/sensor. You'll need it when a model misbehaves.

**Decide the decision window now:** rolling ~10s, not an instant. The temporal shape (rise rate, persistence, decay) is where the information lives.

## PRIORITY SESSION — run this the moment sensors are warm

**Kettle steam vs. incense, back to back, all modalities logged with synced timestamps.**

This proves or kills the entire thesis in ~20 minutes. Run it before collecting anything else in bulk. If the humidity/gas divergence is there, you know the project works. If it isn't, you need to know *now*, not Sunday.

## Collection

**Benign:** kettle/mug steam, shower steam, cooking smoke if a kitchen is reachable, vape/fog, dust from clapping a cushion, aerosol spray. **Many short sessions at varied distances and angles**, not one long one.

**Hazard:** incense sticks + smoke-test aerosol (safe, real combustion particulate the MQ-2 genuinely responds to). Plus **phone video of real fire** (candles, fire pit, BBQ) and **public fire/smoke image datasets** for the vision set.

**Clear:** long baselines *in the actual demo room*, including people walking past.

Rough targets: dozens of short sensor sessions per class; hundreds–low thousands of labeled frames per class for vision (public data does the heavy lifting for hazard).

⚠ Coordinate with Role 2 on **whether replay needs the OAK's feature outputs recorded alongside frames.** Ask them before you bulk-collect.

## Features

**Gas:** delta from baseline, max delta, slope, time-to-peak, decay rate, variance, area under curve.

**Humiture (your headline):** humidity delta + slope, temp delta + slope, and `humidity_slope / gas_slope`.

**Vision (from Role 2):** optical-flow direction/persistence, feature-track lifetime, greyness/saturation drop, edge-density reduction, region growth.

## Model

**Start simple, not deep.** Gradient boosting or random forest over ~20 engineered features will likely beat a rushed neural net on a small dataset, trains in seconds, and gives **feature importances you drop straight into the `reason` string**:

> *"humidity +18%, gas flat → steam"*

That explainability scores on Design and Technical Difficulty. A black box doesn't.

⚠ **Hold out a test set from a SEPARATE session.** Same-session splits give a fake 99% and a humiliating live demo.

**Tune the operating point deliberately:** a missed fire is worse than a false alarm, but the whole pitch is about not false-alarming. Pick a threshold that never misses hazard on your test set while minimising benign false-positives — **and be ready to explain that tradeoff.** That answer alone shows real engineering thought.

## Deliverables

```python
predict(window) -> {"class": "clear"|"benign"|"hazard",
                    "confidence": 0.87,
                    "reason": "humidity spiked 18% with flat gas — consistent with steam",
                    "contributions": {"gas": 0.1, "humiture": 0.7, "vision": 0.2}}
```

Version the model file (`model_v1.pkl`, `v2`…) so Role 4 never wonders which is loaded.

**For the pitch, hand Role 4:**
- Confusion matrix
- **The killer plot: humidity and gas traces overlaid, steam vs. incense.** The divergence is visually obvious and lands your thesis in three seconds.
- 3–5 sentences of honest limitations ("untested on grease fires; alcohol vapour triggers the gas channel"). Judges respect stated limits far more than overclaiming.

## Gotchas

- Don't collect with a cold MQ-2. Wait for Role 1's all-clear.
- Class imbalance: you'll over-collect "clear". Balance or weight.
- Resist training a big CNN from scratch — transfer learning or hand-crafted features will finish; scratch training won't.
- If temperature readings look oddly high, the MQ-2's heater is too close to the humiture sensor. Tell Role 1.
