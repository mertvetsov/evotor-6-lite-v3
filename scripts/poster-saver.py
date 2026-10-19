# Receives PNG data URLs from capture.html (POST /save?name=...) and writes them to OUT_DIR.
# Usage: python3 scripts/poster-saver.py /path/to/out_dir   then open http://localhost:5174/capture.html and run  await window.capture()

import base64, http.server, sys, urllib.parse, os
OUT = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:5174')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        name = os.path.basename(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)['name'][0])
        if not name.replace('-', '').isalnum(): self.send_response(400); self.end_headers(); return
        data = self.rfile.read(int(self.headers['Content-Length'])).decode()
        open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(data.split(',', 1)[1]))
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
http.server.HTTPServer(('127.0.0.1', 5199), H).serve_forever()
