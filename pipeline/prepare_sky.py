"""Download NASA data for the optional real-time sky (no API key)."""
import base64
import hashlib
import json
from pathlib import Path
import struct
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'sky'
FILES = {
    'de440s.bsp': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp',
    'pck00011.tpc': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc',
    'naif0012.tls': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls',
}

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in FILES.items():
        path = ROOT / name
        if not path.exists():
            temporary = path.with_suffix(path.suffix + '.partial')
            urllib.request.urlretrieve(url, temporary)
            temporary.replace(path)
        manifest[name] = {'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        print(name, path.stat().st_size)
    url = 'https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync?' + urllib.parse.urlencode({
        'REQUEST': 'doQuery', 'LANG': 'ADQL',
        'QUERY': 'SELECT ra,dec,vmag FROM bsc5p WHERE vmag < 6'})
    raw = urllib.request.urlopen(url, timeout=90).read()
    document = ET.fromstring(raw)
    stream = document.find('.//{*}STREAM')
    if stream is None:
        raise RuntimeError('HEASARC returned no catalog stream')
    stars = list(struct.iter_unpack('>ddf', base64.b64decode(stream.text)))
    if len(stars) < 1000:
        raise RuntimeError('Incomplete star catalog')
    (ROOT / 'stars.json').write_text(json.dumps(stars), encoding='utf-8')
    manifest['stars'] = {'url': url, 'count': len(stars), 'epoch': 'J2000; proper motion not applied'}
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('stars', len(stars))

if __name__ == '__main__':
    main()
