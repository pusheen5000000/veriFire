# VeriFIRE

VeriFIRE dashboard connected to a pretrained YOLO11 fire/smoke detector.

## Inspiration
Alarm fatigue doesn't just happen to nurses in hospitals — it happens to young adults trying to cook and live life in their new apartments too. Too often, we are interrupted by a smoke alarm going off because of a smoky pan, a pot boiled dry during midnight ramen, or steam and humidity building up in a small kitchen. Ordinary boiling water alone should not normally trigger a smoke alarm, but real apartments often create messy situations where steam, cooking aerosols, and harmless smoke are difficult to distinguish from something more serious.

It is usually just a little too much humidity or a little bit of harmless smoke. But when it happens day after day, our plain-vanilla smoke alarms need a little bit more help.

## What it does
VeriFIRE is an edge-AI verification layer designed to work **alongside** existing smoke alarms, not replace a certified life-safety device.

It combines MQ-2 gas/smoke-signal readings, humidity readings, temperature readings, and a live camera monitor powered by a lightweight, specially trained visual classifier. Together, these heterogeneous context clues help distinguish likely cooking, flammable-vapor, or water-vapor events from developing combustion-smoke conditions.

Running on a Raspberry Pi 5 with QNX as its safety-focused edge operating system, VeriFIRE is a plug-and-play prototype that can be detached and used to supplement an existing smoke alarm setup. Unlike a regular smoke alarm, VeriFIRE reads multiple environmental and visual clues at once, then gives a **smarter** reading on what is really going on and whether **you** should be concerned.

It classifies the environment into four project categories:

- **Combustion smoke — DANGER**
- **Flammable vapor — WARNING**
- **Water vapor — SAFE**
- **Normal air — SAFE**

For example, wood and mosquito-coil combustion are treated as combustion smoke, rubbing alcohol is treated as flammable vapor, and water vapor is treated as a safe steam/humidity event. The display, dashboard, and buzzer behavior respond to the same live classification state.

## How we built it
We built VeriFIRE using:

- A Raspberry Pi 5
- QNX as the edge operating system and hardware-control layer
- An MQ-2 gas/smoke sensor read through a PCF8591 ADC
- A DHT11 humidity and temperature sensor connected through an ESP32 UART bridge
- A Raspberry Pi Camera Module 3 and local visual-classification pipeline
- An active buzzer and a passive buzzer for different alert behaviors
- A 16×2 LCD display for live sensor readings and classification context
- A local web dashboard that polls live readings from the QNX Pi

## Challenges we ran into
The largest challenge was integrating physical hardware with QNX on the Raspberry Pi 5. Camera access, sensor permissions, process management, UART configuration, GPIO pin muxing, I2C communication, wiring, calibration, and device configuration all required a lot of debugging.

In particular, getting the ESP32 humidity sensor, QNX UART driver, LCD, buzzers, and live dashboard to agree on the same real-time state required careful testing. We also had to account for noisy or low-resolution physical sensor readings, serial-device setup after boot, and the difference between harmless water vapor, flammable vapor, and real combustion smoke.

Additionally, many resources and a lot of thought were required to train the AI model. Trained from datasets and a specialized configuration, it required trial-and-error to find the most practical setup given our time and resource constraints.

## Accomplishments that we're proud of
We are proud that we created something that combines real sensors, physical hardware, an edge operating system, local inference, and an interactive dashboard into one functioning prototype.

We are especially proud that we ran the system on QNX and Raspberry Pi hardware, integrated live gas/smoke-signal, humidity, and temperature measurements, performed local visual inference without relying on the cloud, and built a responsive dashboard with live classifications, alerts, a working camera, LCD output, and physical buzzer feedback.

Lastly, we are extremely impressed with how well our AI model and sensor-fusion approach came together given our resource constraints. Coupled with our sensors, we are able to produce a more accurate and comprehensive reading of the situation than any single input alone.

## What we learned
We learned how to combine hardware with software, configure and debug QNX on a Raspberry Pi, connect sensors through I2C and UART, build live displays and dashboards, collect combustion readings, and train a lightweight visual model for smoke-related classification.

## What's next for VeriFIRE
Next, we want to collect a larger and more diverse dataset to train and evaluate our visual model even further. We also want to calibrate the gas sensor more rigorously, test more real apartment and kitchen conditions, improve startup automation, and evaluate how well the system reduces nuisance alerts without missing genuine combustion-smoke events.

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
