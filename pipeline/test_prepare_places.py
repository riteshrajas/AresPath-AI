import io
import zipfile
import pytest
from pipeline.prepare_places import convert

def source(longitude='323.103', duplicate_longitude='323.103'):
    def mark(lon):
        fields = dict(link='http://planetarynames.wr.usgs.gov/Feature/1', approval='Adopted by IAU', center_lon=lon, center_lat='-27', diameter='66', code='AA', type='Crater, craters')
        return '<Placemark><name>Test</name><ExtendedData><SchemaData>' + ''.join(f'<SimpleData name="{key}">{value}</SimpleData>' for key,value in fields.items()) + '</SchemaData></ExtendedData></Placemark>'
    xml = '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' + mark(longitude) + mark(duplicate_longitude) + '</Document></kml>'
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive: archive.writestr('places.kml', xml)
    return stream.getvalue()

def test_normalizes_longitude_and_deduplicates_identical_official_records():
    records = convert(source())
    assert len(records) == 1
    assert records[0]['longitude'] == -36.897
    assert records[0]['category'] == 'craters'

def test_conflicting_duplicate_is_not_silently_replaced():
    with pytest.raises(ValueError, match='Conflicting duplicate'): convert(source(duplicate_longitude='300'))
