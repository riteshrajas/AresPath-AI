import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("yoko.secs.oakland.edu", username="riteshraja", password="Rainb0w@1234")

cmd = """
~/elisa/venv_yoko/bin/python -c '
for pkg in ["requests", "PIL", "numpy", "torch", "scipy", "cv2"]:
    try:
        __import__(pkg)
        print(f"  ✓ {pkg}: installed")
    except ImportError:
        print(f"  ✗ {pkg}: missing")
'
"""
stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode())
client.close()
