// ---------- LOGIN + WELCOME + TABS FLOW ----------

document.addEventListener("DOMContentLoaded", () => {
  const loginScreen = document.getElementById("login-screen");
  const welcomeScreen = document.getElementById("welcome-screen");
  const appMain = document.getElementById("app-main");

  const loginBtn = document.getElementById("login-btn");
  const loginError = document.getElementById("login-error");
  const enterAppBtn = document.getElementById("enter-app-btn");

  const VALID_USERNAME = "admin";
  const VALID_PASSWORD = "12345";

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const u = document.getElementById("username").value.trim();
      const p = document.getElementById("password").value.trim();

      if (u === VALID_USERNAME && p === VALID_PASSWORD) {
        loginScreen.classList.add("hidden");
        welcomeScreen.classList.remove("hidden");
        loginError.classList.add("hidden");
        window.scrollTo(0, 0);
      } else {
        loginError.classList.remove("hidden");
      }
    });
  }

  if (enterAppBtn) {
    enterAppBtn.addEventListener("click", () => {
      welcomeScreen.classList.add("hidden");
      appMain.classList.remove("hidden");
      window.scrollTo(0, 0);
    });
  }

  const tabButtons = document.querySelectorAll(".tab-btn");
  const pages = document.querySelectorAll(".page-section");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      pages.forEach((p) => {
        if (p.id === targetId) p.classList.remove("hidden");
        else p.classList.add("hidden");
      });

      window.scrollTo(0, 0);
    });
  });
});

// ---------- FORECASTING LOGIC ----------

const API_URL_FILE = "http://127.0.0.1:5000/api/predict-file";

const fileInput = document.getElementById("file-input");
const horizonValueInput = document.getElementById("horizon-value");
const horizonUnitSelect = document.getElementById("horizon-unit");
const tariffInput = document.getElementById("tariff-input");
const uploadBtn = document.getElementById("upload-predict-btn");
const weatherSelect = document.getElementById("weather-select");
const usageSelect = document.getElementById("usage-type");

const backendStatus = document.getElementById("backend-status");
const errorText = document.getElementById("error-text");
const summaryText = document.getElementById("summary-text");
const costInfo = document.getElementById("cost-info");
const todSummary = document.getElementById("tod-summary");
const tableBody = document.getElementById("forecast-table-body");
const safetyList = document.getElementById("safety-list");

const downloadCSVBtn = document.getElementById("download-btn");
const downloadGraphBtn = document.getElementById("download-graph-btn");
const chartCanvas = document.getElementById("historyChart");
const seasonCanvas = document.getElementById("seasonChart");

let historyChart = null;
let seasonChart = null;
let lastResponse = null;

const TIME_BLOCK_KEYS = ["morning", "afternoon", "evening", "night"];

// backend check
if (backendStatus) {
  fetch("http://127.0.0.1:5000/")
    .then(() => {
      backendStatus.textContent = "Backend: connected (localhost:5000)";
    })
    .catch(() => {
      backendStatus.textContent = "Backend: not reachable";
      backendStatus.style.borderColor = "#ef4444";
      backendStatus.style.color = "#fecaca";
    });
}

if (uploadBtn) {
  uploadBtn.addEventListener("click", async () => {
    hideMessages();

    const file = fileInput.files[0];
    if (!file) {
      showError("Please select a CSV file.");
      return;
    }

    const hv = parseFloat(horizonValueInput.value);
    if (!hv || hv <= 0) {
      showError("Enter a positive forecast range value (e.g. 24 hours, 7 days).");
      return;
    }

    const unit = horizonUnitSelect.value;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("horizon_value", hv.toString());
    formData.append("horizon_unit", unit);

    if (weatherSelect && weatherSelect.value) {
      formData.append("weather_condition", weatherSelect.value);
    }

    const tariffVal = parseFloat(tariffInput.value);
    if (!isNaN(tariffVal) && tariffVal > 0) {
      formData.append("tariff_rate", tariffVal.toString());
    }

    if (usageSelect && usageSelect.value) {
      formData.append("usage_type", usageSelect.value);
    }

    resetResults();

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Analyzing…";
    uploadBtn.style.opacity = "0.7";

    try {
      const resp = await fetch(API_URL_FILE, {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok) {
        showError(data.error || "Backend error.");
        return;
      }

      lastResponse = data;
      renderResults(data);
    } catch (err) {
      console.error(err);
      showError("Error connecting to backend. Make sure Flask server is running.");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Run Forecast";
      uploadBtn.style.opacity = "1";
    }
  });
}

function renderResults(data) {
  const {
    history,
    future,
    future_times,
    horizon_value,
    horizon_unit,
    base_interval_hours,
    tariff_rate,
    cost_per_step: costPerStep,
    total_cost,
    next_value,
    advice,
    peak_flags,
    season_months,
    season_month_avgs,
    usage_levels,
    time_blocks,
    weather_condition,
    usage_profile_label,
    profile_severity,
    profile_ratio,
  } = data;

  // Severity from advice text (local) + profile severity from backend
  let severity = "NORMAL";
  const advUpper = (advice || "").toUpperCase();
  if (advUpper.includes("VERY HIGH") || advUpper.includes("HIGH")) {
    severity = "HIGH";
  } else if (advUpper.includes("LOW")) {
    severity = "LOW";
  }

  let trendText = "Not clearly defined";
  const advLower = (advice || "").toLowerCase();
  if (advLower.includes("rising")) trendText = "Increasing demand 📈";
  else if (advLower.includes("falling")) trendText = "Decreasing demand 📉";
  else if (advLower.includes("stable")) trendText = "Relatively stable ➖";

  let weatherImpact;
  const wc = (weather_condition || "").toLowerCase();
  if (wc === "hot") {
    weatherImpact = "Hot / Summer 🌞 — cooling (AC/fans) increasing demand";
  } else if (wc === "cold") {
    weatherImpact = "Cold / Winter ❄ — heater load increasing";
  } else if (wc === "rainy") {
    weatherImpact = "Rainy / Monsoon 🌧 — lighting & pump usage increasing";
  } else {
    weatherImpact = "Normal conditions — no strong weather impact";
  }

  const profileText = usage_profile_label || "Single household";
  const sevProfile = profile_severity || "NORMAL";
  const ratioPct =
    typeof profile_ratio === "number"
      ? (profile_ratio * 100).toFixed(1) + "%"
      : "—";

  summaryText.textContent =
    `Load Forecast Alert — Severity: ${severity} 🔺\n` +
    `Profile: ${profileText} · Profile severity: ${sevProfile} · Compared to typical: ${ratioPct}\n` +
    `Interval: ${base_interval_hours.toFixed(2)} h | Horizon: next ${horizon_value} ${horizon_unit}\n` +
    `Forecasted Next Load: ${next_value.toFixed(2)} kWh\n` +
    `Trend: ${trendText}\n` +
    `Weather Impact: ${weatherImpact}\n` +
    `Recommended: Shift non-essential loads from peak slots and avoid running multiple heavy appliances together.`;

  costInfo.textContent =
    `Tariff: ₹${tariff_rate.toFixed(2)} per kWh · ` +
    `Estimated cost for forecast horizon: ₹${total_cost.toFixed(2)}.`;

  updateTimeOfDaySummary(future, time_blocks);
  drawHistoryChart(history, future, peak_flags);
  renderTable(future, future_times, costPerStep, peak_flags, usage_levels);
  drawSeasonChart(season_months, season_month_avgs);
  updateSafetyPanel({ ...data, time_blocks, weather_condition });
}

/* ---------- Time-of-day summary ---------- */

function updateTimeOfDaySummary(future, timeBlocks) {
  if (!future || !timeBlocks || future.length === 0) {
    todSummary.textContent = "";
    return;
  }

  const sums = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const counts = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  let total = 0;
  for (let i = 0; i < future.length; i++) {
    const v = future[i];
    const b = timeBlocks[i];
    total += v;
    if (Object.hasOwn(sums, b)) {
      sums[b] += v;
      counts[b] += 1;
    }
  }

  if (total <= 0) {
    todSummary.textContent = "";
    return;
  }

  const fmt = (x) => x.toFixed(2);
  const pct = (x) => ((x / total) * 100).toFixed(1);

  const parts = TIME_BLOCK_KEYS
    .filter((key) => counts[key] > 0)
    .map((key) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      return `${label}: ${fmt(sums[key])} kWh (${pct(sums[key])}%)`;
    });

  todSummary.textContent =
    "Forecast usage by time of day → " + parts.join(" · ");
}

/* ---------- Charts (unchanged logic) ---------- */

function drawHistoryChart(history, future, peakFlags) {
  if (!chartCanvas) return;
  if (historyChart) historyChart.destroy();

  const maxFuturePoints = 500;
  let fut = [...future];
  let peak = peakFlags ? [...peakFlags] : new Array(future.length).fill(false);
  let stepFactor = 1;

  if (fut.length > maxFuturePoints) {
    const factor = Math.ceil(fut.length / maxFuturePoints);
    stepFactor = factor;
    const futDS = [];
    const peakDS = [];
    for (let i = 0; i < fut.length; i += factor) {
      futDS.push(fut[i]);
      peakDS.push(peak[i]);
    }
    fut = futDS;
    peak = peakDS;
  }

  const histLabels = history.map((_, i) => `H-${history.length - i}`);
  const futureLabels = fut.map((_, idx) => `F+${idx * stepFactor + 1}`);
  const labels = [...histLabels, ...futureLabels];

  const histData = [...history, ...Array(fut.length).fill(null)];
  const futData = [...Array(history.length).fill(null), ...fut];
  const peakData = [...Array(history.length).fill(null)];

  fut.forEach((v, i) => {
    peakData.push(peak && peak[i] ? v : null);
  });

  historyChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "History (kWh)", data: histData, tension: 0.25 },
        { label: "Forecast (kWh)", data: futData, tension: 0.25 },
        { label: "Peak forecast (18–22h)", data: peakData, tension: 0.25 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        x: {
          title: {
            display: true,
            text:
              "Time steps (H = history, F = forecast; future may be downsampled)",
          },
          ticks: { maxTicksLimit: 15 },
        },
        y: {
          title: { display: true, text: "Consumption (kWh)" },
        },
      },
    },
  });
}

function drawSeasonChart(months, monthAvgs) {
  if (!seasonCanvas) return;
  if (seasonChart) seasonChart.destroy();
  if (!months || !monthAvgs || months.length === 0) return;

  const monthNames = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec"
  ];
  const labels = months.map((m) => monthNames[(m - 1) % 12]);

  seasonChart = new Chart(seasonCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Average consumption per month (kWh)",
          data: monthAvgs,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Month" } },
        y: { title: { display: true, text: "Avg Consumption (kWh)" } },
      },
    },
  });
}

/* ---------- Table & CSV (same idea) ---------- */

function statusTextFromLevel(level, isPeak) {
  let levelText;
  switch (level) {
    case "very_high": levelText = "Very High usage"; break;
    case "high":      levelText = "High usage"; break;
    case "low":       levelText = "Low usage"; break;
    case "very_low":  levelText = "Very Low usage"; break;
    default:          levelText = "Normal usage"; break;
  }
  if (isPeak) levelText += " · PEAK hour";
  return levelText;
}

function renderTable(future, times, costPerStep, peakFlags, usageLevels) {
  tableBody.innerHTML = "";
  if (!future || !times || !costPerStep) return;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < future.length; i++) {
    const tr = document.createElement("tr");

    const tdTime = document.createElement("td");
    tdTime.textContent = formatTime(times[i]);

    const tdVal = document.createElement("td");
    tdVal.textContent = future[i].toFixed(2);

    const tdCost = document.createElement("td");
    tdCost.textContent = costPerStep[i].toFixed(2);

    const tdStatus = document.createElement("td");
    const isPeak = peakFlags && peakFlags[i];
    const level = usageLevels && usageLevels[i] ? usageLevels[i] : "normal";
    const statusText = statusTextFromLevel(level, isPeak);
    tdStatus.textContent = statusText;

    if (level === "very_high" || level === "high") {
      tr.style.color = "#f97316";
    } else if (level === "very_low" || level === "low") {
      tr.style.color = "#22c55e";
    }
    if (isPeak) tr.style.fontWeight = "600";

    tr.appendChild(tdTime);
    tr.appendChild(tdVal);
    tr.appendChild(tdCost);
    tr.appendChild(tdStatus);
    fragment.appendChild(tr);
  }

  tableBody.appendChild(fragment);
}

if (downloadCSVBtn) {
  downloadCSVBtn.addEventListener("click", () => {
    if (!lastResponse) {
      alert("No forecast data available.");
      return;
    }

    const {
      future,
      future_times,
      cost_per_step,
      peak_flags,
      usage_levels,
    } = lastResponse;

    const rows = ["DateTime,Predicted_kWh,Cost_Rupees,Status"];

    future.forEach((v, i) => {
      const isPeak = peak_flags && peak_flags[i];
      const level = usage_levels && usage_levels[i] ? usage_levels[i] : "normal";
      const statusText = statusTextFromLevel(level, isPeak);

      rows.push(
        `${future_times[i]},${v.toFixed(4)},${cost_per_step[i].toFixed(2)},${statusText}`
      );
    });

    triggerDownload(rows.join("\n"), "electricity_forecast_results.csv", "text/csv");
  });
}

if (downloadGraphBtn) {
  downloadGraphBtn.addEventListener("click", () => {
    if (!historyChart) {
      alert("No graph available.");
      return;
    }
    const url = historyChart.toBase64Image();
    triggerDownload(url, "electricity_forecast_graph.png", "image/png");
  });
}

/* ---------- Safety panel (unchanged behaviour) ---------- */

function updateSafetyPanel(data) {
  safetyList.innerHTML = "";

  // No data yet
  if (!data || !data.future || data.future.length === 0) {
    safetyList.innerHTML = `
      <li class="safety-item-header">
        ⚡ 5-Point Safety & Energy Summary
      </li>
      <li class="safety-item">
        <span class="bullet-icon">⚡</span>
        • 📊 Run a forecast to view safety and control measures.
      </li>
    `;
    return;
  }

  const future = data.future;
  const tariff = data.tariff_rate || 0;
  const totalCost = data.total_cost || 0;
  const weather = (data.weather_condition || "").toLowerCase();

  // ---------- 1. Determine GLOBAL severity (HIGH / NORMAL / LOW) ----------
  let globalSeverity = "NORMAL";

  const adviceText = (data.advice || "").toUpperCase();
  if (adviceText.includes("VERY HIGH") || adviceText.includes("HIGH")) {
    globalSeverity = "HIGH";
  } else if (adviceText.includes("LOW")) {
    globalSeverity = "LOW";
  }

  const profileSev = (data.profile_severity || "").toUpperCase();
  if (profileSev === "HIGH") {
    globalSeverity = "HIGH";
  } else if (profileSev === "LOW" && globalSeverity !== "HIGH") {
    globalSeverity = "LOW";
  }

  // ---------- 2. Build bullets based on GLOBAL severity ----------
  let bullets = [];

  if (globalSeverity === "HIGH") {
    // High usage / risk
    bullets = [
      "• ⚠ High load predicted — avoid AC, heater and pump together",
      "• 🔌 Switch OFF all non-essential lights, fans and appliances",
      "• 🧯 If sockets or cables feel warm, immediately reduce the load",
      "• ⏱ Shift washing, ironing and EV charging to low-usage hours",
      `• 💰 High bill expected — approx ₹${totalCost.toFixed(
        2
      )} at ₹${tariff.toFixed(2)}/kWh`,
    ];
  } else if (globalSeverity === "LOW") {
    // Low, safe usage
    bullets = [
      "• ✅ Usage is low — continue current safe consumption habits",
      "• 🔌 Still switch OFF idle chargers, TVs and standby devices",
      "• 🧼 Use this period to safely clean vents of AC, fridge, etc. (power OFF)",
      "• 🔍 Occasionally inspect plugs, sockets and extension cords",
      "• 🌱 Great for environment — try to maintain this efficient level",
    ];
  } else {
    // NORMAL usage
    bullets = [
      "• 💡 Maintain current usage but avoid obvious wastage",
      "• 🔌 Turn OFF unused fans, lights and appliances",
      "• ⏱ Run heavy appliances in non-peak hours where possible",
      "• 🧯 Periodically inspect wiring, plugs and sockets",
      "• 🧒 Keep children away from DB panel and exposed wiring",
    ];
  }

  // ---------- 3. Adjust first bullet for weather condition ----------
  if (weather === "hot") {
    bullets[0] =
      "• 🌞 Hot weather — limit AC/cooler on the same circuit, keep doors & windows closed";
  } else if (weather === "cold") {
    bullets[0] =
      "• ❄ Cold weather — room heaters draw high current, use only one per socket";
  } else if (weather === "rainy") {
    bullets[0] =
      "• 🌧 Rainy weather — keep switches dry and avoid operating pumps with wet hands";
  }

  // ---------- 4. Render nicely in the panel ----------
  const severityType =
    globalSeverity === "HIGH" ? "high" : globalSeverity === "LOW" ? "normal" : "info";

  safetyList.innerHTML = `
    <li class="safety-item-header">
      ⚡ 5-Point Safety & Energy Summary
    </li>
    ${bullets
      .map(
        (b) => `
      <li class="safety-item">
        <span class="bullet-icon ${severityType}">⚡</span> ${b}
      </li>
    `
      )
      .join("")}
  `;
}


/* ---------- Helpers ---------- */

function triggerDownload(data, filename, type) {
  const a = document.createElement("a");
  let objectUrl = null;
  if (type && type.startsWith("image")) {
    a.href = data;
  } else {
    objectUrl = URL.createObjectURL(new Blob([data], { type: type || "text/plain" }));
    a.href = objectUrl;
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatTime(t) {
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return d.toLocaleString();
}

function showError(msg) {
  errorText.textContent = msg;
  errorText.style.display = "block";
}

function hideMessages() {
  errorText.style.display = "none";
}

function resetResults() {
  summaryText.textContent = "";
  costInfo.textContent = "";
  todSummary.textContent = "";
  tableBody.innerHTML = "";
  safetyList.innerHTML = "";
  lastResponse = null;

  if (historyChart) {
    historyChart.destroy();
    historyChart = null;
  }
  if (seasonChart) {
    seasonChart.destroy();
    seasonChart = null;
  }
}
