import paramiko

def check_yoko():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("yoko.secs.oakland.edu", username="riteshraja", password="Rainb0w@1234")
    
    cmd = """
    echo "=== HOST & GPU ==="
    hostname
    nvidia-smi --query-gpu=name,memory.total,utilization.gpu --format=csv,noheader
    echo "=== PYTHON & TORCH IN VENV_YOKO ==="
    ~/elisa/venv_yoko/bin/python -c "import torch; print(f'PyTorch {torch.__version__} | CUDA available: {torch.cuda.is_available()} | Device count: {torch.cuda.device_count()}')"
    echo "=== DISK SPACE IN HOME ==="
    df -h ~
    """
    stdin, stdout, stderr = client.exec_command(cmd)
    output = stdout.read().decode()
    errors = stderr.read().decode()
    print(output)
    if errors.strip():
        print("ERRORS:\n", errors)
    client.close()

if __name__ == "__main__":
    check_yoko()
