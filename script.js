/* =========================================================
   VeriFIRE Dashboard — script.js
   Frontend-only logic. All data below is MOCK DATA.

   ---------------------------------------------------------
   HOW TO CONNECT A REAL BACKEND LATER:
   Every mock value is produced inside the `DataService` object
   at the bottom of the "MOCK DATA LAYER" section. Each method
   returns a Promise, so swapping the body of a method for a
   real `fetch("/api/...")` call requires no changes anywhere
   else in this file — the render functions only ever call
   `DataService.getX()` and `await` the result.
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     APP STATE
     ========================================================= */
  const state = {
    demoMode: false,
    tickCount: 0,
    alerts: [],
  };

  const UPDATE_INTERVAL_MS = 1000;

  /* =========================================================
     MOCK DATA LAYER
     Replace the internals of these functions with real API
     calls (e.g. fetch('/api/sensors/health')) when the backend
     is ready. Keep the function names & return shapes stable.
     ========================================================= */
  const DataService = (function () {
    // ---- Baseline "normal" reference values ----
    const baseline = {
      sensors: [
        { id: "smoke", name: "Smoke Sensor", signal: 97 },
        { id: "co", name: "CO Sensor", signal: 95 },
        { id: "co2", name: "CO₂ Sensor", signal: 98 },
        { id: "temp", name: "Temperature", signal: 99 },
        { id: "humidity", name: "Humidity", signal: 96 },
        { id: "airquality", name: "Air Quality", signal: 94 },
      ],
      environment: {
        humidity: { label: "Humidity", unit: "%RH", value: 41, min: 0, max: 100, warn: null, danger: null },
      },
      classification: {
        fire: 2,
        cooking: 8,
        steam: 4,
        dust: 3,
        vaping: 1,
      },
    };

    // Small helper to jitter a numeric value within a bounded range
    function jitter(value, amount, min, max) {
      const next = value + (Math.random() * 2 - 1) * amount;
      return Math.min(max, Math.max(min, next));
    }

    // Internal mutable "live" copies of baseline data the simulator nudges each tick
    const live = JSON.parse(JSON.stringify(baseline));

    function stepNormal() {
      // Sensor signal quality drifts slightly, stays healthy
      live.sensors.forEach((s) => {
        s.signal = Math.round(jitter(s.signal, 1.2, 90, 100));
      });

      // Environmental readings drift gently around baseline
      const env = live.environment;
      env.humidity.value = Math.round(jitter(env.humidity.value, 1, 35, 55));

      // Classification confidences stay low & noisy, cooking slightly dominant occasionally
      const c = live.classification;
      c.fire = Math.round(jitter(c.fire, 1, 0, 6));
      c.cooking = Math.round(jitter(c.cooking, 3, 2, 22));
      c.steam = Math.round(jitter(c.steam, 2, 0, 12));
      c.dust = Math.round(jitter(c.dust, 1.5, 0, 10));
      c.vaping = Math.round(jitter(c.vaping, 1, 0, 6));
    }

    function stepDemoFire() {
      // Simulated fire event: smoke/CO/temperature climb, signal quality dips slightly
      // on the smoke + temperature sensors (heat stress), classification shifts to "fire".
      live.sensors.forEach((s) => {
        if (s.id === "smoke" || s.id === "temp") {
          s.signal = Math.round(jitter(s.signal, 1, 78, 96));
        } else {
          s.signal = Math.round(jitter(s.signal, 1, 88, 99));
        }
      });

      const env = live.environment;
      env.humidity.value = Math.round(jitter(env.humidity.value, 1, 20, 40));

      const c = live.classification;
      c.fire = Math.min(99, Math.round(c.fire + 8 + Math.random() * 6));
      c.cooking = Math.round(jitter(c.cooking, 2, 0, 15));
      c.steam = Math.round(jitter(c.steam, 2, 0, 10));
      c.dust = Math.round(jitter(c.dust, 1, 0, 8));
      c.vaping = Math.round(jitter(c.vaping, 1, 0, 5));
    }

    return {
      /** Simulates GET /api/sensors/health */
      getSensorHealth() {
        return Promise.resolve(
          live.sensors.map((s) => ({
            ...s,
            health: s.signal >= 90 ? "nominal" : s.signal >= 75 ? "degraded" : "fault",
          }))
        );
      },

      /** Simulates GET /api/environment/readings */
      getEnvironmentalReadings() {
        return Promise.resolve(JSON.parse(JSON.stringify(live.environment)));
      },

      /** Simulates GET /api/ai/classification */
      getAIClassification() {
        return Promise.resolve({ ...live.classification });
      },

      /** Simulates GET /api/alerts (most recent first) */
      getAlerts() {
        return Promise.resolve(state.alerts);
      },

      /** Advances the mock simulation by one tick */
      tick() {
        if (state.demoMode) {
          stepDemoFire();
        } else {
          stepNormal();
        }
      },

      /** Toggle the simulator's mode */
      setDemoMode(on) {
        state.demoMode = on;
      },
    };
  })();

  /* =========================================================
     DOM REFERENCES
     ========================================================= */
  const el = {
    connectionPill: document.getElementById("connectionPill"),
    connectionLabel: document.getElementById("connectionLabel"),
    liveClock: document.getElementById("liveClock"),

    heroCore: document.getElementById("heroCore"),
    heroCoreValue: document.getElementById("heroCoreValue"),

    overallStatus: document.getElementById("overallStatus"),
    overallIcon: document.getElementById("overallIcon"),
    overallBadge: document.getElementById("overallBadge"),
    overallDesc: document.getElementById("overallDesc"),
    overallUpdated: document.getElementById("overallUpdated"),

    sensorHealthGrid: document.getElementById("sensorHealthGrid"),
    envReadingsGrid: document.getElementById("envReadingsGrid"),
    aiClassification: document.getElementById("aiClassification"),

    alertsList: document.getElementById("alertsList"),
    alertCount: document.getElementById("alertCount"),

    demoModeBtn: document.getElementById("demoModeBtn"),
    resetModeBtn: document.getElementById("resetModeBtn"),

    cameraFrame: document.getElementById("cameraFrame"),
    cameraVideo: document.getElementById("cameraVideo"),
    cameraLoading: document.getElementById("cameraLoading"),
    cameraError: document.getElementById("cameraError"),
    cameraErrorText: document.getElementById("cameraErrorText"),
    cameraBadge: document.getElementById("cameraBadge"),
    cameraClassOverlay: document.getElementById("cameraClassOverlay"),
    cameraConfOverlay: document.getElementById("cameraConfOverlay"),
    cameraToggleBtn: document.getElementById("cameraToggleBtn"),
    cameraRetryBtn: document.getElementById("cameraRetryBtn"),
  };

  /* =========================================================
     LIVE CAMERA FEED
     Uses the browser's MediaDevices API only — no AI inference
     happens on the frontend. The AI classification overlay is
     purely a display of values already computed by DataService
     (i.e. what the real backend/edge model would report).
     ========================================================= */
  const Camera = (function () {
    let mediaStream = null;
    let isRunning = false;

    /** Switches the visible state of the camera frame: "loading" | "live" | "error" */
    function setFrameState(mode) {
      el.cameraLoading.hidden = mode !== "loading";
      el.cameraError.hidden = mode !== "error";
      el.cameraVideo.style.visibility = mode === "live" ? "visible" : "hidden";
      el.cameraClassOverlay.hidden = mode !== "live";
      el.cameraConfOverlay.hidden = mode !== "live";
    }

    /** Updates the small status badge in the top-right of the frame */
    function setBadge(status) {
      const labels = { connecting: "Connecting", live: "Live", unavailable: "Camera Unavailable" };
      el.cameraBadge.dataset.state = status;
      el.cameraBadge.textContent = labels[status] || status;
    }

    /** Maps a getUserMedia error to a clean, human-readable message */
    function describeError(err) {
      switch (err && err.name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
          return "Camera access was denied. Enable camera permission in your browser settings and try again.";
        case "NotFoundError":
        case "DevicesNotFoundError":
          return "No camera was found on this device.";
        case "NotReadableError":
          return "The camera is already in use by another application.";
        default:
          return "Unable to access the camera. Please check your device and try again.";
      }
    }

    /** Requests camera access and attaches the stream to the <video> element */
    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setBadge("unavailable");
        setFrameState("error");
        el.cameraErrorText.textContent = "This browser does not support camera access.";
        return;
      }

      setBadge("connecting");
      setFrameState("loading");
      el.cameraToggleBtn.disabled = true;

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        el.cameraVideo.srcObject = mediaStream;

        // Some browsers don't auto-trigger playback when srcObject is set
        // dynamically after the page has already loaded, even with the
        // `autoplay` attribute present. Explicitly starting playback here
        // avoids a "granted but frozen/black" video.
        try {
          await el.cameraVideo.play();
        } catch (playErr) {
          console.warn("Video playback did not start automatically:", playErr);
        }

        isRunning = true;
        setBadge("live");
        setFrameState("live");
        el.cameraToggleBtn.textContent = "Stop Camera";
        el.cameraToggleBtn.disabled = false;
      } catch (err) {
        isRunning = false;
        setBadge("unavailable");
        setFrameState("error");
        el.cameraErrorText.textContent = describeError(err);
      }
    }

    /** Stops all tracks and releases the camera */
    function stop() {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      el.cameraVideo.srcObject = null;
      isRunning = false;
      setBadge("unavailable");
      setFrameState("error");
      el.cameraErrorText.textContent = "Camera stopped.";
      el.cameraToggleBtn.textContent = "Start Camera";
      el.cameraToggleBtn.disabled = false;
    }

    /** Toggles between start/stop, used by the control button */
    function toggle() {
      el.cameraToggleBtn.disabled = true;
      if (isRunning) {
        stop();
      } else {
        start();
      }
    }

    /** Syncs the bottom overlays with the latest AI classification result */
    function updateOverlay(topLabel, topValue, stateName) {
      if (!isRunning) return;
      el.cameraClassOverlay.textContent = topLabel.toUpperCase();
      el.cameraClassOverlay.dataset.state = stateName;
      el.cameraConfOverlay.textContent = `${topValue}%`;
    }

    return { start, stop, toggle, updateOverlay };
  })();

  el.cameraToggleBtn.addEventListener("click", Camera.toggle);
  el.cameraRetryBtn.addEventListener("click", Camera.start);

  /* =========================================================
     RENDER HELPERS
     ========================================================= */

  function levelForValue(reading) {
    if (reading.danger != null && reading.value >= reading.danger) return "danger";
    if (reading.warn != null && reading.value >= reading.warn) return "warning";
    return "normal";
  }

  function renderSensorHealth(sensors) {
    el.sensorHealthGrid.innerHTML = sensors
      .map((s) => {
        const statusLabel =
          s.health === "nominal" ? "Nominal" : s.health === "degraded" ? "Degraded" : "Fault";
        return `
          <div class="sensor-card" data-health="${s.health}">
            <div class="sensor-card__top">
              <span class="sensor-card__name">${s.name}</span>
              <span class="sensor-card__dot" title="${statusLabel}"></span>
            </div>
            <span class="sensor-card__status">${statusLabel}</span>
            <div class="sensor-card__signal">
              <div class="sensor-card__bar">
                <div class="sensor-card__bar-fill" style="width:${s.signal}%"></div>
              </div>
              <span class="sensor-card__signal-value">${s.signal}%</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderEnvironmentalReadings(env) {
    el.envReadingsGrid.innerHTML = Object.values(env)
      .map((reading) => {
        const level = levelForValue(reading);
        const pct = Math.min(
          100,
          Math.round(((reading.value - reading.min) / (reading.max - reading.min)) * 100)
        );
        return `
          <div class="env-card">
            <div class="env-card__label"><span>${reading.label}</span></div>
            <div class="env-card__reading">
              <span class="env-card__value">${reading.value}</span>
              <span class="env-card__unit">${reading.unit}</span>
            </div>
            <div class="env-card__track">
              <div class="env-card__track-fill" data-level="${level}" style="width:${pct}%"></div>
            </div>
            <div class="env-card__range">
              <span>${reading.min}</span>
              <span>${reading.max}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderAIClassification(classification) {
    const entries = Object.entries(classification);
    const topLabel = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

    el.aiClassification.innerHTML = entries
      .map(([label, value]) => {
        const isTop = label === topLabel;
        const niceLabel = label.charAt(0).toUpperCase() + label.slice(1);
        return `
          <div class="ai-class__row" data-top="${isTop}" data-label="${label}">
            <span class="ai-class__label">${niceLabel}</span>
            <div class="ai-class__track">
              <div class="ai-class__track-fill" style="width:${value}%"></div>
            </div>
            <span class="ai-class__value">${value}%</span>
          </div>
        `;
      })
      .join("");

    return { topLabel, topValue: classification[topLabel] };
  }

  function renderAlerts(alerts) {
    el.alertCount.textContent = `${alerts.length} event${alerts.length === 1 ? "" : "s"}`;

    if (alerts.length === 0) {
      el.alertsList.innerHTML = `
        <div class="alert-item">
          <div class="alert-item__body">
            <p class="alert-item__desc">No alerts recorded this session.</p>
          </div>
        </div>
      `;
      return;
    }

    el.alertsList.innerHTML = alerts
      .map(
        (a) => `
        <div class="alert-item">
          <span class="alert-item__time">${a.time}</span>
          <div class="alert-item__body">
            <span class="alert-item__badge" data-severity="${a.severity}">${a.severity}</span>
            <p class="alert-item__desc">${a.description}</p>
          </div>
        </div>
      `
      )
      .join("");
  }

  function renderOverallStatus(topLabel, topValue) {
    let stateName = "safe";
    let badge = "SAFE";
    let icon = "&#10003;";
    let desc = "All sensors nominal. No signs of fire, smoke, or hazardous gas detected.";

    if (topLabel === "fire" && topValue >= 70) {
      stateName = "danger";
      badge = "DANGER";
      icon = "&#9888;";
      desc = "High-confidence fire signature detected. Evacuate and verify immediately.";
    } else if (topLabel === "fire" && topValue >= 30) {
      stateName = "warning";
      badge = "WARNING";
      icon = "&#9888;";
      desc = "Elevated fire-like signature detected. Monitoring closely for confirmation.";
    }

    el.overallStatus.dataset.state = stateName;
    el.overallIcon.innerHTML = icon;
    el.overallBadge.textContent = badge;
    el.overallDesc.textContent = desc;
    el.overallUpdated.textContent = "Updated just now";

    // Sync the hero signature core with the same state
    const coreColorVar =
      stateName === "danger"
        ? "var(--accent-ember-500)"
        : stateName === "warning"
        ? "var(--accent-amber-500)"
        : "var(--accent-fire-500)";
    const ring = el.heroCore.querySelector(".ring--inner");
    ring.style.stroke = coreColorVar;
    el.heroCoreValue.textContent = `${topValue}%`;
    el.heroCoreValue.style.color = coreColorVar;
    el.heroCore.querySelector(".sensor-core__label").textContent =
      stateName === "safe" ? "Normal Air" : topLabel.charAt(0).toUpperCase() + topLabel.slice(1) + " Signature";

    return stateName;
  }

  function pushAlertIfNeeded(stateName, topLabel, topValue) {
    // Only log a new alert when the state actually changes to avoid spamming the list
    const last = state.alerts[0];
    const changed = !last || last._stateName !== stateName;
    if (!changed) return;

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    let severity = "info";
    let description = "System status returned to normal.";

    if (stateName === "danger") {
      severity = "danger";
      description = `Fire signature confirmed at ${topValue}% confidence. Immediate response required.`;
    } else if (stateName === "warning") {
      severity = "warning";
      description = `Fire-like signature rising (${topValue}% confidence). Investigating source.`;
    } else if (last) {
      severity = "info";
      description = "All readings back within safe operating range.";
    } else {
      return; // don't log the very first "safe" state on load
    }

    state.alerts.unshift({ time, severity, description, _stateName: stateName });
    if (state.alerts.length > 25) state.alerts.pop();
  }

  /* =========================================================
     CLOCK
     ========================================================= */
  function updateClock() {
    const now = new Date();
    el.liveClock.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  /* =========================================================
     MAIN UPDATE LOOP
     ========================================================= */
  async function refreshDashboard() {
    DataService.tick();

    const [sensors, env, classification] = await Promise.all([
      DataService.getSensorHealth(),
      DataService.getEnvironmentalReadings(),
      DataService.getAIClassification(),
    ]);

    renderSensorHealth(sensors);
    renderEnvironmentalReadings(env);
    const { topLabel, topValue } = renderAIClassification(classification);
    const stateName = renderOverallStatus(topLabel, topValue);
    pushAlertIfNeeded(stateName, topLabel, topValue);
    Camera.updateOverlay(topLabel, topValue, stateName);

    const alerts = await DataService.getAlerts();
    renderAlerts(alerts);
  }

  /* =========================================================
     DEMO MODE CONTROLS
     ========================================================= */
  function enableDemoMode() {
    DataService.setDemoMode(true);
    el.demoModeBtn.disabled = true;
    el.resetModeBtn.disabled = false;
    el.demoModeBtn.textContent = "Simulating Fire Event…";
  }

  function disableDemoMode() {
    DataService.setDemoMode(false);
    el.demoModeBtn.disabled = false;
    el.resetModeBtn.disabled = true;
    el.demoModeBtn.innerHTML = '<span class="btn__icon" aria-hidden="true">&#9889;</span> Simulate Fire Event';
  }

  el.demoModeBtn.addEventListener("click", enableDemoMode);
  el.resetModeBtn.addEventListener("click", disableDemoMode);

  /* =========================================================
     INIT
     ========================================================= */
  function init() {
    updateClock();
    refreshDashboard();
    Camera.start();

    setInterval(updateClock, 1000);
    setInterval(refreshDashboard, UPDATE_INTERVAL_MS);
  }

  document.addEventListener("DOMContentLoaded", init);
})();