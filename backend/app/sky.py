"""Offline SPICE sky directions in Mars body-fixed coordinates."""
import json
import threading
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2] / 'data' / 'sky'
LOCK = threading.Lock()

@lru_cache(maxsize=1)
def catalog():
    return json.loads((ROOT / 'stars.json').read_text())

@lru_cache(maxsize=8)
def snapshot(minute):
    import spiceypy as spice
    with LOCK:
        for name in ('naif0012.tls', 'pck00011.tpc', 'de440s.bsp'):
            spice.furnsh(str(ROOT / name))
        try:
            utc = datetime.fromtimestamp(minute * 60, timezone.utc).isoformat()
            et = spice.str2et(datetime.fromtimestamp(minute * 60, timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'))
            rotation = spice.pxform('J2000', 'IAU_MARS', et)
            stars = np.asarray(catalog())
            ra, dec = np.radians(stars[:, 0]), np.radians(stars[:, 1])
            unit = np.column_stack((np.cos(dec)*np.cos(ra), np.cos(dec)*np.sin(ra), np.sin(dec)))
            vectors = unit @ rotation.T
            # Convert body-fixed XYZ to the globe's Y-up, east-longitude frame.
            convert = lambda v: [float(v[0]), float(v[2]), float(-v[1])]
            bodies = []
            for name, target in [('Sun','10'), ('Mercury','1'), ('Venus','2'), ('Earth','3'),
                                 ('Jupiter','5'), ('Saturn','6'), ('Uranus','7'), ('Neptune','8')]:
                vector, _ = spice.spkpos(target, et, 'J2000', 'LT+S', '4')
                distance = float(np.linalg.norm(vector))
                bodies.append({'name': name, 'direction': convert(rotation @ (vector / distance)), 'distance_km': distance})
            return {'utc': utc, 'stars': [convert(v) + [float(m)] for v, m in zip(vectors, stars[:, 2])],
                    'bodies': bodies, 'source': 'NASA/JPL DE440s + IAU_MARS PCK; HEASARC BSC5P',
                    'limitations': ['Mars barycenter observer; no surface parallax', 'J2000 catalog positions; no stellar proper motion',
                                    'Illustrative brightness; no dust/refraction model; no Phobos/Deimos kernel']}
        finally:
            spice.kclear()

def current_sky():
    return snapshot(int(datetime.now(timezone.utc).timestamp() // 60))
