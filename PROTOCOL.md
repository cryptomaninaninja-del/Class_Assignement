# Protocol v2 — canonical event contract (single source of truth)

All components (c2_server.js, rat_virus.js, rat_python_client.py, payload
generator output, index.html dashboard) MUST use exactly these names/shapes.

## Roles
- **implant**: connects, emits `register`, handles commands.
- **operator** (dashboard): connects with `auth: { apiKey }`, then emits
  `operator_hello` for a full snapshot; sends `dashboard_command`.

## Server → Implant (targeted via room named `client_id`)
| event | payload |
|---|---|
| execute | `{ command_id, command }` |
| list_files | `{ command_id, dir? }` |
| download_file | `{ command_id, remote_path }` |
| screenshot | `{ command_id }` |
| start_keylogger / stop_keylogger | `{ command_id }` |
| ping | `{ command_id }` |

## Implant → Server
| event | payload |
|---|---|
| register | `{ client_id, hostname, platform, os, arch, user? }` |
| client_heartbeat | `{ client_id }` (every ≤10s) |
| client_response | `{ client_id, command_id, action?, output, base64? }` |
| file_list | `{ client_id, command_id, dir, files[] }` |
| keylogData | `{ client_id, keys, simulated:true, ts }` |
| screenshot_data | `{ client_id, command_id, base64(png) }` |

Server relays `client_response`, `file_list`, `keylogData`,
`screenshot_data` verbatim (+ `ts`) to ALL operators.

## Operator ⇄ Server
- operator → server: `dashboard_command { client_id, action, params }`
  (action ∈ table above), `dashboard_toggle { enabled }`
- server → operator: `operator_welcome { clients[], keyloggers }`,
  `operator_denied { error }`, `command_sent {...}`, `command_rejected {error}`,
  `client_joined`, `client_disconnected`, plus the relayed result events.

## Routing rule [fix #2]
On `register`, the server does `socket.join(client_id)`; every targeted send
uses `io.to(client_id)`. A client restart rebinds the room to the new socket.

## Auth [fix #5]
- REST: header `X-API-Key`. Socket: `io({ auth:{ apiKey } })` + `operator_hello`.
- Key source: env `API_KEY` → persisted `.api_key` file → generated at first
  boot (printed on console). Never hardcoded in UI. `/api/config` exposes only
  a masked fingerprint.

## Lab safety notes
- Default bind `127.0.0.1`; set HOST only inside the isolated lab net.
- Python implant's keylogger is SIMULATED (synthetic words, flagged
  `simulated:true`) — detection exercises target its traffic/process pattern.
