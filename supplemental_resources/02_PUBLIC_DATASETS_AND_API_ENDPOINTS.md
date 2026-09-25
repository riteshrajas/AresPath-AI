# 🌐 Public Datasets, Data Portals & API Endpoints

A developer guide and API reference for programmatically acquiring publicly available Martian imagery, digital elevation models (DEMs/DTMs), atmospheric telemetry, and spectral overlays from **NASA, ESA, ISRO, CNSA, and USGS**.

---

## 🛰️ 1. NASA Mars Trek & Solar System Treks (JPL / NASA)

**NASA Mars Trek** is the single fastest and most developer-friendly way to stream planetary tiles and query elevations directly into a web map (CesiumJS, Leaflet, OpenLayers, Mapbox GL).

* **Portal:** [https://trek.nasa.gov/mars/](https://trek.nasa.gov/mars/)
* **Protocol:** OGC Web Map Tile Service (WMTS) / RESTful tile endpoints.
* **Projection:** Equirectangular (EPSG:4326) and Polar Stereographic projections.

### Direct Tile Server Endpoints
NASA Mars Trek hosts global and regional tiled map services:

```http
# Global MOLA Elevation Shaded Relief (128 ppd):
https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m_8ppd/1.0.0/default/default028mm/{z}/{y}/{x}.jpg

# Global MRO CTX Mosaic (6 meters/pixel blended basemap):
https://trek.nasa.gov/tiles/Mars/EQ/Mars_MRO_CTX_mosaic_global_6m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg

# Global Viking MDIM 2.1 Color Mosaic (231 meters/pixel true-color):
https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_231m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg

# Mars Odyssey THEMIS Daytime IR Global Mosaic (100 meters/pixel):
https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS_IR_Day_mosaic_global_100m/1.0.0/default/default028mm/{z}/{y}/{x}.png
```

### NASA Trek REST Elevation API
Query exact elevations along a path or at a coordinate:
```http
GET https://trek.nasa.gov/mars/trekServices/ws/index/eq/elevation?lat=-18.44&lon=77.45
```

---

## 🏛️ 2. NASA Planetary Data System (PDS)

The PDS is the authoritative, peer-reviewed federal repository for all NASA planetary missions.

### A. PDS Geosciences Node — Mars Orbital Data Explorer (ODE)
The ODE provides a high-performance REST API to query millions of individual MRO (HiRISE, CTX, CRISM, SHARAD) and MGS (MOLA) products.

* **Web Interface:** [https://ode.rsl.wustl.edu/mars/](https://ode.rsl.wustl.edu/mars/)
* **REST API Endpoint:** `https://oderest.rsl.wustl.edu/live2/`

#### Querying HiRISE Products via REST API:
```bash
# Query all HiRISE RDR products within a bounding box (Jezero Crater area)
curl -X GET "https://oderest.rsl.wustl.edu/live2/?target=mars&query=product&pt=RDRV11&ihid=MRO&iid=HIRISE&minlat=18.0&maxlat=19.0&minlon=77.0&maxlon=78.0&output=JSON"
```

#### Python Script: Automated HiRISE & CTX Downloader
```python
import requests
import json

def query_mars_ode(min_lat, max_lat, min_lon, max_lon, instrument="HIRISE"):
    url = "https://oderest.rsl.wustl.edu/live2/"
    params = {
        "target": "mars",
        "query": "product",
        "ihid": "MRO",
        "iid": instrument,
        "minlat": min_lat,
        "maxlat": max_lat,
        "minlon": min_lon,
        "maxlon": max_lon,
        "output": "JSON",
        "limit": 10
    }
    response = requests.get(url, params=params)
    data = response.json()
    
    products = data.get("ODEResults", {}).get("Products", {}).get("Product", [])
    print(f"Found {len(products)} products for {instrument}:")
    for prod in products:
        p_id = prod.get("pdsid")
        files = prod.get("Product_files", {}).get("Product_file", [])
        for f in files:
            if f.get("URL", "").endswith((".JP2", ".IMG", ".tif")):
                print(f"  [{p_id}] Download: {f['URL']}")

if __name__ == "__main__":
    # Query around Jezero Crater (Perseverance landing site)
    query_mars_ode(min_lat=18.3, max_lat=18.6, min_lon=77.3, max_lon=77.6, instrument="HIRISE")
```

### B. HiRISE Team Direct Data Portal (University of Arizona)
The Lunar and Planetary Laboratory (LPL) at the University of Arizona provides raw and calibrated HiRISE imagery and finished DTMs (Digital Terrain Models).

* **Direct Catalog:** [https://www.uahirise.org/](https://www.uahirise.org/)
* **HiRISE DTMs Directory:** [https://www.uahirise.org/dtm/](https://www.uahirise.org/dtm/)
* **Data Format:** `.JP2` (JPEG 2000 16-bit) and `.IMG` (PDS3 / VICAR format).

---

## 🗺️ 3. USGS Astrogeology Science Center

The USGS Astrogeology Science Center is the planetary cartography hub that calibrates raw planetary pixels into geospatial GIS-ready products.

* **Astropedia (Planetary GIS Catalog):** [https://astrogeology.usgs.gov/search?target=mars](https://astrogeology.usgs.gov/search?target=mars)
* **PILOT (Planetary Image LOcator Tool):** [https://pilot.wr.usgs.gov/](https://pilot.wr.usgs.gov/)
* **WMS Endpoints (OGC Standard):**
  ```text
  # Global MOLA Elevation WMS:
  https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map&service=WMS&request=GetCapabilities

  # Layers available:
  # - MOLA_color (MOLA shaded color elevation)
  # - MOLA_shade (MOLA grayscale shaded relief)
  # - Viking_MDIM21 (Viking global mosaic)
  # - THEMIS_IR_Day (THEMIS daytime thermal infrared)
  ```

---

## 🇪🇺 4. ESA Planetary Science Archive (PSA)

The official repository for all ESA missions to Mars (**Mars Express** and **ExoMars Trace Gas Orbiter**).

* **Portal:** [https://archives.esac.esa.int/psa/](https://archives.esac.esa.int/psa/)
* **Table Access Protocol (TAP) / REST API:** `https://archives.esac.esa.int/psa-sl-tap/tap`

#### Querying Mars Express HRSC 3D Data via TAP:
```sql
SELECT product_id, instrument_name, start_time, access_url 
FROM psa.epn_core 
WHERE target_name = 'Mars' 
  AND instrument_name = 'HRSC' 
  AND c1_min >= 77.0 AND c1_max <= 78.0 
  AND c2_min >= 18.0 AND c2_max <= 19.0
```

#### Python Script: ESA PSA TAP API Query
```python
import requests

def query_esa_psa(min_lat, max_lat, min_lon, max_lon):
    tap_url = "https://archives.esac.esa.int/psa-sl-tap/tap/sync"
    query = f"""
    SELECT TOP 20 product_id, instrument_name, access_url
    FROM psa.epn_core
    WHERE target_name = 'Mars'
      AND instrument_name LIKE '%HRSC%'
      AND c1_min >= {min_lon} AND c1_max <= {max_lon}
      AND c2_min >= {min_lat} AND c2_max <= {max_lat}
    """
    params = {
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "json",
        "QUERY": query
    }
    res = requests.get(tap_url, params=params)
    print(res.json())
```

---

## 🇮🇳 5. ISRO Indian Space Science Data Centre (ISSDC)

ISRO distributes Mars Orbiter Mission (MOM / Mangalyaan) data to the public via its scientific payload data portal.

* **Portal:** [https://www.issdc.gov.in/](https://www.issdc.gov.in/)
* **MOM Data Archive:** [https://pradan.issdc.gov.in/ch1/](https://pradan.issdc.gov.in/ch1/)
* **Products:**
  * **MCC (Mars Colour Camera):** Calibrated PDS4 Level-2 and Level-3 full-disk and regional true-color images.
  * **TIS (Thermal Infrared Spectrometer):** Radiance and brightness temperature data.
  * **MSM (Methane Sensor for Mars):** Column radiance measurements.

---

## 🇨🇳 6. CNSA Lunar and Deep Space Exploration Science Data Center

China National Space Administration publicly releases raw and processed data from the **Tianwen-1 orbiter** and **Zhurong rover**.

* **Portal:** [https://moon.bao.ac.cn/](https://moon.bao.ac.cn/)
* **Products Available:**
  * **HiRIC:** High-resolution sub-meter panchromatic image data strips (`.2C` and `.2D` calibrated levels).
  * **MoRIC:** Moderate-resolution context imagery.
  * **NaTeCam:** Zhurong rover navigation and stereo terrain images (Elysium/Utopia Planitia).
  * **MCS:** Surface meteorological logs (temperature, pressure, wind).

---

## 🇦🇪 7. Emirates Mars Mission Science Data Center (SDC)

The UAE Space Agency and Mohammed Bin Rashid Space Centre provide public access to **Hope Probe (Al-Amal)** datasets.

* **Portal:** [https://sdc.emiratesmarsmission.ae/](https://sdc.emiratesmarsmission.ae/)
* **Products Available:**
  * **EXI Level 2A / 2B:** Multi-spectral global ultraviolet and visible calibrated mosaics.
  * **EMIRS Level 2 / Level 3:** Mars global dust optical depth ($\tau$) and surface temperature maps.

---

## 💻 8. Recommended Open-Source Python Tooling

To process these datasets locally inside the **AresPath AI** pipeline, install these geospatial and planetary libraries:

```bash
pip install rasterio gdal shapely geopandas requests pds4_tools pyproj
```

* **`pds4_tools`:** Native NASA/ESA/ISRO PDS4 label and binary array parser.
* **`rasterio` / `gdal`:** Reads high-bit-depth `.JP2`, `.IMG`, and `.TIF` elevation and imagery arrays.
* **`pyproj`:** Handles Mars coordinate reference frames (Mars 2000 Sphere / Equirectangular).
