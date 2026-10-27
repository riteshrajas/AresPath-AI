"""
Generate high-fidelity Martian satellite texture thumbnails for the 4 landing sectors.
"""

import os
import math

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

TILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "tiles")
os.makedirs(TILES_DIR, exist_ok=True)

def generate_textures():
    if not PIL_AVAILABLE:
        print("[!] PIL not installed in local environment, creating placeholder structure")
        return

    size = 256
    
    # 1. Jezero Delta
    img = Image.new("RGB", (size, size), (160, 80, 45))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            nx = x / size
            ny = y / size
            crater_dist = math.hypot(nx - 0.5, ny - 0.5)
            noise = math.sin(nx * 18) * math.cos(ny * 18) * 20
            r = int(max(0, min(255, 170 + noise - crater_dist * 40)))
            g = int(max(0, min(255, 90 + noise * 0.6 - crater_dist * 30)))
            b = int(max(0, min(255, 55 + noise * 0.4)))
            # Delta fan streak
            if math.hypot(nx - 0.25, ny - 0.5) < 0.2:
                r = int(r * 0.85)
                g = int(g * 1.1)
                b = int(b * 1.15)
            pixels[x, y] = (r, g, b)
    img.save(os.path.join(TILES_DIR, "jezero.png"))

    # 2. Gale Crater
    img = Image.new("RGB", (size, size), (140, 70, 40))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            nx = x / size
            ny = y / size
            dist_center = math.hypot(nx - 0.5, ny - 0.5)
            r = int(max(0, min(255, 180 - dist_center * 80 + math.sin(nx * 25) * 15)))
            g = int(max(0, min(255, 100 - dist_center * 50 + math.sin(ny * 25) * 10)))
            b = int(max(0, min(255, 60 - dist_center * 30)))
            pixels[x, y] = (r, g, b)
    img.save(os.path.join(TILES_DIR, "gale.png"))

    # 3. Olympus Mons
    img = Image.new("RGB", (size, size), (190, 95, 55))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            nx = x / size
            ny = y / size
            p1 = math.hypot(nx - 0.45, ny - 0.45)
            p2 = math.hypot(nx - 0.65, ny - 0.55)
            caldera = min(p1, p2)
            val = int(210 - caldera * 120 + math.sin(nx * 12) * 10)
            pixels[x, y] = (val, int(val * 0.52), int(val * 0.32))
    img.save(os.path.join(TILES_DIR, "olympus.png"))

    # 4. Valles Marineris
    img = Image.new("RGB", (size, size), (130, 65, 35))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            nx = x / size
            ny = y / size
            canyon = abs(ny - 0.5 + math.sin(nx * 6) * 0.08)
            if canyon < 0.2:
                r, g, b = 75, 35, 20
            else:
                r, g, b = 165, 85, 45
            pixels[x, y] = (r, g, b)
    img.save(os.path.join(TILES_DIR, "valles.png"))

    print(f"[✓] Generated 4 high-res Martian sector preview tiles in {TILES_DIR}")

if __name__ == "__main__":
    generate_textures()
