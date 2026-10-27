"""
Download REAL, authentic high-resolution NASA satellite images from NASA Photojournal & JPL archives.
"""

import os
import urllib.request
import ssl

TILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "tiles", "real_nasa")
os.makedirs(TILES_DIR, exist_ok=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Direct public NASA Photojournal / JPL Planetary Archive images
REAL_NASA_URLS = {
    "jezero_real.jpg": {
        "name": "Jezero Crater Delta (NASA/JPL-Caltech/MRL/HiRISE)",
        "url": "https://photojournal.jpl.nasa.gov/jpeg/PIA23999.jpg" # Official Perseverance Jezero landing site & delta
    },
    "gale_real.jpg": {
        "name": "Gale Crater & Mount Sharp (NASA/JPL-Caltech/ESA/DLR)",
        "url": "https://photojournal.jpl.nasa.gov/jpeg/PIA16099.jpg" # Official Curiosity Gale Crater 3D topography
    },
    "olympus_real.jpg": {
        "name": "Olympus Mons Volcano (NASA/JPL/USGS)",
        "url": "https://photojournal.jpl.nasa.gov/jpeg/PIA02982.jpg" # High-res MOLA Olympus Mons
    },
    "valles_real.jpg": {
        "name": "Valles Marineris Grand Canyon (NASA/JPL/USGS)",
        "url": "https://photojournal.jpl.nasa.gov/jpeg/PIA04304.jpg" # Viking/MOLA Valles Marineris Mosaic
    }
}

def download_real_nasa_imagery():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for filename, info in REAL_NASA_URLS.items():
        output_path = os.path.join(TILES_DIR, filename)
        print(f"[*] Downloading REAL NASA image: {info['name']}...")
        try:
            req = urllib.request.Request(info["url"], headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=30) as response, open(output_path, 'wb') as out:
                out.write(response.read())
            
            size_kb = round(os.path.getsize(output_path) / 1024, 1)
            print(f"[✓] Successfully downloaded {filename} ({size_kb} KB) directly from NASA JPL Photojournal!")
        except Exception as e:
            print(f"[!] Failed to download {filename}: {e}")

if __name__ == "__main__":
    download_real_nasa_imagery()
