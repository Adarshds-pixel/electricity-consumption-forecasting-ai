import os
import numpy as np
import joblib
from tensorflow.keras.models import load_model  # type: ignore

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "saved_models")

MODEL_PATH = os.path.join(SAVE_DIR, "lstm_model.h5")
SCALER_PATH = os.path.join(SAVE_DIR, "scaler.gz")

WINDOW_SIZE = 30  # must match train_model & backend

model = None
scaler = None


def load_artifacts():
    """Load trained model and scaler once."""
    global model, scaler
    if model is None:
        model = load_model(MODEL_PATH, compile=False)
    if scaler is None:
        scaler = joblib.load(SCALER_PATH)


def _predict_one_step(history_values):
    if len(history_values) < WINDOW_SIZE:
        raise ValueError(f"Need at least {WINDOW_SIZE} past values")

    window = np.array(history_values[-WINDOW_SIZE:], dtype=float).reshape(-1, 1)
    scaled_window = scaler.transform(window)
    X = scaled_window.reshape((1, WINDOW_SIZE, 1))

    y_scaled = model.predict(X, verbose=0)
    y = scaler.inverse_transform(y_scaled)[0, 0]
    return float(y)


def predict_multi_scaled(history_values, steps):
    """Forecast multiple future points while scaling only once."""
    load_artifacts()

    if scaler is None or model is None:
        raise RuntimeError("Model artifacts are not loaded.")

    history = np.asarray(history_values, dtype=float).reshape(-1)
    if history.size < WINDOW_SIZE:
        raise ValueError(f"Need at least {WINDOW_SIZE} past values")
    if steps <= 0:
        return np.empty(0, dtype=float)

    scaled_history = scaler.transform(history.reshape(-1, 1)).reshape(-1)
    window = scaled_history[-WINDOW_SIZE:].copy()
    preds_scaled = np.empty(int(steps), dtype=float)

    for idx in range(int(steps)):
        y_scaled = model.predict(
            window.reshape(1, WINDOW_SIZE, 1), verbose=0
        )[0, 0]
        preds_scaled[idx] = y_scaled
        window[:-1] = window[1:]
        window[-1] = y_scaled

    return preds_scaled


def inverse_transform_predictions(preds_scaled):
    """Convert scaled predictions back to the original consumption units."""
    load_artifacts()

    if scaler is None:
        raise RuntimeError("Scaler artifact is not loaded.")

    preds_scaled = np.asarray(preds_scaled, dtype=float).reshape(-1, 1)
    if preds_scaled.size == 0:
        return np.empty(0, dtype=float)
    return scaler.inverse_transform(preds_scaled).reshape(-1)


def predict_multi(history_values, steps=10):
    """
    Multi-step forecast.
    For long horizons, we limit LSTM calls and then extend with a small
    synthetic seasonal pattern for speed.
    """
    load_artifacts()

    MAX_LSTM_STEPS = 720
    lstm_steps = min(steps, MAX_LSTM_STEPS)
    history = np.asarray(history_values, dtype=float).reshape(-1)
    preds = []

    if lstm_steps > 0:
        preds_scaled = predict_multi_scaled(history, lstm_steps)
        preds = inverse_transform_predictions(preds_scaled).tolist()

    remaining = steps - lstm_steps
    if remaining > 0:
        history_for_base = history
        if preds:
            history_for_base = np.concatenate((history, np.asarray(preds)))
        base = float(np.mean(history_for_base[-WINDOW_SIZE:]))
        for i in range(remaining):
            seasonal_factor = 1.0 + 0.03 * np.sin(2 * np.pi * (i / 24.0))
            preds.append(float(base * seasonal_factor))

    return preds
