#!/usr/bin/env python3
"""
Simple HTTP test server for friscy networking tests.

Usage:
    python3 test_server.py [port]

Default port: 8080
"""

import http.server
import socketserver
import sys
import json
from datetime import datetime

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class TestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Connection', 'close')
        self.end_headers()

        response = {
            "status": "success",
            "message": "Hello from friscy test server!",
            "path": self.path,
            "headers": dict(self.headers),
            "timestamp": datetime.now().isoformat(),
            "server": "friscy-test-server/1.0"
        }

        body = json.dumps(response, indent=2) + "\n"
        self.wfile.write(body.encode())

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Connection', 'close')
        self.end_headers()

        response = {
            "status": "success",
            "message": "POST received",
            "path": self.path,
            "body_length": content_length,
            "body": body[:1000],  # Truncate for safety
            "timestamp": datetime.now().isoformat()
        }

        self.wfile.write(json.dumps(response, indent=2).encode())

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), TestHandler) as httpd:
        print(f"Test server listening on http://localhost:{PORT}")
        print("Endpoints:")
        print(f"  GET  http://localhost:{PORT}/          - Returns JSON status")
        print(f"  GET  http://localhost:{PORT}/test      - Returns JSON with path")
        print(f"  POST http://localhost:{PORT}/echo      - Echoes POST body")
        print("\nPress Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
