#!/usr/bin/env python3
"""Offline ML experiments for the RVTools Analyzer CPU-rightsizing logic.

This module intentionally has no dependency on the React application. It reads
the application's analysis export, evaluates deterministic policies on a
time-based holdout and optionally trains local XGBoost reference models.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np


BALANCED_POLICY = {
    "name": "balanced",
    "peak_stat": 0.99,
    "p95_utilization": 0.65,
    "peak_utilization": 0.90,
}

POLICIES = [
    {
        "name": "very-conservative",
        "peak_stat": 1.00,
        "p95_utilization": 0.55,
        "peak_utilization": 0.80,
    },
    {
        "name": "conservative",
        "peak_stat": 0.995,
        "p95_utilization": 0.60,
        "peak_utilization": 0.85,
    },
    BALANCED_POLICY,
    {
        "name": "offensive",
        "peak_stat": 0.95,
        "p95_utilization": 0.70,
        "peak_utilization": 0.95,
    },
]

FEATURE_NAMES = [
    "avg_lag_1h",
    "avg_lag_24h",
    "avg_lag_168h",
    "peak_lag_1h",
    "peak_lag_24h",
    "peak_lag_168h",
    "avg_mean_24h",
    "avg_std_24h",
    "avg_max_24h",
    "avg_mean_168h",
    "avg_std_168h",
    "avg_max_168h",
    "peak_mean_24h",
    "peak_std_24h",
    "peak_max_24h",
    "peak_mean_168h",
    "peak_std_168h",
    "peak_max_168h",
    "vcpu_log",
    "mhz_per_vcpu_log",
    "hour_sin",
    "hour_cos",
    "weekday_sin",
    "weekday_cos",
    "is_weekend",
]


def parse_float(value: Any, default: float = math.nan) -> float:
    """Parse a CSV value without turning missing cells into zero."""

    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return default


def parse_int(value: Any, default: int = 0) -> int:
    parsed = parse_float(value, math.nan)
    return default if not np.isfinite(parsed) else int(parsed)


def json_safe(value: Any) -> Any:
    """Convert numpy/scalar values into strict JSON-compatible values."""

    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return json_safe(value.tolist())
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        value = float(value)
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    return value


def decode_value_tokens(
    encoded_values: str,
    expected_slots: int,
    scale: float,
) -> np.ndarray:
    """Decode the export's delta/RLE format into an hourly float array.

    Empty tokens represent a missing measurement and do not change the last
    known value. A token such as 0*3 repeats the decoded value three times.
    """

    decoded: list[float] = []
    last_value = 0.0
    if scale == 0:
        raise ValueError("Series encoding scale must not be zero")

    for raw_token in encoded_values.rstrip("\r\n").split(","):
        if len(decoded) >= expected_slots:
            break
        token = raw_token.strip()
        if token == "":
            decoded.append(math.nan)
            continue

        repeat = 1
        if "*" in token:
            token, repeat_text = token.rsplit("*", 1)
            repeat = max(1, parse_int(repeat_text, 1))

        delta = parse_float(token, math.nan)
        if not np.isfinite(delta):
            decoded.extend([math.nan] * repeat)
            continue

        last_value += delta
        decoded.extend([last_value / scale] * repeat)

    if len(decoded) < expected_slots:
        decoded.extend([math.nan] * (expected_slots - len(decoded)))
    return np.asarray(decoded[:expected_slots], dtype=np.float32)


def read_series(
    path: Path,
    expected_slots: int,
    scale: float,
    allowed_ids: set[str],
) -> dict[str, np.ndarray]:
    series: dict[str, np.ndarray] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter=";")
        header = next(reader, None)
        if header is None:
            return series
        for row in reader:
            if len(row) < 2:
                continue
            vm_id = row[0].strip()
            if vm_id not in allowed_ids:
                continue
            series[vm_id] = decode_value_tokens(
                row[1],
                expected_slots=expected_slots,
                scale=scale,
            )
    return series


def series_spec(meta: dict[str, Any], metric: str) -> dict[str, Any]:
    for spec in meta.get("series", []):
        if spec.get("metric") == metric:
            return spec
    raise KeyError(f"Metric {metric!r} is not present in meta.json")


def load_export(export_dir: Path) -> dict[str, Any]:
    """Load the two CPU demand series and the VM sizing metadata."""

    meta_path = export_dir / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"meta.json not found in {export_dir}")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    expected_slots = parse_int(meta.get("timeSeries", {}).get("expectedSlots"), 0)
    if expected_slots <= 0:
        raise ValueError("meta.json does not contain a valid expectedSlots value")

    vm_rows: dict[str, dict[str, Any]] = {}
    with (export_dir / "vms.csv").open(
        "r", encoding="utf-8-sig", newline=""
    ) as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            vm_id = (row.get("vmId") or "").strip()
            vcpu = parse_float(row.get("vcpu"))
            mhz = parse_float(row.get("mhzPerVcpu"))
            if not vm_id or not np.isfinite(vcpu) or vcpu <= 0:
                continue
            if not np.isfinite(mhz) or mhz <= 0:
                continue
            vm_rows[vm_id] = {
                "vcpu": vcpu,
                "mhz_per_vcpu": mhz,
                "shape": row.get("shape") or "",
                "confidence": row.get("confidence") or "",
                "row": row,
            }

    allowed_ids = set(vm_rows)
    avg_spec = series_spec(meta, "vmCpuDemandAvgMHz")
    peak_spec = series_spec(meta, "vmCpuDemandMaxMHz")
    avg_series = read_series(
        export_dir / avg_spec["file"],
        expected_slots,
        parse_float(avg_spec.get("encoding", {}).get("scale"), 1),
        allowed_ids,
    )
    peak_series = read_series(
        export_dir / peak_spec["file"],
        expected_slots,
        parse_float(peak_spec.get("encoding", {}).get("scale"), 1),
        allowed_ids,
    )

    vm_ids = [
        vm_id
        for vm_id in vm_rows
        if vm_id in avg_series and vm_id in peak_series
    ]
    if not vm_ids:
        raise ValueError("No VMs have both CPU demand series")

    return {
        "meta": meta,
        "vm_ids": vm_ids,
        "avg": np.stack([avg_series[vm_id] for vm_id in vm_ids]),
        "peak": np.stack([peak_series[vm_id] for vm_id in vm_ids]),
        "vcpu": np.asarray(
            [vm_rows[vm_id]["vcpu"] for vm_id in vm_ids], dtype=np.float32
        ),
        "mhz_per_vcpu": np.asarray(
            [vm_rows[vm_id]["mhz_per_vcpu"] for vm_id in vm_ids],
            dtype=np.float32,
        ),
        "profiles": [vm_rows[vm_id] for vm_id in vm_ids],
    }


def finite_rows(*arrays: np.ndarray) -> np.ndarray:
    mask = np.ones(arrays[0].shape[0], dtype=bool)
    for array in arrays:
        mask &= np.all(np.isfinite(array), axis=tuple(range(1, array.ndim)))
    return mask


def percentile_rows(values: np.ndarray, quantile: float) -> np.ndarray:
    """Percentile per VM; callers should filter rows with sufficient data."""

    return np.percentile(values, quantile * 100.0, axis=1)


def rightsizing_target(
    avg_values: np.ndarray,
    peak_values: np.ndarray,
    mhz_per_vcpu: np.ndarray,
    policy: dict[str, Any],
) -> np.ndarray:
    """Calculate a reproducible integer vCPU target for a policy."""

    avg_p95 = percentile_rows(avg_values, 0.95)
    peak_stat = percentile_rows(peak_values, float(policy["peak_stat"]))
    p95_vcpu = avg_p95 / mhz_per_vcpu / float(policy["p95_utilization"])
    peak_vcpu = peak_stat / mhz_per_vcpu / float(policy["peak_utilization"])
    raw_target = np.maximum(2.0, np.maximum(p95_vcpu, peak_vcpu))
    return (np.ceil(raw_target / 2.0) * 2.0).astype(np.float32)


def future_lag(
    values: np.ndarray,
    train_end: int,
    offset: int,
) -> np.ndarray:
    indices = np.arange(train_end, values.shape[1]) - offset
    if np.any(indices < 0):
        raise ValueError(f"Lag {offset}h requires a longer history")
    return values[:, indices]


def future_three_week_mean(values: np.ndarray, train_end: int) -> np.ndarray:
    holdout_len = values.shape[1] - train_end
    offsets = (168, 336, 504)
    forecasts = []
    for offset in offsets:
        indices = np.arange(train_end, train_end + holdout_len) - offset
        forecasts.append(values[:, indices])
    stacked = np.stack(forecasts)
    valid_count = np.sum(np.isfinite(stacked), axis=0)
    summed = np.nansum(stacked, axis=0)
    return np.divide(
        summed,
        valid_count,
        out=np.full_like(summed, np.nan, dtype=np.float32),
        where=valid_count > 0,
    )


def metric_summary(
    predicted: np.ndarray,
    actual: np.ndarray,
    *,
    include_exact: bool = False,
) -> dict[str, float]:
    predicted = np.asarray(predicted, dtype=np.float64)
    actual = np.asarray(actual, dtype=np.float64)
    mask = np.isfinite(predicted) & np.isfinite(actual)
    predicted = predicted[mask]
    actual = actual[mask]
    if predicted.size == 0:
        return {"count": 0}
    diff = predicted - actual
    result: dict[str, float] = {
        "count": float(predicted.size),
        "mae": float(np.mean(np.abs(diff))),
        "rmse": float(np.sqrt(np.mean(diff * diff))),
        "bias": float(np.mean(diff)),
        "under_rate": float(np.mean(diff < 0)),
        "within_1_vcpu": float(np.mean(np.abs(diff) <= 1.0)),
        "within_2_vcpu": float(np.mean(np.abs(diff) <= 2.0)),
        "smape": float(
            np.mean(2.0 * np.abs(diff) / (np.abs(predicted) + np.abs(actual) + 1e-6))
        ),
    }
    if include_exact:
        result["exact_rate"] = float(np.mean(np.isclose(predicted, actual)))
    return result


def target_policy_sweep(
    data: dict[str, Any],
    train_end: int,
) -> list[dict[str, Any]]:
    avg = data["avg"]
    peak = data["peak"]
    mhz = data["mhz_per_vcpu"]
    historical_avg = avg[:, :train_end]
    historical_peak = peak[:, :train_end]
    future_avg = avg[:, train_end:]
    future_peak = peak[:, train_end:]

    valid = finite_rows(historical_avg, historical_peak, future_avg, future_peak)
    if not np.any(valid):
        raise ValueError("No VMs have complete train and holdout demand series")

    results: list[dict[str, Any]] = []
    daily_avg = future_lag(avg[valid], train_end, 24)
    daily_peak = future_lag(peak[valid], train_end, 24)
    weekly_avg = future_lag(avg[valid], train_end, 168)
    weekly_peak = future_lag(peak[valid], train_end, 168)
    three_week_avg = future_three_week_mean(avg[valid], train_end)
    three_week_peak = future_three_week_mean(peak[valid], train_end)

    for policy in POLICIES:
        actual = rightsizing_target(
            future_avg[valid],
            future_peak[valid],
            mhz[valid],
            policy,
        )
        historical = rightsizing_target(
            historical_avg[valid],
            historical_peak[valid],
            mhz[valid],
            policy,
        )
        baselines = {
            "historical_policy": historical,
            "daily_lag_24h": rightsizing_target(
                daily_avg, daily_peak, mhz[valid], policy
            ),
            "weekly_lag_168h": rightsizing_target(
                weekly_avg, weekly_peak, mhz[valid], policy
            ),
            "three_week_mean": rightsizing_target(
                three_week_avg, three_week_peak, mhz[valid], policy
            ),
        }
        results.append(
            {
                "policy": policy,
                "eligible_vms": int(np.sum(valid)),
                "holdout_target_distribution": {
                    "p50_vcpu": float(np.percentile(actual, 50)),
                    "p95_vcpu": float(np.percentile(actual, 95)),
                    "max_vcpu": float(np.max(actual)),
                },
                "baselines": {
                    label: metric_summary(
                        prediction,
                        actual,
                        include_exact=True,
                    )
                    for label, prediction in baselines.items()
                },
            }
        )
    return results


def slot_datetime(meta: dict[str, Any], slot: int) -> datetime:
    start_ms = parse_float(meta.get("timeSeries", {}).get("rangeStartUtc"), 0)
    base = datetime.fromtimestamp(start_ms / 1000.0, tz=timezone.utc)
    try:
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(meta.get("timeSeries", {}).get("timezone", "UTC"))
    except Exception:
        zone = timezone.utc
    return (base + timedelta(hours=slot)).astimezone(zone)


def feature_row(
    avg_norm: np.ndarray,
    peak_norm: np.ndarray,
    vcpu: float,
    mhz_per_vcpu: float,
    meta: dict[str, Any],
    slot: int,
    time_features: np.ndarray | None = None,
) -> np.ndarray:
    """Features use history strictly before the prediction slot."""

    def stats(history: np.ndarray, width: int) -> tuple[float, float, float]:
        window = history[-width:]
        return (
            float(np.mean(window)),
            float(np.std(window)),
            float(np.max(window)),
        )

    avg_history = avg_norm[:slot]
    peak_history = peak_norm[:slot]
    avg_24 = stats(avg_history, 24)
    avg_168 = stats(avg_history, 168)
    peak_24 = stats(peak_history, 24)
    peak_168 = stats(peak_history, 168)
    if time_features is None:
        local_time = slot_datetime(meta, slot)
        hour_angle = 2.0 * math.pi * local_time.hour / 24.0
        weekday_angle = 2.0 * math.pi * local_time.weekday() / 7.0
        time_features = np.asarray(
            [
                math.sin(hour_angle),
                math.cos(hour_angle),
                math.sin(weekday_angle),
                math.cos(weekday_angle),
                float(local_time.weekday() >= 5),
            ],
            dtype=np.float32,
        )
    return np.asarray(
        [
            avg_norm[slot - 1],
            avg_norm[slot - 24],
            avg_norm[slot - 168],
            peak_norm[slot - 1],
            peak_norm[slot - 24],
            peak_norm[slot - 168],
            *avg_24,
            *avg_168,
            *peak_24,
            *peak_168,
            math.log1p(max(vcpu, 0.0)),
            math.log1p(max(mhz_per_vcpu, 0.0)),
            *time_features,
        ],
        dtype=np.float32,
    )


def build_ml_dataset(
    data: dict[str, Any],
    train_end: int,
    max_vms: int | None = None,
) -> dict[str, Any]:
    """Build a next-hour peak-demand dataset without leaking future slots."""

    avg = data["avg"]
    peak = data["peak"]
    mhz = data["mhz_per_vcpu"]
    vcpu = data["vcpu"]
    total_slots = avg.shape[1]
    vm_indices = np.arange(avg.shape[0])
    if max_vms is not None:
        vm_indices = vm_indices[:max_vms]

    warmup = 168
    prediction_slots = np.arange(warmup, total_slots, dtype=np.int32)
    avg_norm = avg[vm_indices] / mhz[vm_indices, None]
    peak_norm = peak[vm_indices] / mhz[vm_indices, None]
    complete = finite_rows(avg_norm, peak_norm)
    complete &= np.isfinite(vcpu[vm_indices]) & np.isfinite(mhz[vm_indices])
    if not np.any(complete):
        raise ValueError("Could not build a non-empty ML train/validation split")

    source_indices = vm_indices[complete]
    avg_norm = avg_norm[complete]
    peak_norm = peak_norm[complete]
    source_vcpu = vcpu[source_indices]
    source_mhz = mhz[source_indices]

    slot_times = [
        slot_datetime(data["meta"], slot) for slot in range(total_slots)
    ]
    time_features = np.asarray(
        [
            [
                math.sin(2.0 * math.pi * local_time.hour / 24.0),
                math.cos(2.0 * math.pi * local_time.hour / 24.0),
                math.sin(2.0 * math.pi * local_time.weekday() / 7.0),
                math.cos(2.0 * math.pi * local_time.weekday() / 7.0),
                float(local_time.weekday() >= 5),
            ]
            for local_time in slot_times
        ],
        dtype=np.float32,
    )

    def rolling_stats(
        values: np.ndarray,
        width: int,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        prefix = np.concatenate(
            [
                np.zeros((values.shape[0], 1), dtype=np.float64),
                np.cumsum(values, axis=1, dtype=np.float64),
            ],
            axis=1,
        )
        squared_prefix = np.concatenate(
            [
                np.zeros((values.shape[0], 1), dtype=np.float64),
                np.cumsum(values * values, axis=1, dtype=np.float64),
            ],
            axis=1,
        )
        right = prefix[:, prediction_slots]
        left = prefix[:, prediction_slots - width]
        squared_right = squared_prefix[:, prediction_slots]
        squared_left = squared_prefix[:, prediction_slots - width]
        mean = (right - left) / width
        variance = np.maximum(
            (squared_right - squared_left) / width - mean * mean,
            0.0,
        )
        try:
            from scipy.ndimage import maximum_filter1d

            trailing_max = maximum_filter1d(
                values,
                size=width,
                axis=1,
                origin=width // 2 - 1,
                mode="constant",
                cval=-np.inf,
            )[:, prediction_slots - 1]
        except ImportError:
            trailing_max = np.full(
                (values.shape[0], len(prediction_slots)),
                -np.inf,
                dtype=values.dtype,
            )
            for offset in range(width):
                trailing_max = np.maximum(
                    trailing_max,
                    values[:, prediction_slots - 1 - offset],
                )
        return mean, np.sqrt(variance), trailing_max

    avg_mean_24, avg_std_24, avg_max_24 = rolling_stats(avg_norm, 24)
    avg_mean_168, avg_std_168, avg_max_168 = rolling_stats(avg_norm, 168)
    peak_mean_24, peak_std_24, peak_max_24 = rolling_stats(peak_norm, 24)
    peak_mean_168, peak_std_168, peak_max_168 = rolling_stats(peak_norm, 168)
    vm_count = avg_norm.shape[0]
    time_matrix = np.broadcast_to(
        time_features[prediction_slots][None, :, :],
        (vm_count, len(prediction_slots), 5),
    )
    features = np.stack(
        [
            avg_norm[:, prediction_slots - 1],
            avg_norm[:, prediction_slots - 24],
            avg_norm[:, prediction_slots - 168],
            peak_norm[:, prediction_slots - 1],
            peak_norm[:, prediction_slots - 24],
            peak_norm[:, prediction_slots - 168],
            avg_mean_24,
            avg_std_24,
            avg_max_24,
            avg_mean_168,
            avg_std_168,
            avg_max_168,
            peak_mean_24,
            peak_std_24,
            peak_max_24,
            peak_mean_168,
            peak_std_168,
            peak_max_168,
        ],
        axis=2,
    )
    feature_logs = np.stack(
        [
            np.broadcast_to(
                np.log1p(np.maximum(source_vcpu, 0.0))[:, None],
                (vm_count, len(prediction_slots)),
            ),
            np.broadcast_to(
                np.log1p(np.maximum(source_mhz, 0.0))[:, None],
                (vm_count, len(prediction_slots)),
            ),
        ],
        axis=2,
    )
    features = np.concatenate([features, feature_logs, time_matrix], axis=2)
    targets = np.log1p(np.maximum(peak_norm[:, prediction_slots], 0.0))
    finite = np.all(np.isfinite(features), axis=2) & np.isfinite(targets)
    train_slot_mask = prediction_slots < train_end
    valid_slot_mask = prediction_slots >= train_end
    train_mask = finite[:, train_slot_mask]
    valid_mask = finite[:, valid_slot_mask]
    train_features = features[:, train_slot_mask, :][train_mask]
    valid_features = features[:, valid_slot_mask, :][valid_mask]
    train_targets = targets[:, train_slot_mask][train_mask]
    valid_targets = targets[:, valid_slot_mask][valid_mask]
    if train_features.size == 0 or valid_features.size == 0:
        raise ValueError("Could not build a non-empty ML train/validation split")

    valid_slot_values = prediction_slots[valid_slot_mask]
    valid_vm_indices = np.repeat(source_indices, np.sum(valid_mask, axis=1))
    valid_slots = np.tile(valid_slot_values, vm_count)[valid_mask.ravel()]

    return {
        "x_train": train_features.astype(np.float32, copy=False),
        "y_train": train_targets.astype(np.float32, copy=False),
        "x_valid": valid_features.astype(np.float32, copy=False),
        "y_valid": valid_targets.astype(np.float32, copy=False),
        "valid_vm_indices": valid_vm_indices.astype(np.int32, copy=False),
        "valid_slots": valid_slots.astype(np.int32, copy=False),
        "feature_names": FEATURE_NAMES,
        "warmup_hours": warmup,
        "train_end": train_end,
        "total_slots": total_slots,
        "eligible_vms": int(len(source_indices)),
    }


def train_xgboost(
    dataset: dict[str, Any],
    data: dict[str, Any],
    device: str,
    quantile: float,
    seed: int,
) -> dict[str, Any]:
    """Train one local XGBoost model and return metrics, not the model file."""

    try:
        import xgboost as xgb
    except ImportError as exc:
        return {"status": "error", "error": f"xgboost is not installed: {exc}"}

    x_train = dataset["x_train"]
    y_train = dataset["y_train"]
    x_valid = dataset["x_valid"]
    y_valid = dataset["y_valid"]
    objective = "reg:quantileerror" if quantile < 1.0 else "reg:squarederror"
    params: dict[str, Any] = {
        "objective": objective,
        "max_depth": 6,
        "learning_rate": 0.08,
        "subsample": 0.85,
        "colsample_bytree": 0.90,
        "min_child_weight": 5,
        "reg_lambda": 2.0,
        "tree_method": "hist",
        "device": device,
        "seed": seed,
    }
    if objective == "reg:quantileerror":
        params["quantile_alpha"] = quantile

    train_matrix = xgb.DMatrix(
        x_train,
        label=y_train,
        feature_names=dataset["feature_names"],
    )
    valid_matrix = xgb.DMatrix(
        x_valid,
        label=y_valid,
        feature_names=dataset["feature_names"],
    )
    eval_metric = "quantile" if objective == "reg:quantileerror" else "mae"
    params["eval_metric"] = eval_metric

    started = time.perf_counter()
    try:
        model = xgb.train(
            params,
            train_matrix,
            num_boost_round=350,
            evals=[(valid_matrix, "validation")],
            evals_result={},
            verbose_eval=False,
            early_stopping_rounds=40,
        )
    except Exception as exc:
        return {
            "status": "error",
            "device": device,
            "quantile": quantile,
            "error": str(exc),
        }
    train_seconds = time.perf_counter() - started

    predict_started = time.perf_counter()
    predicted_log = np.asarray(model.predict(valid_matrix), dtype=np.float32)
    predict_seconds = time.perf_counter() - predict_started
    predicted_norm = np.maximum(np.expm1(predicted_log), 0.0)
    actual_norm = np.expm1(y_valid)

    hourly = metric_summary(predicted_norm, actual_norm)
    predicted_peak = np.full_like(data["peak"], np.nan, dtype=np.float32)
    for value, vm_index, slot in zip(
        predicted_norm,
        dataset["valid_vm_indices"],
        dataset["valid_slots"],
    ):
        predicted_peak[vm_index, slot] = value
    train_end = dataset["train_end"]
    holdout_start = train_end
    holdout_avg_p95 = percentile_rows(data["avg"][:, :train_end], 0.95)
    predicted_holdout = predicted_peak[:, holdout_start:]
    valid_vm_mask = np.all(np.isfinite(predicted_holdout), axis=1)
    valid_vm_mask &= np.all(np.isfinite(data["peak"][:, holdout_start:]), axis=1)
    valid_vm_mask &= np.all(np.isfinite(data["avg"][:, :train_end]), axis=1)
    if np.any(valid_vm_mask):
        predicted_peak_stat = percentile_rows(
            predicted_holdout[valid_vm_mask],
            BALANCED_POLICY["peak_stat"],
        )
        predicted_raw_target = np.maximum(
            2.0,
            np.maximum(
                holdout_avg_p95[valid_vm_mask]
                / data["mhz_per_vcpu"][valid_vm_mask]
                / BALANCED_POLICY["p95_utilization"],
                predicted_peak_stat
                / data["mhz_per_vcpu"][valid_vm_mask]
                / BALANCED_POLICY["peak_utilization"],
            ),
        )
        predicted_target = np.ceil(predicted_raw_target / 2.0) * 2.0
        actual_target = rightsizing_target(
            data["avg"][valid_vm_mask, holdout_start:],
            data["peak"][valid_vm_mask, holdout_start:],
            data["mhz_per_vcpu"][valid_vm_mask],
            BALANCED_POLICY,
        )
        target_metrics = metric_summary(
            predicted_target,
            actual_target,
            include_exact=True,
        )
    else:
        target_metrics = {"count": 0}

    scores = model.get_score(importance_type="gain")
    importance: list[dict[str, Any]] = []
    for key, score in sorted(scores.items(), key=lambda item: item[1], reverse=True):
        feature_name = key
        if key.startswith("f") and key[1:].isdigit():
            index = int(key[1:])
            if index < len(dataset["feature_names"]):
                feature_name = dataset["feature_names"][index]
        importance.append({"feature": feature_name, "gain": float(score)})

    best_iteration = getattr(model, "best_iteration", None)
    best_score = getattr(model, "best_score", None)
    return {
        "status": "ok",
        "device": device,
        "quantile": quantile,
        "objective": objective,
        "train_seconds": float(train_seconds),
        "predict_seconds": float(predict_seconds),
        "best_iteration": None if best_iteration is None else int(best_iteration),
        "best_validation_score": None if best_score is None else float(best_score),
        "hourly_metrics": hourly,
        "holdout_rightsizing_metrics": target_metrics,
        "top_features": importance[:10],
        "training_rows": int(len(y_train)),
        "validation_rows": int(len(y_valid)),
        "feature_count": int(x_train.shape[1]),
    }


def hourly_baselines(data: dict[str, Any], train_end: int) -> dict[str, Any]:
    actual = data["peak"][:, train_end:] / data["mhz_per_vcpu"][:, None]
    predictions = {
        "daily_lag_24h": future_lag(data["peak"], train_end, 24)
        / data["mhz_per_vcpu"][:, None],
        "weekly_lag_168h": future_lag(data["peak"], train_end, 168)
        / data["mhz_per_vcpu"][:, None],
        "three_week_mean": future_three_week_mean(data["peak"], train_end)
        / data["mhz_per_vcpu"][:, None],
    }
    return {
        name: metric_summary(prediction, actual)
        for name, prediction in predictions.items()
    }


def make_report_markdown(report: dict[str, Any]) -> str:
    def number(value: Any, digits: int = 3) -> str:
        if value is None:
            return "—"
        if isinstance(value, (int, np.integer)):
            return f"{int(value):,}"
        if isinstance(value, float) and not math.isfinite(value):
            return "—"
        return f"{float(value):.{digits}f}"

    lines = [
        "# Offline-ML-Report CPU-Rightsizing",
        "",
        "> Entwicklungsanalyse. Keine Laufzeit-Integration in die Webapp.",
        "",
        "## Versuchsaufbau",
        "",
        f"- Export: {report['experiment']['export_dir']}",
        f"- Zeitraster: {report['experiment']['interval_minutes']} Minuten",
        f"- Holdout: letzte {report['experiment']['holdout_hours']} Stunden",
        f"- Trainingsende: Slot {report['experiment']['train_end']}",
        f"- VMs mit beiden Reihen: {report['dataset']['series_vms']:,}",
        f"- ML-VMs: {report['dataset']['ml_eligible_vms']:,}",
        "",
        "Die Policy-Sweep-Werte werden ausschließlich aus dem historischen Fenster "
        "berechnet und gegen das getrennte Holdout-Fenster bewertet.",
        "",
        "## Deterministische Policy-Sweep",
        "",
        "| Policy | Baseline | MAE vCPU | Bias | Unterversorgung | ±2 vCPU | Exakt |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for item in report["policy_sweep"]:
        policy_name = item["policy"]["name"]
        for baseline_name, metrics in item["baselines"].items():
            under = metrics.get("under_rate")
            within_two = metrics.get("within_2_vcpu")
            exact = metrics.get("exact_rate")
            lines.append(
                f"| {policy_name} | {baseline_name} | "
                f"{number(metrics.get('mae'))} | {number(metrics.get('bias'))} | "
                f"{number(under * 100 if under is not None else None, 1)}% | "
                f"{number(within_two * 100 if within_two is not None else None, 1)}% | "
                f"{number(exact * 100 if exact is not None else None, 1)}% |"
            )

    lines.extend(
        [
            "",
            "## Stündliche Baselines",
            "",
            "| Baseline | MAE | RMSE | sMAPE | Unterversorgung |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for name, metrics in report["hourly_baselines"].items():
        under = metrics.get("under_rate")
        lines.append(
            f"| {name} | {number(metrics.get('mae'))} | "
            f"{number(metrics.get('rmse'))} | {number(metrics.get('smape'))} | "
            f"{number(under * 100 if under is not None else None, 1)}% |"
        )

    lines.extend(
        [
            "",
            "## Lokale XGBoost-Referenzmodelle",
            "",
            "| Device | Quantil | Training (s) | Stunden-MAE | Stunden-Unterversorgung | Rightsizing-MAE | Rightsizing-Unterversorgung |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for run in report["ml_runs"]:
        if run.get("status") != "ok":
            lines.append(
                f"| {run.get('device', '—')} | {number(run.get('quantile'))} | Fehler | "
                f"{run.get('error', 'unbekannt')} | — | — | — |"
            )
            continue
        hourly = run["hourly_metrics"]
        sizing = run["holdout_rightsizing_metrics"]
        lines.append(
            f"| {run['device']} | {number(run['quantile'])} | "
            f"{number(run.get('train_seconds'))} | {number(hourly.get('mae'))} | "
            f"{number(hourly.get('under_rate') * 100, 1)}% | "
            f"{number(sizing.get('mae'))} | "
            f"{number(sizing.get('under_rate') * 100, 1)}% |"
        )

    lines.extend(
        [
            "",
            "## Einordnung",
            "",
            "- under_rate ist für Rightsizing der zentrale Sicherheitsindikator.",
            "- ML wird hier als Entwicklungs- und Kalibrierungsreferenz verwendet; "
            "die Webapp bleibt deterministisch.",
            "- Der nächste sinnvolle Modellschritt ist ein direktes Ziel für das "
            "nächste 7-Tage-P99 statt einer Kette von Stundenprognosen.",
            "",
            "## Reproduzierbarkeit",
            "",
            "python tools/ml-rightsizing/ml_rightsizing.py "
            "--export <export> --output tools/ml-rightsizing/reports "
            "--devices cpu,cuda --quantiles 0.90,0.95",
            "",
        ]
    )
    return "\n".join(lines)


def run_experiment(
    export_dir: Path,
    output_dir: Path,
    devices: Iterable[str],
    quantiles: Iterable[float],
    holdout_hours: int,
    max_vms: int | None,
    seed: int,
) -> dict[str, Any]:
    data = load_export(export_dir)
    total_slots = data["avg"].shape[1]
    train_end = total_slots - holdout_hours
    if train_end <= 168:
        raise ValueError("The training window must be longer than 168 hours")
    if holdout_hours < 24:
        raise ValueError("The holdout must contain at least 24 hours")

    ml_data = data
    if max_vms is not None:
        if max_vms <= 0:
            raise ValueError("--max-vms must be positive")
        ml_data = {
            **data,
            "vm_ids": data["vm_ids"][:max_vms],
            "avg": data["avg"][:max_vms],
            "peak": data["peak"][:max_vms],
            "vcpu": data["vcpu"][:max_vms],
            "mhz_per_vcpu": data["mhz_per_vcpu"][:max_vms],
            "profiles": data["profiles"][:max_vms],
        }

    devices = list(devices)
    quantiles = list(quantiles)
    ml_dataset = build_ml_dataset(ml_data, train_end, max_vms=None)
    ml_runs: list[dict[str, Any]] = []
    for device in devices:
        for quantile in quantiles:
            print(
                f"Training XGBoost device={device} quantile={quantile:.2f} "
                f"({len(ml_dataset['y_train']):,} rows)...",
                flush=True,
            )
            result = train_xgboost(
                ml_dataset,
                ml_data,
                device=device,
                quantile=quantile,
                seed=seed,
            )
            ml_runs.append(result)
            if result.get("status") == "ok":
                print(
                    f"  done: train={result['train_seconds']:.2f}s, "
                    f"hourly MAE={result['hourly_metrics']['mae']:.4f}",
                    flush=True,
                )
            else:
                print(f"  failed: {result.get('error')}", flush=True)

    interval = parse_int(data["meta"].get("timeSeries", {}).get("intervalMinutes"), 60)
    report: dict[str, Any] = {
        "experiment": {
            "export_dir": str(export_dir),
            "interval_minutes": interval,
            "holdout_hours": holdout_hours,
            "train_end": train_end,
            "devices": devices,
            "quantiles": quantiles,
            "seed": seed,
        },
        "dataset": {
            "series_vms": int(len(data["vm_ids"])),
            "complete_train_holdout_vms": int(
                np.sum(
                    finite_rows(
                        data["avg"][:, :train_end],
                        data["peak"][:, :train_end],
                        data["avg"][:, train_end:],
                        data["peak"][:, train_end:],
                    )
                )
            ),
            "ml_eligible_vms": int(ml_dataset["eligible_vms"]),
            "training_rows": int(len(ml_dataset["y_train"])),
            "validation_rows": int(len(ml_dataset["y_valid"])),
            "feature_count": len(ml_dataset["feature_names"]),
            "feature_names": ml_dataset["feature_names"],
        },
        "policy_sweep": target_policy_sweep(data, train_end),
        "hourly_baselines": hourly_baselines(data, train_end),
        "ml_runs": ml_runs,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "rightsizing-ml-report.json"
    markdown_path = output_dir / "rightsizing-ml-report.md"
    json_path.write_text(
        json.dumps(json_safe(report), indent=2, ensure_ascii=False, allow_nan=False)
        + "\n",
        encoding="utf-8",
    )
    markdown_path.write_text(make_report_markdown(report), encoding="utf-8")
    print(f"Report written: {markdown_path}", flush=True)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Offline CPU-rightsizing ML/backtest toolkit"
    )
    parser.add_argument("--export", required=True, type=Path)
    parser.add_argument(
        "--output",
        default=Path("tools/ml-rightsizing/reports"),
        type=Path,
    )
    parser.add_argument("--devices", default="cpu", help="Comma-separated: cpu,cuda")
    parser.add_argument(
        "--quantiles",
        default="0.90,0.95",
        help="Comma-separated quantiles, for example 0.90,0.95",
    )
    parser.add_argument("--holdout-hours", default=168, type=int)
    parser.add_argument("--max-vms", default=None, type=int)
    parser.add_argument("--seed", default=42, type=int)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    devices = [item.strip() for item in args.devices.split(",") if item.strip()]
    quantiles = [
        float(item.strip())
        for item in args.quantiles.split(",")
        if item.strip()
    ]
    if not devices or not quantiles:
        raise SystemExit("At least one device and one quantile are required")
    if any(value <= 0 or value > 1 for value in quantiles):
        raise SystemExit("Quantiles must be in the interval (0, 1]")

    try:
        run_experiment(
            export_dir=args.export,
            output_dir=args.output,
            devices=devices,
            quantiles=quantiles,
            holdout_hours=args.holdout_hours,
            max_vms=args.max_vms,
            seed=args.seed,
        )
    except (FileNotFoundError, KeyError, ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
