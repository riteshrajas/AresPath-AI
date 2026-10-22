"""Analytical check of slope units; verifies flat and 45-degree terrain."""
import unittest
import numpy as np
from verified_terrain import slope_degrees


class SlopeTests(unittest.TestCase):
    def test_analytic_slopes_in_meters(self):
        mask = np.ones((5, 5), dtype=bool)
        flat = slope_degrees(np.zeros((5, 5)), mask, 3, 7)
        np.testing.assert_allclose(flat, 0)
        plane = np.tile(np.arange(5) * 3.0, (5, 1))
        np.testing.assert_allclose(slope_degrees(plane, mask, 3, 7), 45)

    def test_nodata_is_not_a_cliff(self):
        plane = np.zeros((5, 5))
        plane[2, 2] = -3.4e38
        mask = np.ones((5, 5), dtype=bool)
        mask[2, 2] = False
        result = slope_degrees(plane, mask, 3, 7)
        self.assertTrue(np.isnan(result[2, 1]))
        np.testing.assert_allclose(result[np.isfinite(result)], 0)


if __name__ == '__main__':
    unittest.main()
