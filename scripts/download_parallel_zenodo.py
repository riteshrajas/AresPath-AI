"""
High-Speed Multi-Threaded Parallel Downloader for AI4Mars Zenodo dataset.
Spawns 8 concurrent HTTP Range threads to multiply download bandwidth.
"""

import os
import sys
import time
import threading
import urllib.request
import ssl

DEST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ai4mars")
os.makedirs(DEST_DIR, exist_ok=True)

DEST_FILE = os.path.join(DEST_DIR, "ai4mars-dataset-merged-0.6.zip")
URL = "https://zenodo.org/records/15995036/files/ai4mars-dataset-merged-0.6.zip?download=1"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

NUM_THREADS = 8

def get_content_length():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 MultiThreaded/1.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return int(resp.headers.get("Content-Length", 16235454642))

def download_part(start_byte, end_byte, part_file, thread_id, progress_tracker):
    current_size = os.path.getsize(part_file) if os.path.exists(part_file) else 0
    actual_start = start_byte + current_size
    
    if actual_start >= end_byte:
        progress_tracker[thread_id] = end_byte - start_byte
        return

    headers = {
        "User-Agent": f"Mozilla/5.0 Thread-{thread_id}/1.0",
        "Range": f"bytes={actual_start}-{end_byte}"
    }

    req = urllib.request.Request(URL, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp, open(part_file, "ab" if current_size > 0 else "wb") as out:
            chunk_size = 1024 * 1024
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
                current_size += len(chunk)
                progress_tracker[thread_id] = current_size
    except Exception as e:
        print(f"[Thread {thread_id}] Error: {e}", flush=True)

def main():
    total_size = get_content_length()
    total_gb = round(total_size / (1024 ** 3), 2)
    print(f"[*] Starting 8-Thread Accelerated Parallel Download for {total_gb} GB...", flush=True)
    
    part_size = total_size // NUM_THREADS
    threads = []
    part_files = []
    progress_tracker = [0] * NUM_THREADS

    for i in range(NUM_THREADS):
        start = i * part_size
        end = total_size - 1 if i == NUM_THREADS - 1 else (i + 1) * part_size - 1
        part_file = os.path.join(DEST_DIR, f"part_{i}.tmp")
        part_files.append(part_file)
        
        t = threading.Thread(target=download_part, args=(start, end, part_file, i, progress_tracker))
        threads.append(t)
        t.daemon = True
        t.start()

    start_time = time.time()
    while any(t.is_alive() for t in threads):
        time.sleep(3)
        downloaded = sum(progress_tracker)
        elapsed = time.time() - start_time
        speed_mbps = round((downloaded / (1024 * 1024)) / (elapsed + 1e-6), 2)
        pct = round((downloaded / total_size) * 100, 1)
        dl_gb = round(downloaded / (1024 ** 3), 2)
        rem_min = round(((total_size - downloaded) / ((speed_mbps * 1024 * 1024) + 1e-6)) / 60, 1)
        print(f"[*] [8-Streams] Progress: {dl_gb}/{total_gb} GB ({pct}%) | Combined Speed: {speed_mbps} MB/s | ETA: {rem_min} min", flush=True)

    for t in threads:
        t.join()

    print("[*] Merging 8 downloaded parts into final ZIP file...", flush=True)
    with open(DEST_FILE, "wb") as final_zip:
        for part in part_files:
            with open(part, "rb") as p:
                while True:
                    b = p.read(1024 * 1024 * 16)
                    if not b:
                        break
                    final_zip.write(b)
            os.remove(part)

    print(f"[✓] ALL 8 PARTS MERGED: {DEST_FILE} ({total_gb} GB) ready!", flush=True)

if __name__ == "__main__":
    main()
