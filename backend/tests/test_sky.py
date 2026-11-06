import numpy as np
import pytest
from backend.app.sky import ROOT, snapshot

@pytest.mark.skipif(not (ROOT / 'de440s.bsp').exists(), reason='Run pipeline/prepare_sky.py')
def test_real_sky_rotation_and_distances():
    pytest.importorskip('spiceypy')
    first = snapshot(29891520)  # 2026 epoch, within DE440s coverage
    later = snapshot(29891580)
    stars = np.asarray(first['stars'])
    assert len(stars) > 1000
    np.testing.assert_allclose(np.linalg.norm(stars[:, :3], axis=1), 1, atol=1e-10)
    assert not np.allclose(stars[:, :3], np.asarray(later['stars'])[:, :3])
    sun = next(body for body in first['bodies'] if body['name'] == 'Sun')
    assert 2e8 < sun['distance_km'] < 2.6e8
    for body in first['bodies']:
        assert np.isclose(np.linalg.norm(body['direction']), 1)
