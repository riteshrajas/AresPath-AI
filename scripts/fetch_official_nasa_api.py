"""
Download 100% REAL, validated binary JPEG images directly from the official NASA Images API (images-api.nasa.gov).
"""

import os
import urllib.request
import json
import ssl

TILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "tiles", "real_nasa")
os.makedirs(TILES_DIR, exist_ok=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

QUERIES = {
    "jezero_real.jpg": "Jezero Crater Perseverance Mars",
    "gale_real.jpg": "Gale Crater Curiosity Mars",
    "olympus_real.jpg": "Olympus Mons Mars Viking",
    "valles_real.jpg": "Valles Marineris Mars"
}

def download_validated_nasa_images():
    headers = {"User-Agent": "AresPathAI-NASA-SpaceApps/1.0"}
    
    for filename, query in QUERIES.items():
        search_url = f"https://images-api.nasa.gov/search?q={urllib.parse.quote(query)}&media_type=image"
        print(f"[*] Searching official NASA API for '{query}'...")
        
        try:
            req = urllib.request.Request(search_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            
            items = data.get("collection", {}).get("items", [])
            if not items:
                print(f"[!] No items found for {query}")
                continue
            
            # Find direct JPG link
            jpg_url = None
            for item in items:
                links = item.get("links", [])
                for link in links:
                    href = link.get("href", "")
                    if href.endswith(".jpg") or href.endswith(".jpeg"):
                        jpg_url = href
                        break
                if jpg_url:
                    break
            
            if not jpg_url:
                print(f"[!] No direct JPG link found for {query}")
                continue
            
            print(f"[*] Downloading binary JPG from NASA: {jpg_url}...")
            output_path = os.path.join(TILES_DIR, filename)
            
            img_req = urllib.request.Request(jpg_url, headers=headers)
            with urllib.request.urlopen(img_req, context=ctx, timeout=20) as img_resp, open(output_path, "wb") as out:
                out.write(img_resp.read())
            
            # Validate magic bytes for JPEG: 0xFF 0xD8 0xFF
            with open(output_path, "rb") as f:
                header = f.read(3)
                is_valid_jpeg = (header == b'\xff\xd8\xff')
            
            size_kb = round(os.path.getsize(output_path) / 1024, 1)
            if is_valid_jpeg:
                print(f"[✓] VERIFIED JPEG: {filename} ({size_kb} KB) successfully saved!")
            else:
                print(f"[!] Warning: File {filename} does not have valid JPEG magic bytes.")
                
        except Exception as e:
            print(f"[!] Error fetching {query}: {e}")

if __name__ == "__main__":
    download_validated_nasa_images()
