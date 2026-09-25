import paramiko
import time

def dispatch():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("[*] Connecting to SECS Yoko (yoko.secs.oakland.edu)...")
    client.connect("yoko.secs.oakland.edu", username="riteshraja", password="Rainb0w@1234")
    
    cmd = """
    cd ~/arespath
    nohup ~/elisa/venv_yoko/bin/python yoko_mars_stitcher.py > arespath.log 2>&1 &
    sleep 3
    ps aux | grep yoko_mars_stitcher.py | grep -v grep
    """
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print("[+] Launched job on Yoko:")
    print(out)
    if err.strip():
        print("[!] Stderr:", err)
        
    client.close()

if __name__ == "__main__":
    dispatch()
