from datetime import timedelta

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

import model_utils as mu

app = Flask(__name__)
CORS(app)

SEQ_LEN = mu.WINDOW_SIZE
MAX_ROWS = 50000
MAX_STEPS = 200

mu.load_artifacts()

# ---------- HYBRID USAGE PROFILES (monthly averages in kWh) ----------
USAGE_PROFILES = {
    "household": {
        "label": "Single household",
        "monthly_typical": 150.0,
    },
    "apartment": {
        "label": "Apartment building",
        "monthly_typical": 20000.0,
    },
    "industrial": {
        "label": "Industrial consumer",
        "monthly_typical": 200000.0,
    },
}


def compute_base_interval_hours(df: pd.DataFrame) -> float:
    dt = df["DateTime"].sort_values().diff().dropna()
    try:
        base = dt.mode().iloc[0]
    except Exception:
        base = dt.mean()
    return base.total_seconds() / 3600.0


def compute_total_hours(h_value: int, h_unit: str) -> float:
    unit = (h_unit or "hours").lower()
    if unit == "hours":
        return float(h_value)
    if unit == "days":
        return float(h_value) * 24.0
    if unit == "months":
        return float(h_value) * 30.0 * 24.0
    if unit == "years":
        return float(h_value) * 365.0 * 24.0
    return float(h_value)


def categorize_usage(values: np.ndarray):
    q10, q25, q75, q90 = np.percentile(values, [10, 25, 75, 90])

    def cat(v):
        if v >= q90:
            return "very_high"
        if v >= q75:
            return "high"
        if v <= q10:
            return "very_low"
        if v <= q25:
            return "low"
        return "normal"

    return [cat(v) for v in values]


def build_advice(preds: np.ndarray, next_value: float) -> str:
    n = min(len(preds), 30)
    y = preds[-n:]
    x = np.arange(n)
    slope = np.polyfit(x, y, 1)[0]

    q10, q25, q75, q90 = np.percentile(preds, [10, 25, 75, 90])
    if next_value >= q90:
        level = "VERY HIGH"
    elif next_value >= q75:
        level = "HIGH"
    elif next_value <= q10:
        level = "VERY LOW"
    elif next_value <= q25:
        level = "LOW"
    else:
        level = "NORMAL"

    if slope > 0:
        trend = "rising"
    elif slope < 0:
        trend = "falling"
    else:
        trend = "stable"

    return f"Current load level is {level}. Recent trend is {trend}."


def classify_profile_usage(total_kwh: float, total_hours: float, usage_type: str):
    profile = USAGE_PROFILES.get(usage_type, USAGE_PROFILES["household"])
    typical_monthly = profile["monthly_typical"]

    months = total_hours / (24.0 * 30.0)
    expected = typical_monthly * months if months > 0 else typical_monthly
    ratio = total_kwh / expected if expected > 0 else 0.0

    if ratio < 0.8:
        severity = "LOW"
    elif ratio <= 1.2:
        severity = "NORMAL"
    elif ratio <= 1.5:
        severity = "HIGH"
    else:
        severity = "CRITICAL"

    return severity, ratio, profile["label"]


@app.route("/", methods=["GET"])
def home():
    return "Electricity Forecast API running."


@app.route("/api/predict-file", methods=["POST"])
def predict_file():
    try:
        file = request.files.get("file")
        if file is None:
            return jsonify({"error": "No CSV file uploaded."}), 400

        horizon_value = int(request.form.get("horizon_value", 24))
        horizon_unit = request.form.get("horizon_unit", "hours")
        weather_condition = request.form.get("weather_condition", "").lower()
        tariff_rate = float(request.form.get("tariff_rate", 0) or 0)
        usage_type = request.form.get("usage_type", "household")

        df = pd.read_csv(
            file,
            usecols=["DateTime", "Consumption_KWh"],
            parse_dates=["DateTime"],
        ).sort_values("DateTime")

        if len(df) > MAX_ROWS:
            df = df.tail(MAX_ROWS).copy()

        df = df.dropna(subset=["Consumption_KWh"])
        if len(df) <= SEQ_LEN:
            return jsonify({"error": "Not enough data rows after cleaning."}), 400

        base_interval_hours = compute_base_interval_hours(df)
        total_hours = compute_total_hours(horizon_value, horizon_unit)
        step_hours = max(base_interval_hours, total_hours / MAX_STEPS)
        steps = int(np.ceil(total_hours / step_hours))

        values = df["Consumption_KWh"].to_numpy(dtype=float)
        preds_scaled = mu.predict_multi_scaled(values, steps)
        preds_scaled = np.clip(preds_scaled, 0.0, 1.0)
        preds = mu.inverse_transform_predictions(preds_scaled)

        hist_min = float(values.min())
        hist_max = float(values.max())
        lower = max(0.0, hist_min * 0.5)
        upper = hist_max * 2.0
        preds = np.clip(preds, lower, upper)

        last_time = df["DateTime"].iloc[-1]
        future_times = [
            last_time + timedelta(hours=step_hours * (i + 1))
            for i in range(steps)
        ]

        idx = pd.DatetimeIndex(future_times)
        hours = idx.hour.to_numpy()
        dow = idx.dayofweek.to_numpy()

        daily_wave = (
            1.0
            + 0.25 * np.sin(2 * np.pi * (hours - 7) / 24.0)
            + 0.35 * np.sin(2 * np.pi * (hours - 19) / 24.0)
        )
        daily_wave = np.clip(daily_wave, 0.7, 1.4)
        weekly_wave = 1.0 + 0.15 * np.sin(2 * np.pi * dow / 7.0)
        noise = np.random.normal(1.0, 0.05, len(preds))
        preds = np.clip(preds * daily_wave * weekly_wave * noise, lower, upper)

        usage_levels = categorize_usage(preds)
        time_blocks = np.select(
            [hours < 6, hours < 12, hours < 18],
            ["night", "morning", "afternoon"],
            default="evening",
        ).tolist()
        peak_flags = ((hours >= 18) & (hours <= 22)).tolist()

        cost_per_step = preds * tariff_rate
        total_cost = float(cost_per_step.sum())
        next_value = float(preds[0])
        advice = build_advice(preds, next_value)

        month_grp = (
            df.assign(Month=df["DateTime"].dt.month)
            .groupby("Month", sort=True)["Consumption_KWh"]
            .mean()
            .reset_index()
        )
        season_months = month_grp["Month"].tolist()
        season_month_avgs = month_grp["Consumption_KWh"].tolist()
        history_tail = values[-60:].tolist()

        profile_severity, profile_ratio, profile_label = classify_profile_usage(
            total_kwh=float(preds.sum()),
            total_hours=total_hours,
            usage_type=usage_type,
        )

        result = {
            "history": history_tail,
            "future": preds.tolist(),
            "future_times": [t.isoformat() for t in future_times],
            "horizon_value": horizon_value,
            "horizon_unit": horizon_unit,
            "steps": steps,
            "base_interval_hours": float(step_hours),
            "tariff_rate": float(tariff_rate),
            "cost_per_step": cost_per_step.tolist(),
            "total_cost": total_cost,
            "next_value": next_value,
            "advice": advice,
            "peak_flags": peak_flags,
            "season_months": season_months,
            "season_month_avgs": season_month_avgs,
            "usage_levels": usage_levels,
            "time_blocks": time_blocks,
            "weather_condition": weather_condition,
            "usage_type": usage_type,
            "usage_profile_label": profile_label,
            "profile_severity": profile_severity,
            "profile_ratio": profile_ratio,
        }

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
