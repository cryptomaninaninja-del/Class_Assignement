# Cipher C2 — Isolated Classroom Lab (v2, fixed build)

Ethical-hacking class demo project. The C2 + implants exist **only** so the
class can practice *detecting* and *analyzing* RAT traffic on isolated lab
machines. Do not run outside an air-gapped/VLAN-isolated environment.

## Quick start
```bash
npm install                 # server deps
node c2_server.js           # prints the API key; also saved to .api_key
node rat_virus.js           # terminal 2: JS implant (lab VM A)
pip install -r requirements.txt
python rat_python_client.py # terminal 3: Python implant (lab VM B)
```
Open `http://<server>:8443/` , paste the API key from the server console,
select an implant, send commands (`execute`, `list_files`, `screenshot`,
simulated `start_keylogger`, …). Results stream live over the socket.

## Layout
| file | role |
|---|---|
| `c2_server.js` | Express + Socket.IO command & control server |
| `rat_virus.js` | JS implant (socket protocol v2) |
| `rat_python_client.py` | Python implant (keylogger is **simulated**) |
| `index.html` / `style.css` | operator dashboard (authenticated socket client) |
| `PROTOCOL.md` | canonical event contract — keep all components in sync |
| `server.py` | removed Flask stub (see file header for why) |

## What was fixed (assignment notes)
1–8 see PROTOCOL.md / file headers: unified event names, room-based routing,
Python↔JS↔dashboard parity, real auth flow (no hardcoded keys), payload
generator now emits protocol-v2 clients, dead code removed.

## Detection exercises (next lessons)
- Network: periodic WebSocket heartbeats to a single host on :8443.
- Host: unexpected `node`/`python` child shells, outbound sockets.
- Config: `.api_key` file, payloads/ artifacts.
