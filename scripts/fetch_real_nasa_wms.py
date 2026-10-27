"""
Fetch REAL satellite imagery and elevation tiles directly from NASA / USGS Astrogeology WMS servers.
"""

import os
import urllib.request
import urllib.parse
import ssl

TILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "tiles", "real_nasa")
os.makedirs(TILES_DIR, exist_ok=True)

# Ignore SSL certificate errors if any for government tile servers
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# USGS Astrogeology Planetary WMS Server (Public NASA Mars Basemaps)
WMS_BASE = "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simplex.map"

# Bounding boxes [min_lon, min_lat, max_lon, max_lat] in Martian coordinates
TARGET_SECTORS = {
    "jezero_real.jpg": {
        "name": "Jezero Crater (Real NASA/USGS Viking/MOLA)",
        "bbox": "75.0,16.0,80.0,21.0"
    },
    "gale_real.jpg": {
        "name": "Gale Crater & Mount Sharp (Real NASA/USGS)",
        "bbox": "135.0,-8.0,140.0,-3.0"
    },
    "olympus_real.jpg": {
        "name": "Olympus Mons (Real NASA/USGS)",
        "bbox": "220.0,15.0,230.0,25.0"
    },
    "valles_real.jpg": {
        "name": "Valles Marineris (Real NASA/USGS)",
        "bbox": "285.0,-18.0,305.0,-8.0"
    }
}

def fetch_real_nasa_tiles():
    headers = {
        "User-Agent": "AresPathAI-NASA-SpaceApps/1.0"
    }
    
    print("[*] Contacting NASA / USGS Planetary WMS MapServer...")
    
    for filename, info in TARGET_SECTORS.items():
        params = {
            "service": "WMS",
            "version": "1.1.1",
            "request": "GetMap",
            "layers": "MDIM21",  # NASA Viking Mars Digital Image Mosaic 2.1
            "styles": "",
            "srs": "EPSG:4326",
            "bbox": info["bbox"],
            "width": "512",
            "height": "512",
            "format": "image/jpeg"
        }
        
        query_string = urllib.parse.urlencode(params)
        url = f"{WMS_BASE}&{query_string}"
        output_path = os.path.join(TILES_DIR, filename)
        
        print(f"[*] Downloading {info['name']} from {url[:80]}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=20) as response, open(output_path, 'wb') as out_file:
                out_file.write(response.read())
            
            file_size_kb = round(os.path.getsize(output_path) / 1024, 1)
            print(f"[✓] Successfully downloaded {filename} ({file_size_kb} KB)")
        except Exception as e:
            print(f"[!] Error downloading {filename}: {e}")

if __name__ == "__main__":
    fetch_real_nasa_tiles()
