import os
import numpy as np
import pandas as pd
from math import sqrt
from sklearn.metrics import mean_squared_error, mean_absolute_error

import model_utils as mu

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PROFILE_NAME = "household"  # same as in train_model.py
DATA_PATH = os.path.join(BASE_DIR, "..", "data", f"{PROFILE_NAME}_1998_2018.csv")

TARGET_COL = "Consumption_KWh"
DATETIME_COL = "DateTime"
TEST_RATIO = 0.2


def main():
    print("\nLoading data from:", DATA_PATH)
    df = pd.read_csv(DATA_PATH)

    if TARGET_COL not in df.columns:
        raise ValueError(
            f"Target column '{TARGET_COL}' missing! Found: {df.columns.tolist()}"
        )

    df[DATETIME_COL] = pd.to_datetime(
        df[DATETIME_COL], dayfirst=False, errors="coerce"
    )
    df.dropna(subset=[DATETIME_COL], inplace=True)
    df.sort_values(DATETIME_COL, inplace=True)

    values = df[TARGET_COL].astype(float).to_numpy()
    n_total = len(values)
    n_train = int(n_total * (1 - TEST_RATIO))
    n_test = n_total - n_train

    print(f"Total points: {n_total}  | train: {n_train}  | test: {n_test}")

    if n_total <= mu.WINDOW_SIZE + 1:
        raise ValueError(
            f"Not enough data points. Need > {mu.WINDOW_SIZE + 1}, have {n_total}."
        )

    test_series = values[n_train - mu.WINDOW_SIZE :]

    mu.load_artifacts()
    scaler = mu.scaler
    model = mu.model
    if scaler is None or model is None:
        raise RuntimeError("Model or scaler not loaded correctly from model_utils.")

    num_samples = len(test_series) - mu.WINDOW_SIZE
    print(f"Number of test samples (windows): {num_samples}")

    windows = np.stack(
        [test_series[i : i + mu.WINDOW_SIZE] for i in range(num_samples)],
        axis=0,
    )
    y_true = test_series[mu.WINDOW_SIZE :].astype(float)

    windows_flat = windows.reshape(-1, 1)
    windows_scaled_flat = scaler.transform(windows_flat)
    windows_scaled = windows_scaled_flat.reshape(num_samples, mu.WINDOW_SIZE, 1)

    print("\nRunning batch prediction with LSTM...")
    y_scaled_pred = model.predict(windows_scaled, batch_size=256, verbose=0)
    preds = scaler.inverse_transform(y_scaled_pred)[:, 0]

    mae = mean_absolute_error(y_true, preds)
    rmse = sqrt(mean_squared_error(y_true, preds))

    non_zero_mask = y_true != 0
    if np.any(non_zero_mask):
        mape = (
            np.mean(
                np.abs(
                    (y_true[non_zero_mask] - preds[non_zero_mask])
                    / y_true[non_zero_mask]
                )
            )
            * 100.0
        )
    else:
        mape = np.nan

    print("\n=== MODEL ACCURACY ON TEST SET (last 20%) ===")
    print(f"MAE  : {mae:.4f} kWh")
    print(f"RMSE : {rmse:.4f} kWh")
    if not np.isnan(mape):
        print(f"MAPE : {mape:.2f} %")
    else:
        print("MAPE : not defined (all targets are zero)")


if __name__ == "__main__":
    main()
