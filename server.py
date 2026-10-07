#!/usr/bin/env python3
"""
LingoFlow dev server — static files + text-to-speech proxy.

    python server.py          # serves http://localhost:8123/
    python server.py 9000     # custom port

Why this exists:
  The browser's Web Speech API can only speak languages that have a voice
  installed on the device. When a language has no local voice, the app asks
  this server for `/api/tts?text=…&lang=…`, which proxies Google's public
  Translate-TTS endpoint (keyless) and returns an MP3 — same origin, so no
  CORS problems. Everything else is served as plain static files.

  Opening index.html directly (file://) still works for translation, but
  online voices are unavailable without this server.
"""

import http.server
import socketserver
import sys
import urllib.parse
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

TTS_ENDPOINT = "https://translate.google.com/translate_tts"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class LingoFlowHandler(http.server.SimpleHTTPRequestHandler):
    """Static files, plus GET /api/tts?text=…&lang=… -> audio/mpeg."""

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/tts":
            self.handle_tts(urllib.parse.parse_qs(parsed.query))
            return

        super().do_GET()

    # ------------------------------------------------------------------ #
    def handle_tts(self, query: dict) -> None:
        text = (query.get("text") or [""])[0].strip()
        lang = (query.get("lang") or ["en"])[0].strip()[:12] or "en"

        if not text:
            self.send_error(400, "missing 'text' parameter")
            return
        # Google's endpoint rejects requests longer than ~200 characters.
        text = text[:200]

        url = "{}?ie=UTF-8&client=tw-ob&tl={}&q={}".format(
            TTS_ENDPOINT, urllib.parse.quote(lang), urllib.parse.quote(text)
        )
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": BROWSER_UA,
                "Referer": "https://translate.google.com/",
                "Accept": "audio/mpeg, audio/*;q=0.9, */*;q=0.5",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                data = response.read()
        except urllib.error.HTTPError as exc:
            self.send_error(502, f"voice provider said HTTP {exc.code}")
            return
        except Exception as exc:  # noqa: BLE001 - report any network failure
            self.send_error(502, f"voice provider unreachable: {exc}")
            return

        if not data:
            self.send_error(502, "voice provider returned no audio")
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    # ------------------------------------------------------------------ #
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), LingoFlowHandler) as httpd:
        print(f"LingoFlow running at http://localhost:{PORT}/  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
