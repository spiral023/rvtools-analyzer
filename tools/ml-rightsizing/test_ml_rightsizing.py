import importlib.util
import unittest
from pathlib import Path

import numpy as np


MODULE_PATH = Path(__file__).with_name("ml_rightsizing.py")
SPEC = importlib.util.spec_from_file_location("ml_rightsizing", MODULE_PATH)
assert SPEC and SPEC.loader
ML = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ML)


class MlRightsizingTests(unittest.TestCase):
    def test_delta_and_rle_decoder_keeps_missing_value(self) -> None:
        decoded = ML.decode_value_tokens("1000,10,10,,0*3", 7, 1)

        np.testing.assert_allclose(
            decoded[[0, 1, 2, 4, 5, 6]],
            np.asarray([1000, 1010, 1020, 1020, 1020, 1020]),
        )
        self.assertTrue(np.isnan(decoded[3]))

    def test_rightsizing_policy_uses_peak_and_p95_guardrails(self) -> None:
        avg = np.asarray([[10, 10, 10, 100]], dtype=np.float32)
        peak = np.asarray([[20, 20, 20, 200]], dtype=np.float32)
        mhz = np.asarray([100], dtype=np.float32)
        policy = {
            "peak_stat": 0.99,
            "p95_utilization": 0.65,
            "peak_utilization": 0.90,
        }

        target = ML.rightsizing_target(avg, peak, mhz, policy)

        self.assertEqual(target.tolist(), [4.0])

    def test_lag_forecast_points_only_into_history(self) -> None:
        values = np.arange(2 * 200, dtype=np.float32).reshape(2, 200)

        forecast = ML.future_lag(values, train_end=190, offset=24)

        np.testing.assert_array_equal(forecast[:, 0], values[:, 166])
        np.testing.assert_array_equal(forecast[:, -1], values[:, 175])

    def test_feature_row_does_not_read_current_or_future_slot(self) -> None:
        meta = {
            "timeSeries": {
                "rangeStartUtc": 0,
                "timezone": "UTC",
            }
        }
        avg = np.ones(200, dtype=np.float32)
        peak = np.ones(200, dtype=np.float32) * 2
        baseline = ML.feature_row(avg, peak, 4, 2500, meta, 168)

        avg[168:] = 999
        peak[168:] = 999
        changed_future = ML.feature_row(avg, peak, 4, 2500, meta, 168)

        np.testing.assert_array_equal(baseline, changed_future)
        self.assertEqual(len(baseline), len(ML.FEATURE_NAMES))

    def test_metric_summary_marks_underprovisioning(self) -> None:
        result = ML.metric_summary(
            np.asarray([2, 4, 8], dtype=np.float32),
            np.asarray([2, 5, 6], dtype=np.float32),
            include_exact=True,
        )

        self.assertAlmostEqual(result["mae"], 1.0)
        self.assertAlmostEqual(result["under_rate"], 1.0 / 3.0)
        self.assertAlmostEqual(result["exact_rate"], 1.0 / 3.0)

    def test_vectorized_features_match_single_slot_features(self) -> None:
        slots = 200
        avg_norm = np.arange(slots, dtype=np.float32) + 1
        peak_norm = np.arange(slots, dtype=np.float32) + 2
        data = {
            "avg": avg_norm[None, :] * 2500,
            "peak": peak_norm[None, :] * 2500,
            "vcpu": np.asarray([4], dtype=np.float32),
            "mhz_per_vcpu": np.asarray([2500], dtype=np.float32),
            "meta": {"timeSeries": {"rangeStartUtc": 0, "timezone": "UTC"}},
        }

        dataset = ML.build_ml_dataset(data, train_end=190)
        expected = ML.feature_row(
            avg_norm,
            peak_norm,
            4,
            2500,
            data["meta"],
            168,
        )

        np.testing.assert_allclose(dataset["x_train"][0], expected, rtol=0, atol=1e-4)
        self.assertAlmostEqual(dataset["y_train"][0], np.log1p(170.0), places=5)


if __name__ == "__main__":
    unittest.main()
