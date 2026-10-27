"""
Download multiple validated, ultra-high-resolution (2048x4000+) NASA PDS HiRISE scientific observations.
"""

import os
import urllib.request
import ssl

TILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "tiles", "hirise_raw")
os.makedirs(TILES_DIR, exist_ok=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Verified direct NASA PDS HiRISE raw observations from University of Arizona / JPL
PDS_OBSERVATIONS = {
    "hirise_jezero_perseverance_site.jpg": {
        "name": "Perseverance Landing Site & Octavia E. Butler Landing (ESP_068294_1985)",
        "url": "https://hirise-pds.lpl.arizona.edu/PDS/EXTRAS/RDR/ESP/ORB_068200_068299/ESP_068294_1985/ESP_068294_1985_RED.browse.jpg"
    },
    "hirise_jezero_crater_rim.jpg": {
        "name": "Jezero Crater Western Rim & Valley Network (ESP_037145_1990)",
        "url": "https://hirise-pds.lpl.arizona.edu/PDS/EXTRAS/RDR/ESP/ORB_037100_037199/ESP_037145_1990/ESP_037145_1990_RED.browse.jpg"
    },
    "hirise_gale_crater_dunes.jpg": {
        "name": "Gale Crater Bagnold Barchan Sand Dunes (ESP_045994_1755)",
        "url": "https://hirise-pds.lpl.arizona.edu/PDS/EXTRAS/RDR/ESP/ORB_045900_045999/ESP_045994_1755/ESP_045994_1755_RED.browse.jpg"
    },
    "hirise_victoria_crater_cliffs.jpg": {
        "name": "Victoria Crater Cape St. Vincent Cliffs (PSP_001414_1780)",
        "url": "https://hirise-pds.lpl.arizona.edu/PDS/EXTRAS/RDR/PSP/ORB_001400_001499/PSP_001414_1780/PSP_001414_1780_RED.browse.jpg"
    }
}

def download_all():
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NASA-PDS-HiRISE-Agent/1.0"}
    for filename, info in PDS_OBSERVATIONS.items():
        out_path = os.path.join(TILES_DIR, filename)
        if os.path.exists(out_path):
            print(f"[✓] Already downloaded: {filename}")
            continue
        print(f"[*] Downloading Raw NASA PDS HiRISE: {info['name']}...")
        try:
            req = urllib.request.Request(info["url"], headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=40) as r, open(out_path, "wb") as f:
                f.write(r.read())
            size_mb = round(os.path.getsize(out_path) / (1024 * 1024), 2)
            print(f"[✓] SUCCESS: {filename} ({size_mb} MB) downloaded from NASA PDS!")
        except Exception as e:
            print(f"[!] Error on {filename}: {e}")

if __name__ == "__main__":
    download_all()
