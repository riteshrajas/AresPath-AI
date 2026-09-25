import os
import math
import requests
import json

JEZERO_LAT = 18.38
JEZERO_LON = 77.58

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
IMAGES_DIR = os.path.join(DATA_DIR, "raw_tiles")
WEATHER_DIR = os.path.join(DATA_DIR, "weather")

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(WEATHER_DIR, exist_ok=True)

def lon_lat_to_tile(lon, lat, zoom):
    """
    Computes equirectangular tile coordinates (z, y, x) for NASA Mars Trek.
    """
    n_x = 2 ** zoom
    n_y = 2 ** (zoom - 1) if zoom > 0 else 1
    
    x = int(((lon + 180.0) % 360.0) / 360.0 * n_x)
    y = int((90.0 - lat) / 180.0 * n_y)
    return x, y

def download_nasa_mars_tiles(zoom=7, radius_tiles=2):
    """
    Downloads high-resolution MOLA and Viking tiles centered over Jezero Crater.
    """
    center_x, center_y = lon_lat_to_tile(JEZERO_LON, JEZERO_LAT, zoom)
    print(f"[*] Jezero Crater ({JEZERO_LAT}°N, {JEZERO_LON}°E) -> Center Tile: z={zoom}, x={center_x}, y={center_y}")
    
    layers = {
        "viking_color": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_231m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
        "mola_elevation": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m_8ppd/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
        "themis_ir": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS_IR_Day_mosaic_global_100m/1.0.0/default/default028mm/{z}/{y}/{x}.png"
    }
    
    downloaded_files = {k: [] for k in layers}
    
    for layer_name, url_template in layers.items():
        layer_dir = os.path.join(IMAGES_DIR, layer_name)
        os.makedirs(layer_dir, exist_ok=True)
        print(f"\n[+] Fetching {layer_name} tiles...")
        
        for dy in range(-radius_tiles, radius_tiles + 1):
            for dx in range(-radius_tiles, radius_tiles + 1):
                tx = center_x + dx
                ty = center_y + dy
                url = url_template.format(z=zoom, y=ty, x=tx)
                ext = "png" if "png" in url_template else "jpg"
                out_path = os.path.join(layer_dir, f"tile_z{zoom}_y{ty}_x{tx}.{ext}")
                
                try:
                    res = requests.get(url, timeout=15)
                    if res.status_code == 200 and len(res.content) > 1000:
                        with open(out_path, "wb") as f:
                            f.write(res.content)
                        downloaded_files[layer_name].append(out_path)
                        print(f"  ✓ Downloaded: ({tx}, {ty}) [{len(res.content)//1024} KB]")
                    else:
                        print(f"  ✗ Tile not available: ({tx}, {ty}) [HTTP {res.status_code}]")
                except Exception as e:
                    print(f"  ✗ Error on ({tx}, {ty}): {e}")
                    
    return downloaded_files

def download_perseverance_weather():
    """
    Downloads historical and recent weather logs from Perseverance/Curiosity open feeds.
    """
    print("\n[+] Downloading Martian weather telemetry...")
    url = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            out_file = os.path.join(WEATHER_DIR, "surface_weather_telemetry.json")
            with open(out_file, "w") as f:
                json.dump(res.json(), f, indent=2)
            print(f"  ✓ Weather telemetry saved -> {out_file}")
            return out_file
    except Exception as e:
        print(f"  ✗ Failed to download weather telemetry: {e}")
    return None

if __name__ == "__main__":
    download_nasa_mars_tiles(zoom=6, radius_tiles=1)
    download_perseverance_weather()
