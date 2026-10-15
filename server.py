# server.py — REMOVED (fix #6)
#
# The original Flask stub was broken and dead:
#   * hardcoded interpreter path from a personal machine
#     (C:\Users\Memen\...\py.exe)
#   * "start keylogger" actually launched `python -m http.server`
#     (not a keylogger at all)
#   * `taskkill /IM http.server` is invalid syntax for what it spawned
#   * nothing in the project talked to port 5000; its routes duplicated
#     endpoints that now live properly in c2_server.js
#
# All of its intended functionality (health, client list, command relay,
# keylogger toggle) is implemented against the real Socket.IO C2 in
# c2_server.js + index.html. This file is intentionally left empty so the
# repo history shows the deletion decision. See PROTOCOL.md for the API.
