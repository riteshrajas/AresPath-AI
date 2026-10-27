"""
Resilient Auto-Resuming Downloader for NASA AI4Mars Dataset from Zenodo.
Downloads to local project directory with HTTP Range resuming and retry loops.
"""

import os
import sys
import time
import urllib.request
import ssl

DEST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ai4mars")
os.makedirs(DEST_DIR, exist_ok=True)

DEST_FILE = os.path.join(DEST_DIR, "ai4mars-dataset-merged-0.6.zip")
URL = "https://zenodo.org/records/15995036/files/ai4mars-dataset-merged-0.6.zip?download=1"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def download_with_resume():
    print(f"[*] Local Destination: {DEST_FILE}", flush=True)
    print(f"[*] Source: {URL}", flush=True)

    max_retries = 50
    retry_count = 0

    while retry_count < max_retries:
        existing_bytes = os.path.getsize(DEST_FILE) if os.path.exists(DEST_FILE) else 0
        existing_gb = round(existing_bytes / (1024 ** 3), 2)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Resilient-AI4Mars/1.0"
        }
        
        if existing_bytes > 0:
            headers["Range"] = f"bytes={existing_bytes}-"
            print(f"[*] Resuming from byte offset: {existing_bytes} ({existing_gb} GB)...", flush=True)
        else:
            print("[*] Starting fresh download...", flush=True)

        req = urllib.request.Request(URL, headers=headers)
        
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
                content_range = response.headers.get("Content-Range")
                content_length = response.headers.get("Content-Length")
                
                if content_range:
                    # Format: bytes 6657802240-16235454641/16235454642
                    total_bytes = int(content_range.split('/')[-1])
                elif content_length:
                    total_bytes = existing_bytes + int(content_length)
                else:
                    total_bytes = 16235454642 # ~15.12 GB

                total_gb = round(total_bytes / (1024 ** 3), 2)
                mode = "ab" if existing_bytes > 0 else "wb"
                
                print(f"[*] Connected. Target total: {total_gb} GB. Writing mode: {mode}", flush=True)
                
                with open(DEST_FILE, mode) as out_file:
                    downloaded = existing_bytes
                    chunk_size = 1024 * 1024 * 4 # 4MB chunks
                    start_time = time.time()
                    last_report = time.time()
                    
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        downloaded += len(chunk)
                        
                        if time.time() - last_report > 4.0:
                            last_report = time.time()
                            elapsed = time.time() - start_time
                            rate_mb = round(((downloaded - existing_bytes) / (1024 * 1024)) / (elapsed + 1e-6), 2)
                            pct = round((downloaded / total_bytes) * 100, 1)
                            dl_gb = round(downloaded / (1024 ** 3), 2)
                            rem_bytes = total_bytes - downloaded
                            rem_min = round((rem_bytes / ((rate_mb * 1024 * 1024) + 1e-6)) / 60, 1) if rate_mb > 0 else 0
                            print(f"[*] Progress: {dl_gb}/{total_gb} GB ({pct}%) | Speed: {rate_mb} MB/s | ETA: {rem_min} min", flush=True)
            
            # Check if fully finished
            final_size = os.path.getsize(DEST_FILE)
            if final_size >= total_bytes - 1024:
                print(f"[✓] COMPLETE: NASA AI4Mars dataset fully downloaded ({round(final_size/(1024**3), 2)} GB)!", flush=True)
                return
                
        except Exception as e:
            retry_count += 1
            print(f"[!] Stream interrupted ({e}). Retrying ({retry_count}/{max_retries}) in 5 seconds...", flush=True)
            time.sleep(5)

if __name__ == "__main__":
    download_with_resume()
