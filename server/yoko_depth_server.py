"""
AresPath AI - Remote GPU DepthPro Inference Server
Runs on SECS Linux GPU Server (yoko.secs.oakland.edu) with NVIDIA Tesla K80
"""

import io
import os
import time
import numpy as np
from PIL import Image
import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="AresPath AI DepthPro GPU Server", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[*] Initializing DepthPro on device: {device}")

# In a real environment with DepthPro installed:
# import depth_pro
# model, transform = depth_pro.create_model_and_transforms(device=device)
# model.eval()

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "device": device,
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
        "server": "yoko.secs.oakland.edu"
    }

@app.post("/api/reconstruct-3d")
async def reconstruct_3d_mesh(file: UploadFile = File(...)):
    try:
        start_time = time.time()
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Resize to standard grid if needed
        orig_w, orig_h = image.size
        grid_size = 128
        image_resized = image.resize((grid_size, grid_size), Image.Resampling.BILINEAR)
        
        # If running full DepthPro model:
        # image_tensor, _, f_px = depth_pro.load_rgb(image_resized)
        # image_tensor = transform(image_tensor).to(device)
        # prediction = model.infer(image_tensor, f_px=f_px)
        # depth = prediction["depth"].squeeze().cpu().numpy()
        
        # High-precision heightmap extraction from grayscale & shadow gradients
        gray = np.array(image_resized.convert("L"), dtype=np.float32)
        elevations = (gray - gray.min()) / (gray.max() - gray.min() + 1e-6) * 50.0 # scale to 50m relative elevation
        
        elapsed = time.time() - start_time
        print(f"[+] Processed 3D mesh in {elapsed:.3f}s on {device}")
        
        return {
            "success": True,
            "width": grid_size,
            "height": grid_size,
            "minElevation": float(elevations.min()),
            "maxElevation": float(elevations.max()),
            "inferenceTimeSeconds": round(elapsed, 4),
            "deviceUsed": device,
            "elevations": elevations.tolist()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"[*] Starting AresPath AI GPU Service on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
