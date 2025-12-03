#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 5000
DIRECTORY = "."

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ReuseAddrTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def main():
    Handler = MyHTTPRequestHandler
    
    with ReuseAddrTCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Server running at http://0.0.0.0:{PORT}/")
        print(f"Serving directory: {os.path.abspath(DIRECTORY)}")
        print(f"\nAccess the demo at:")
        print(f"  - Main page: http://0.0.0.0:{PORT}/")
        print(f"  - Test gallery: http://0.0.0.0:{PORT}/test-gallery.html")
        print(f"  - Action Press style: http://0.0.0.0:{PORT}/test-actionpress.html")
        print(f"  - Lazy loading test: http://0.0.0.0:{PORT}/test-lazy-loading.html")
        print(f"\nPress Ctrl+C to stop the server")
        httpd.serve_forever()

if __name__ == "__main__":
    main()
