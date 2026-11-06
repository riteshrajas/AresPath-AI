"""Download official IAU/USGS Mars centers; create a small offline browser catalog."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

SOURCE = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz'
NS = {'k': 'http://www.opengis.net/kml/2.2'}

def category(code):
    if code == 'AA': return 'craters'
    if code in ('MO', 'TH', 'PE'): return 'mountains'
    if code in ('VA', 'CM', 'FO', 'CA', 'LB'): return 'valleys'
    if code in ('PL', 'PM', 'PA', 'VS'): return 'plains'
    if code in ('TA', 'AL'): return 'regions'
    return 'other'

def convert(payload):
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        root = ET.fromstring(archive.read(next(name for name in archive.namelist() if name.lower().endswith('.kml'))))
    records, ids = [], {}
    for mark in root.findall('.//k:Placemark', NS):
        fields = {node.attrib['name']: node.text or '' for node in mark.findall('.//k:SimpleData', NS)}
        match = re.search(r'/Feature/(\d+)', fields.get('link', ''))
        if not match or fields.get('approval') != 'Adopted by IAU': continue
        identifier = match.group(1)
        if identifier in ids:
            if ids[identifier] != fields: raise ValueError('Conflicting duplicate official feature ID')
            continue
        ids[identifier] = fields
        longitude = (float(fields['center_lon']) + 180) % 360 - 180
        latitude = float(fields['center_lat'])
        diameter = float(fields.get('diameter') or 0)
        if not math.isfinite(longitude) or not -90 <= latitude <= 90 or not math.isfinite(diameter) or diameter < 0:
            raise ValueError('Invalid feature coordinates or size')
        records.append(dict(id=identifier, name=mark.findtext('k:name', '', NS),
            longitude=round(longitude, 6), latitude=latitude,
            diameter_km=diameter, type=fields.get('type', ''),
            category=category(fields.get('code')), origin=fields.get('origin', ''),
            source_url=f'https://planetarynames.wr.usgs.gov/Feature/{identifier}'))
    if not records: raise ValueError('No approved features found; source format may have changed')
    return sorted(records, key=lambda row: row['name'].casefold())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'frontend/public/data/mars-places.json')
    args = parser.parse_args()
    with urllib.request.urlopen(SOURCE, timeout=60) as response: payload = response.read()
    features = convert(payload)
    catalog = dict(schema_version=1, source=SOURCE,
        attribution='Gazetteer of Planetary Nomenclature — IAU WGPSN / USGS Astrogeology, supported by NASA',
        retrieved_at=datetime.now(timezone.utc).isoformat(), source_sha256=hashlib.sha256(payload).hexdigest(),
        coordinates='Planetocentric latitude; east-positive longitude normalized to [-180, 180). Feature centers, not boundary polygons.',
        count=len(features), features=features)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(args.output)
    print(f'{len(features)} approved places: {args.output} ({args.output.stat().st_size:,} bytes)')
    print(dict(Counter(row['category'] for row in features)))

if __name__ == '__main__': main()
