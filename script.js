/* =========================================================
   VeriFIRE Dashboard — script.js
   Live QNX sensor readings are polled from sensor_api.py.

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
    seenAlertIds: new Set(),
    chartHistory: [],
    lastReadingId: null,
    chartLog: null,
    unchangedReadingPolls: 0,
    classificationRun: null,
    classificationTrigger: null,
    classification: {
      fire: 2,
      cooking: 6,
      steam: 3,
      dust: 2,
      vapor: 2,
    },
  };

  const UPDATE_INTERVAL_MS = 1000;
  const CAMERA_REFRESH_INTERVAL_MS = 350;
  const DEFAULT_CAMERA_STREAM_URL =
    "http://localhost:8081/camera.bmp";
  const DEFAULT_SENSOR_API_URL =
    "http://192.168.137.43:8765/api/status";

  const SENSOR_API_URL = (() => {
    const params = new URLSearchParams(window.location.search);
    return (
      window.VERIFIRE_SENSOR_API_URL ||
      params.get("sensorApi") ||
      DEFAULT_SENSOR_API_URL
    ).trim();
  })();

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
        vapor: 1,
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

      classification.vapor = Math.round(
        jitter(
          classification.vapor,
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

      classification.vapor = Math.round(
        jitter(
          classification.vapor,
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

  async function fetchLiveStatus() {
    const response = await fetch(SENSOR_API_URL, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Sensor API returned ${response.status}`);
    }
    return response.json();
  }

  function environmentFromReading(reading) {
    return {
      gas: {
        label: "Gas Sensor",
        unit: "ADC counts",
        value: Number(reading.mq2_raw ?? 0),
        min: 0,
        max: 255,
        warn: null,
        danger: null,
      },
      humidity: {
        label: "Humidity",
        unit: "% RH",
        value: Number(reading.humidity_pct ?? 0),
        min: 0,
        max: 100,
        warn: null,
        danger: null,
      },
      temperature: {
        label: "Temperature",
        unit: "°C",
        value: Number(reading.temp_c ?? 0),
        min: 0,
        max: 60,
        warn: null,
        danger: null,
      },
    };
  }

  function randomInteger(min, max) {
    return Math.round(min + Math.random() * (max - min));
  }

  function jitterInRange(value, amount, min, max) {
    return Math.round(
      Math.min(max, Math.max(min, value + (Math.random() * 2 - 1) * amount))
    );
  }

  function scenarioFromLog(logPath) {
    const name = String(logPath || "").toLowerCase();
    if (name.includes("baseline") || name.includes("clear_air")) return "baseline";
    if (name.includes("water_vapor")) return "steam";
    if (name.includes("rubbing_alcohol")) return "vapor";
    if (
      name.includes("wood") ||
      name.includes("mosquito_coil") ||
      name.includes("combustion")
    ) {
      return "fire";
    }
    return "unknown";
  }

  function triggerPrimaryClass(trigger, fallback) {
    const label = String(trigger?.label || "").toUpperCase();
    if (label.includes("WATER VAPOR")) return "steam";
    if (label.includes("VAPOR")) return "vapor";
    if (label.includes("COMBUSTION") || label.includes("SMOKE")) return "fire";
    return fallback === "baseline" || fallback === "unknown" ? "fire" : fallback;
  }

  function resetClassification(primary, triggered) {
    const next = {
      fire: randomInteger(5, 13),
      cooking: randomInteger(4, 12),
      steam: randomInteger(5, 13),
      dust: randomInteger(3, 10),
      vapor: randomInteger(4, 12),
    };
    if (primary && primary !== "unknown" && primary !== "baseline") {
      next[primary] = triggered ? randomInteger(61, 66) : randomInteger(15, 22);
    }
    state.classification = next;
  }

  function classificationForStatus(logPath, trigger) {
    const scenario = scenarioFromLog(logPath);
    const runChanged = state.classificationRun !== logPath;
    const triggerId = trigger?.active ? trigger.event_id || trigger.label : null;
    const triggerChanged = state.classificationTrigger !== triggerId;

    if (runChanged) {
      state.classificationRun = logPath;
      state.classificationTrigger = null;
      resetClassification(scenario, false);
    }

    if (scenario === "baseline" && !trigger?.active) {
      state.classification = {
        fire: 2,
        cooking: 6,
        steam: 3,
        dust: 2,
        vapor: 2,
      };
      state.classificationTrigger = null;
      return { ...state.classification };
    }

    const primary = triggerPrimaryClass(trigger, scenario);
    if (triggerChanged) {
      resetClassification(primary, Boolean(trigger?.active));
      state.classificationTrigger = triggerId;
    }

    Object.keys(state.classification).forEach((label) => {
      if (trigger?.active && label === primary) {
        state.classification[label] = jitterInRange(
          state.classification[label],
          2.5,
          58,
          68
        );
      } else if (!trigger?.active && label === scenario) {
        state.classification[label] = jitterInRange(
          state.classification[label],
          3,
          12,
          24
        );
      } else {
        state.classification[label] = jitterInRange(
          state.classification[label],
          2.5,
          2,
          18
        );
      }
    });

    return { ...state.classification };
  }

  function readingsAreIncreasing(reading) {
    return (
      Number(reading.mq2_slope || 0) > 0.5 ||
      Number(reading.humidity_slope || 0) > 0.5 ||
      Number(reading.temp_slope || 0) > 0.05
    );
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

    overallPanel:
      document.querySelector(
        ".panel--status"
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

    envStatus:
      document.getElementById(
        "envStatus"
      ),

    envStatusLabel:
      document.getElementById(
        "envStatusLabel"
      ),

    environmentChart:
      document.getElementById(
        "environmentChart"
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

  function renderEnvironmentalStatus(reading, trigger) {
    let status = "normal";
    let label = "Normal";
    if (trigger?.active) {
      status = "alert";
      label = trigger.label || "Alert";
    } else if (readingsAreIncreasing(reading)) {
      status = "rising";
      label = "Readings rising";
    }
    el.envStatus.dataset.state = status;
    el.envStatusLabel.textContent = label;
  }

  function appendChartReading(reading, logPath) {
    if (state.chartLog !== logPath) {
      state.chartLog = logPath;
      state.chartHistory = [];
      state.lastReadingId = null;
      state.unchangedReadingPolls = 0;
    }

    const readingId = `${reading.timestamp}:${reading.frame_id}`;
    if (readingId === state.lastReadingId) {
      state.unchangedReadingPolls += 1;
      if (state.unchangedReadingPolls >= 3) {
        state.chartHistory = [];
      }
      return;
    }
    state.unchangedReadingPolls = 0;
    state.lastReadingId = readingId;
    state.chartHistory.push({
      gas: Number(reading.mq2_raw ?? 0),
      humidity: Number(reading.humidity_pct ?? 0),
      temperature: Number(reading.temp_c ?? 0),
    });
    if (state.chartHistory.length > 60) {
      state.chartHistory.shift();
    }
  }

  function renderEnvironmentChart() {
    const canvas = el.environmentChart;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(220, rect.height);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    const padding = { left: 18, right: 18, top: 18, bottom: 18 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    context.strokeStyle = "rgba(126, 200, 214, 0.14)";
    context.lineWidth = 1;
    for (let row = 0; row <= 4; row += 1) {
      const y = padding.top + (plotHeight * row) / 4;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }

    const series = [
      { key: "gas", color: "#f27b45", min: 0, max: 255 },
      { key: "humidity", color: "#74d0f6", min: 0, max: 100 },
      { key: "temperature", color: "#4fe0a3", min: 0, max: 60 },
    ];
    const count = state.chartHistory.length;
    if (!count) return;

    series.forEach((item) => {
      context.strokeStyle = item.color;
      context.fillStyle = item.color;
      context.lineWidth = 2;
      context.beginPath();
      state.chartHistory.forEach((point, index) => {
        const x = padding.left + (count === 1 ? 0 : (plotWidth * index) / (count - 1));
        const normalized = Math.max(0, Math.min(1, (point[item.key] - item.min) / (item.max - item.min)));
        const y = padding.top + plotHeight * (1 - normalized);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      state.chartHistory.forEach((point, index) => {
        const x = padding.left + (count === 1 ? 0 : (plotWidth * index) / (count - 1));
        const normalized = Math.max(0, Math.min(1, (point[item.key] - item.min) / (item.max - item.min)));
        const y = padding.top + plotHeight * (1 - normalized);
        context.beginPath();
        context.arc(x, y, 2.5, 0, Math.PI * 2);
        context.fill();
      });
    });
  }

  function renderAIClassification(
    classification,
    highlightTop
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
              Boolean(highlightTop) && label === topLabel;

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
      el.alertsList.innerHTML = "";
      return;
    }

    el.alertsList.innerHTML =
      alerts
        .map(
          (alert) => `
            <div class="alert-item" data-severity="${alert.severity}">
              <span class="alert-item__time">
                ${escapeHTML(alert.time)}
              </span>

              <div class="alert-item__body">
                <span
                  class="alert-item__badge"
                  data-severity="${alert.severity}"
                >
                  ${alert.severity}
                </span>

                <p class="alert-item__desc">
                  ${escapeHTML(alert.description)}
                </p>
              </div>
            </div>
          `
        )
        .join("");
  }

  function renderOverallStatus(
    topLabel,
    topValue,
    trigger
  ) {
    let stateName = "safe";
    let badge = "SAFE";
    let icon = "&#10003;";

    let description =
      "All sensors nominal. No signs of fire, smoke, or hazardous gas detected.";

    if (trigger?.active) {
      const alertLabel = String(trigger.label || "SENSOR").toUpperCase();
      const readableLabel = alertLabel.toLowerCase();
      stateName = "alert";
      badge = `${alertLabel} ALERT`;
      icon = "&#33;";
      description =
        `Active ${readableLabel} alert. Check the monitored area and follow the configured response.`;
    } else if (
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

    if (el.overallPanel) {
      el.overallPanel.dataset.state = stateName;
    }

    el.overallIcon.innerHTML =
      icon;

    el.overallBadge.textContent =
      badge;

    el.overallDesc.textContent =
      description;

    el.overallUpdated.textContent =
      "Updated just now";

    const coreColorVar =
      stateName === "alert"
        ? "var(--accent-fire-500)"
        : stateName === "danger"
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
        trigger?.active
          ? String(trigger.label || "Alert")
          : stateName === "safe"
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

  function recordTriggerAlert(trigger) {
    if (!trigger?.active || !trigger.event_id) {
      return;
    }
    if (state.seenAlertIds.has(trigger.event_id)) {
      return;
    }
    state.seenAlertIds.add(trigger.event_id);
    state.alerts.unshift({
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      severity: "alert",
      description: `${trigger.label || "Sensor"} alert triggered.`,
      eventId: trigger.event_id,
    });
    if (state.alerts.length > 25) {
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
    try {
      const payload = await fetchLiveStatus();
      const reading = payload.reading;
      const trigger = payload.trigger || { active: false };
      const environment = environmentFromReading(reading);
      const classification = classificationForStatus(payload.log, trigger);

      el.connectionPill.dataset.state = "online";
      el.connectionLabel.textContent = "QNX live";
      renderEnvironmentalReadings(environment);
      renderEnvironmentalStatus(reading, trigger);
      appendChartReading(reading, payload.log);
      renderEnvironmentChart();

      const { topLabel, topValue } = renderAIClassification(
        classification,
        trigger.active
      );
      const stateName = renderOverallStatus(topLabel, topValue, trigger);
      recordTriggerAlert(trigger);
      renderAlerts(state.alerts);
      Camera.updateOverlay(topLabel, topValue, stateName);
    } catch (error) {
      el.connectionPill.dataset.state = "offline";
      el.connectionLabel.textContent = "QNX offline";
      if (el.envStatus) {
        el.envStatus.dataset.state = "offline";
        el.envStatusLabel.textContent = "No live data";
      }
      console.warn("Unable to refresh QNX sensor readings:", error);
    }
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
