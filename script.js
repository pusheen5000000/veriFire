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
  const CAMERA_REFRESH_INTERVAL_MS = 350;
  const DEFAULT_CAMERA_STREAM_URL =
    "http://localhost:8081/camera.bmp";

  const CAMERA_STREAM_URL = (() => {
    const params = new URLSearchParams(window.location.search);

    const configuredUrl =
      window.VERIFIRE_CAMERA_STREAM_URL ||
      params.get("camera") ||
      params.get("stream");

    return (
      configuredUrl || DEFAULT_CAMERA_STREAM_URL
    ).trim();
  })();

  /* =========================================================
     MOCK DATA LAYER
     Replace the internals of these functions with real API
     calls when the backend is ready.
     ========================================================= */
  const DataService = (function () {
    const baseline = {
      sensors: [
        {
          id: "smoke",
          name: "Smoke Sensor",
          signal: 97,
        },
        {
          id: "humidity",
          name: "Humidity",
          signal: 96,
        },
        {
          id: "temperature",
          name: "Temperature Sensor",
          signal: 98,
        },
      ],

      environment: {
        humidity: {
          label: "Humidity",
          unit: "%RH",
          value: 41,
          min: 0,
          max: 100,
          warn: null,
          danger: null,
        },

        smoke: {
          label: "Smoke Level",
          unit: "ppm",
          value: 12,
          min: 0,
          max: 500,
          warn: 150,
          danger: 300,
        },

        temperature: {
          label: "Temperature",
          unit: "°C",
          value: 22,
          min: 10,
          max: 50,
          warn: 35,
          danger: 45,
        },
      },

      classification: {
        fire: 2,
        cooking: 8,
        steam: 4,
        dust: 3,
        vaping: 1,
      },
    };

    function jitter(value, amount, min, max) {
      const next =
        value + (Math.random() * 2 - 1) * amount;

      return Math.min(
        max,
        Math.max(min, next)
      );
    }

    const live = JSON.parse(
      JSON.stringify(baseline)
    );

    function stepNormal() {
      live.sensors.forEach((sensor) => {
        sensor.signal = Math.round(
          jitter(
            sensor.signal,
            1.2,
            90,
            100
          )
        );
      });

      const env = live.environment;

      env.humidity.value = Math.round(
        jitter(
          env.humidity.value,
          1,
          35,
          55
        )
      );

      env.smoke.value = Math.round(
        jitter(
          env.smoke.value,
          2,
          5,
          25
        )
      );

      env.temperature.value = Math.round(
        jitter(
          env.temperature.value,
          0.5,
          20,
          25
        )
      );

      const classification = live.classification;

      classification.fire = Math.round(
        jitter(
          classification.fire,
          1,
          0,
          6
        )
      );

      classification.cooking = Math.round(
        jitter(
          classification.cooking,
          3,
          2,
          22
        )
      );

      classification.steam = Math.round(
        jitter(
          classification.steam,
          2,
          0,
          12
        )
      );

      classification.dust = Math.round(
        jitter(
          classification.dust,
          1.5,
          0,
          10
        )
      );

      classification.vaping = Math.round(
        jitter(
          classification.vaping,
          1,
          0,
          6
        )
      );
    }

    function stepDemoFire() {
      live.sensors.forEach((sensor) => {
        if (sensor.id === "smoke") {
          sensor.signal = Math.round(
            jitter(
              sensor.signal,
              1,
              78,
              96
            )
          );
        } else {
          sensor.signal = Math.round(
            jitter(
              sensor.signal,
              1,
              88,
              99
            )
          );
        }
      });

      const env = live.environment;

      env.humidity.value = Math.round(
        jitter(
          env.humidity.value,
          1,
          20,
          40
        )
      );

      env.smoke.value = Math.round(
        jitter(
          env.smoke.value,
          15,
          150,
          450
        )
      );

      const classification = live.classification;

      classification.fire = Math.min(
        99,
        Math.round(
          classification.fire +
          8 +
          Math.random() * 6
        )
      );

      classification.cooking = Math.round(
        jitter(
          classification.cooking,
          2,
          0,
          15
        )
      );

      classification.steam = Math.round(
        jitter(
          classification.steam,
          2,
          0,
          10
        )
      );

      classification.dust = Math.round(
        jitter(
          classification.dust,
          1,
          0,
          8
        )
      );

      classification.vaping = Math.round(
        jitter(
          classification.vaping,
          1,
          0,
          5
        )
      );
    }

    return {
      getSensorHealth() {
        return Promise.resolve(
          live.sensors.map((sensor) => ({
            ...sensor,

            health:
              sensor.signal >= 90
                ? "nominal"
                : sensor.signal >= 75
                ? "degraded"
                : "fault",
          }))
        );
      },

      getEnvironmentalReadings() {
        return Promise.resolve(
          JSON.parse(
            JSON.stringify(
              live.environment
            )
          )
        );
      },

      getAIClassification() {
        return Promise.resolve({
          ...live.classification,
        });
      },

      getAlerts() {
        return Promise.resolve(
          state.alerts
        );
      },

      tick() {
        if (state.demoMode) {
          stepDemoFire();
        } else {
          stepNormal();
        }
      },

      setDemoMode(on) {
        state.demoMode = on;
      },
    };
  })();

  /* =========================================================
     DOM REFERENCES
     ========================================================= */
  const el = {
    connectionPill:
      document.getElementById(
        "connectionPill"
      ),

    connectionLabel:
      document.getElementById(
        "connectionLabel"
      ),

    liveClock:
      document.getElementById(
        "liveClock"
      ),

    heroCore:
      document.getElementById(
        "heroCore"
      ),

    heroCoreValue:
      document.getElementById(
        "heroCoreValue"
      ),

    overallStatus:
      document.getElementById(
        "overallStatus"
      ),

    overallIcon:
      document.getElementById(
        "overallIcon"
      ),

    overallBadge:
      document.getElementById(
        "overallBadge"
      ),

    overallDesc:
      document.getElementById(
        "overallDesc"
      ),

    overallUpdated:
      document.getElementById(
        "overallUpdated"
      ),

    sensorHealthGrid:
      document.getElementById(
        "sensorHealthGrid"
      ),

    sensorHealthMeta:
      document.getElementById(
        "sensorHealthMeta"
      ),

    envReadingsGrid:
      document.getElementById(
        "envReadingsGrid"
      ),

    aiClassification:
      document.getElementById(
        "aiClassification"
      ),

    alertsList:
      document.getElementById(
        "alertsList"
      ),

    alertCount:
      document.getElementById(
        "alertCount"
      ),

    demoModeBtn:
      document.getElementById(
        "demoModeBtn"
      ),

    resetModeBtn:
      document.getElementById(
        "resetModeBtn"
      ),

    cameraFrame:
      document.getElementById(
        "cameraFrame"
      ),

    cameraVideo:
      document.getElementById(
        "cameraVideo"
      ),

    cameraLoading:
      document.getElementById(
        "cameraLoading"
      ),

    cameraError:
      document.getElementById(
        "cameraError"
      ),

    cameraErrorText:
      document.getElementById(
        "cameraErrorText"
      ),

    cameraBadge:
      document.getElementById(
        "cameraBadge"
      ),

    cameraClassOverlay:
      document.getElementById(
        "cameraClassOverlay"
      ),

    cameraConfOverlay:
      document.getElementById(
        "cameraConfOverlay"
      ),

    cameraToggleBtn:
      document.getElementById(
        "cameraToggleBtn"
      ),

    cameraRetryBtn:
      document.getElementById(
        "cameraRetryBtn"
      ),
  };

  /* =========================================================
     LIVE CAMERA FEED

     The QNX Flask server publishes:
     http://localhost:8081/camera.bmp

     A timestamp is added to each request so the browser does
     not display an old cached frame.
     ========================================================= */
  const Camera = (function () {
    let isRunning = false;
    let refreshTimer = null;
    let requestGeneration = 0;
    let hasLoadedFrame = false;

    function setFrameState(mode) {
      el.cameraLoading.hidden =
        mode !== "loading";

      el.cameraError.hidden =
        mode !== "error";

      el.cameraVideo.style.visibility =
        mode === "live"
          ? "visible"
          : "hidden";

      el.cameraClassOverlay.hidden =
        mode !== "live";

      el.cameraConfOverlay.hidden =
        mode !== "live";
    }

    function setBadge(status) {
      const labels = {
        connecting: "Connecting",
        live: "Live",
        stopped: "Stopped",
        unavailable:
          "Camera Unavailable",
      };

      el.cameraBadge.dataset.state =
        status;

      el.cameraBadge.textContent =
        labels[status] || status;
    }

    function getFrameUrl() {
      const url = new URL(
        CAMERA_STREAM_URL,
        window.location.href
      );

      url.searchParams.set(
        "_",
        Date.now().toString()
      );

      return url.toString();
    }

    function clearRefreshTimer() {
      if (refreshTimer !== null) {
        window.clearTimeout(
          refreshTimer
        );

        refreshTimer = null;
      }
    }

    function scheduleNextFrame(
      delay =
        CAMERA_REFRESH_INTERVAL_MS
    ) {
      clearRefreshTimer();

      if (!isRunning) {
        return;
      }

      refreshTimer =
        window.setTimeout(() => {
          requestFrame();
        }, delay);
    }

    function requestFrame() {
      if (!isRunning) {
        return;
      }

      const generation =
        requestGeneration;

      const sourceUrl =
        getFrameUrl();

      const cleanup = () => {
        el.cameraVideo.removeEventListener(
          "load",
          onLoad
        );

        el.cameraVideo.removeEventListener(
          "error",
          onError
        );
      };

      const onLoad = () => {
        cleanup();

        if (
          !isRunning ||
          generation !==
            requestGeneration
        ) {
          return;
        }

        hasLoadedFrame = true;

        setBadge("live");
        setFrameState("live");

        el.cameraToggleBtn.textContent =
          "Stop Camera";

        el.cameraToggleBtn.disabled =
          false;

        scheduleNextFrame();
      };

      const onError = () => {
        cleanup();

        if (
          !isRunning ||
          generation !==
            requestGeneration
        ) {
          return;
        }

        setBadge("unavailable");

        el.cameraToggleBtn.textContent =
          "Stop Camera";

        el.cameraToggleBtn.disabled =
          false;

        if (!hasLoadedFrame) {
          setFrameState("error");

          el.cameraErrorText.textContent =
            `Unable to load ${CAMERA_STREAM_URL}. ` +
            "Check that the Pi screenshot server and SSH tunnel are running.";
        }

        scheduleNextFrame(1000);
      };

      el.cameraVideo.addEventListener(
        "load",
        onLoad
      );

      el.cameraVideo.addEventListener(
        "error",
        onError
      );

      el.cameraVideo.src =
        sourceUrl;
    }

    function start() {
      if (isRunning) {
        return;
      }

      isRunning = true;
      hasLoadedFrame = false;
      requestGeneration += 1;

      setBadge("connecting");
      setFrameState("loading");

      el.cameraToggleBtn.textContent =
        "Stop Camera";

      el.cameraToggleBtn.disabled =
        true;

      requestFrame();
    }

    function stop() {
      isRunning = false;
      requestGeneration += 1;
      hasLoadedFrame = false;

      clearRefreshTimer();

      el.cameraVideo.removeAttribute(
        "src"
      );

      setBadge("stopped");
      setFrameState("error");

      el.cameraErrorText.textContent =
        "Camera stream stopped.";

      el.cameraToggleBtn.textContent =
        "Start Camera";

      el.cameraToggleBtn.disabled =
        false;
    }

    function toggle() {
      if (isRunning) {
        stop();
      } else {
        start();
      }
    }

    function updateOverlay(
      topLabel,
      topValue,
      stateName
    ) {
      if (
        !isRunning ||
        !hasLoadedFrame
      ) {
        return;
      }

      el.cameraClassOverlay.textContent =
        topLabel.toUpperCase();

      el.cameraClassOverlay.dataset.state =
        stateName;

      el.cameraConfOverlay.textContent =
        `${topValue}%`;
    }

    return {
      start,
      stop,
      toggle,
      updateOverlay,
    };
  })();

  el.cameraToggleBtn.addEventListener(
    "click",
    Camera.toggle
  );

  el.cameraRetryBtn.addEventListener(
    "click",
    () => {
      Camera.stop();
      Camera.start();
    }
  );

  /* =========================================================
     RENDER HELPERS
     ========================================================= */
  function levelForValue(reading) {
    if (
      reading.danger != null &&
      reading.value >= reading.danger
    ) {
      return "danger";
    }

    if (
      reading.warn != null &&
      reading.value >= reading.warn
    ) {
      return "warning";
    }

    return "normal";
  }

  function renderSensorHealth(
    sensors
  ) {
    if (el.sensorHealthMeta) {
      el.sensorHealthMeta.textContent =
        `${sensors.length} device` +
        `${sensors.length === 1 ? "" : "s"} monitored`;
    }

    el.sensorHealthGrid.innerHTML =
      sensors
        .map((sensor) => {
          const statusLabel =
            sensor.health === "nominal"
              ? "Nominal"
              : sensor.health === "degraded"
              ? "Degraded"
              : "Fault";

          return `
            <div
              class="sensor-card"
              data-health="${sensor.health}"
            >
              <div class="sensor-card__top">
                <span class="sensor-card__name">
                  ${sensor.name}
                </span>

                <span
                  class="sensor-card__dot"
                  title="${statusLabel}"
                ></span>
              </div>

              <span class="sensor-card__status">
                ${statusLabel}
              </span>

              <div class="sensor-card__signal">
                <div class="sensor-card__bar">
                  <div
                    class="sensor-card__bar-fill"
                    style="width:${sensor.signal}%"
                  ></div>
                </div>

                <span class="sensor-card__signal-value">
                  ${sensor.signal}%
                </span>
              </div>
            </div>
          `;
        })
        .join("");
  }

  function renderEnvironmentalReadings(
    env
  ) {
    el.envReadingsGrid.innerHTML =
      Object.values(env)
        .map((reading) => {
          const level =
            levelForValue(reading);

          const percentage = Math.min(
            100,
            Math.round(
              (
                (
                  reading.value -
                  reading.min
                ) /
                (
                  reading.max -
                  reading.min
                )
              ) * 100
            )
          );

          return `
            <div class="env-card">
              <div class="env-card__label">
                <span>
                  ${reading.label}
                </span>
              </div>

              <div class="env-card__reading">
                <span class="env-card__value">
                  ${reading.value}
                </span>

                <span class="env-card__unit">
                  ${reading.unit}
                </span>
              </div>

              <div class="env-card__track">
                <div
                  class="env-card__track-fill"
                  data-level="${level}"
                  style="width:${percentage}%"
                ></div>
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

  function renderAIClassification(
    classification
  ) {
    const entries =
      Object.entries(classification);

    const topLabel =
      entries.reduce(
        (current, next) =>
          next[1] > current[1]
            ? next
            : current
      )[0];

    el.aiClassification.innerHTML =
      entries
        .map(
          ([label, value]) => {
            const isTop =
              label === topLabel;

            const niceLabel =
              label
                .charAt(0)
                .toUpperCase() +
              label.slice(1);

            return `
              <div
                class="ai-class__row"
                data-top="${isTop}"
                data-label="${label}"
              >
                <span class="ai-class__label">
                  ${niceLabel}
                </span>

                <div class="ai-class__track">
                  <div
                    class="ai-class__track-fill"
                    style="width:${value}%"
                  ></div>
                </div>

                <span class="ai-class__value">
                  ${value}%
                </span>
              </div>
            `;
          }
        )
        .join("");

    return {
      topLabel,
      topValue:
        classification[topLabel],
    };
  }

  function renderAlerts(alerts) {
    el.alertCount.textContent =
      `${alerts.length} event` +
      `${alerts.length === 1 ? "" : "s"}`;

    if (alerts.length === 0) {
      el.alertsList.innerHTML = `
        <div class="alert-item">
          <div class="alert-item__body">
            <p class="alert-item__desc">
              No alerts recorded this session.
            </p>
          </div>
        </div>
      `;

      return;
    }

    el.alertsList.innerHTML =
      alerts
        .map(
          (alert) => `
            <div class="alert-item">
              <span class="alert-item__time">
                ${alert.time}
              </span>

              <div class="alert-item__body">
                <span
                  class="alert-item__badge"
                  data-severity="${alert.severity}"
                >
                  ${alert.severity}
                </span>

                <p class="alert-item__desc">
                  ${alert.description}
                </p>
              </div>
            </div>
          `
        )
        .join("");
  }

  function renderOverallStatus(
    topLabel,
    topValue
  ) {
    let stateName = "safe";
    let badge = "SAFE";
    let icon = "&#10003;";

    let description =
      "All sensors nominal. No signs of fire, smoke, or hazardous gas detected.";

    if (
      topLabel === "fire" &&
      topValue >= 70
    ) {
      stateName = "danger";
      badge = "DANGER";
      icon = "&#9888;";

      description =
        "High-confidence fire signature detected. Evacuate and verify immediately.";
    } else if (
      topLabel === "fire" &&
      topValue >= 30
    ) {
      stateName = "warning";
      badge = "WARNING";
      icon = "&#9888;";

      description =
        "Elevated fire-like signature detected. Monitoring closely for confirmation.";
    }

    el.overallStatus.dataset.state =
      stateName;

    el.overallIcon.innerHTML =
      icon;

    el.overallBadge.textContent =
      badge;

    el.overallDesc.textContent =
      description;

    el.overallUpdated.textContent =
      "Updated just now";

    const coreColorVar =
      stateName === "danger"
        ? "var(--accent-ember-500)"
        : stateName === "warning"
        ? "var(--accent-amber-500)"
        : "var(--accent-fire-500)";

    const ring =
      el.heroCore?.querySelector(
        ".ring--inner"
      );

    const coreLabel =
      el.heroCore?.querySelector(
        ".sensor-core__label"
      );

    if (ring) {
      ring.style.stroke =
        coreColorVar;
    }

    if (el.heroCoreValue) {
      el.heroCoreValue.textContent =
        `${topValue}%`;

      el.heroCoreValue.style.color =
        coreColorVar;
    }

    if (coreLabel) {
      coreLabel.textContent =
        stateName === "safe"
          ? "Normal Air"
          : `${
              topLabel
                .charAt(0)
                .toUpperCase() +
              topLabel.slice(1)
            } Signature`;
    }

    return stateName;
  }

  function pushAlertIfNeeded(
    stateName,
    topLabel,
    topValue
  ) {
    const last =
      state.alerts[0];

    const changed =
      !last ||
      last._stateName !==
        stateName;

    if (!changed) {
      return;
    }

    const now = new Date();

    const time =
      now.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }
      );

    let severity = "info";

    let description =
      "System status returned to normal.";

    if (stateName === "danger") {
      severity = "danger";

      description =
        `Fire signature confirmed at ${topValue}% confidence. ` +
        "Immediate response required.";
    } else if (
      stateName === "warning"
    ) {
      severity = "warning";

      description =
        `Fire-like signature rising (${topValue}% confidence). ` +
        "Investigating source.";
    } else if (last) {
      severity = "info";

      description =
        "All readings back within safe operating range.";
    } else {
      return;
    }

    state.alerts.unshift({
      time,
      severity,
      description,
      _stateName: stateName,
    });

    if (
      state.alerts.length > 25
    ) {
      state.alerts.pop();
    }
  }

  /* =========================================================
     CLOCK
     ========================================================= */
  function updateClock() {
    const now = new Date();

    el.liveClock.textContent =
      now.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }
      );
  }

  /* =========================================================
     MAIN UPDATE LOOP
     ========================================================= */
  async function refreshDashboard() {
    DataService.tick();

    const [
      sensors,
      environment,
      classification,
    ] = await Promise.all([
      DataService.getSensorHealth(),
      DataService.getEnvironmentalReadings(),
      DataService.getAIClassification(),
    ]);

    renderSensorHealth(
      sensors
    );

    renderEnvironmentalReadings(
      environment
    );

    const {
      topLabel,
      topValue,
    } = renderAIClassification(
      classification
    );

    const stateName =
      renderOverallStatus(
        topLabel,
        topValue
      );

    pushAlertIfNeeded(
      stateName,
      topLabel,
      topValue
    );

    Camera.updateOverlay(
      topLabel,
      topValue,
      stateName
    );

    const alerts =
      await DataService.getAlerts();

    renderAlerts(alerts);
  }

  /* =========================================================
     DEMO MODE CONTROLS
     ========================================================= */
  function enableDemoMode() {
    DataService.setDemoMode(
      true
    );

    el.demoModeBtn.disabled =
      true;

    el.resetModeBtn.disabled =
      false;

    el.demoModeBtn.textContent =
      "Simulating Fire Event…";
  }

  function disableDemoMode() {
    DataService.setDemoMode(
      false
    );

    el.demoModeBtn.disabled =
      false;

    el.resetModeBtn.disabled =
      true;

    el.demoModeBtn.innerHTML =
      '<span class="btn__icon" aria-hidden="true">&#9889;</span> Simulate Fire Event';
  }

  el.demoModeBtn.addEventListener(
    "click",
    enableDemoMode
  );

  el.resetModeBtn.addEventListener(
    "click",
    disableDemoMode
  );

  /* =========================================================
     INITIALIZATION
     ========================================================= */
  function init() {
    updateClock();
    refreshDashboard();
    Camera.start();

    window.setInterval(
      updateClock,
      1000
    );

    window.setInterval(
      refreshDashboard,
      UPDATE_INTERVAL_MS
    );
  }

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();