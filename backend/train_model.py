import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential  # type: ignore
from tensorflow.keras.layers import LSTM, Dense  # type: ignore
from tensorflow.keras.callbacks import EarlyStopping  # type: ignore
import joblib

# ---------- CONFIG ----------
WINDOW_SIZE = 30  # use last 30 readings to predict next one

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 👇 choose which profile to train on: "household", "apartment", "industrial"
PROFILE_NAME = "household"

DATA_PATH = os.path.join(
    BASE_DIR, "..", "data", f"{PROFILE_NAME}_1998_2018.csv"
)

SAVE_DIR = os.path.join(BASE_DIR, "saved_models")
os.makedirs(SAVE_DIR, exist_ok=True)

MODEL_PATH = os.path.join(SAVE_DIR, "lstm_model.h5")
SCALER_PATH = os.path.join(SAVE_DIR, "scaler.gz")

DATETIME_COL = "DateTime"
TARGET_COL = "Consumption_KWh"


def create_dataset(series, window_size=30):
    flat_series = np.asarray(series, dtype=float).reshape(-1)
    if flat_series.size <= window_size:
        return np.empty((0, window_size)), np.empty((0,))

    windows = np.lib.stride_tricks.sliding_window_view(
        flat_series, window_shape=window_size + 1
    )
    X = windows[:, :-1]
    y = windows[:, -1]
    return X, y


def main():
    print(f"Training profile: {PROFILE_NAME}")
    print(f"Loading data from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)

    print("Columns in CSV:", list(df.columns))

    # synthetic datasets are in YYYY-MM-DD format
    df[DATETIME_COL] = pd.to_datetime(
        df[DATETIME_COL], dayfirst=False, errors="coerce"
    )
    df.dropna(subset=[DATETIME_COL], inplace=True)
    df.sort_values(DATETIME_COL, inplace=True)
    df.set_index(DATETIME_COL, inplace=True)

    values = df[TARGET_COL].astype(float).values.reshape(-1, 1)

    scaler = MinMaxScaler()
    scaled_values = scaler.fit_transform(values)

    X, y = create_dataset(scaled_values, WINDOW_SIZE)
    X = X.reshape((X.shape[0], X.shape[1], 1))

    print("Training samples:", X.shape[0])
    print("Window size:", WINDOW_SIZE)

    model = Sequential()
    model.add(LSTM(64, return_sequences=True, input_shape=(WINDOW_SIZE, 1)))
    model.add(LSTM(32))
    model.add(Dense(1))
    model.compile(optimizer="adam", loss="mse")

    es = EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)

    history = model.fit(
        X,
        y,
        epochs=30,
        batch_size=64,
        validation_split=0.2,
        callbacks=[es],
        verbose=1,
    )

    model.save(MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    print(f"\n✅ Model saved to: {MODEL_PATH}")
    print(f"✅ Scaler saved to: {SCALER_PATH}")
    print("Done.")


if __name__ == "__main__":
    main()
