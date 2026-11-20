import argparse
import functools
import http.server
import os
import re
import signal
import socket
import ssl
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(ROOT, "certs", "localhost.pem")
DUMP_DIR = os.path.join(ROOT, "dump")
CONFIG_DIR = os.path.join(ROOT, "config")
DNS_CONF = os.path.join(CONFIG_DIR, "dns.conf")
DNS_SCRIPT = os.path.join(ROOT, "scripts", "fakedns.py")


class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_request(self, code="-", size="-"):
        if not self.path.startswith("/beacon/"):
            print("[LOG] %s %s %s" % (self.command, self.path, code), flush=True)

    def log_error(self, fmt, *args):
        print("[LOG][ERR] " + (fmt % args), flush=True)

    def replace_locale(self):
        self.path = re.sub(r"^\/document\/(\w{2})\/ps5", "/document/en/ps5", self.path)

    def do_GET(self):
        self.replace_locale()
        if self.path.startswith("/docs/") or self.path.startswith("/tools/"):
            self.send_error(404)
            return None
        return super().do_GET()

    def do_POST(self):
        self.replace_locale()
        if self.path.startswith("/beacon/"):
            return self.beacon()

        tn = self.path.lstrip("/document/en/ps5/")
        print("!POST!: tn:\n" + tn)
        fn = tn
        if not tn.startswith("T_"):
            if fn != "a.bin":
                print("!POST!: INFO: " + str(self.rfile.read(int(self.headers["Content-length"]))), "utf-8")
                return
            fn = time.strftime("%Y%m%d-%H%M%S") + ".bin"

        os.makedirs(DUMP_DIR, exist_ok=True)
        out_path = os.path.join(DUMP_DIR, os.path.basename(fn))
        print("!POST!: " + self.path + " -->> " + out_path)
        print("test: %d" % int(self.headers["Content-length"]))
        data = self.rfile.read(int(self.headers["Content-length"]))
        with open(out_path, "wb") as f:
            f.write(data)

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

    def beacon(self):
        tag = self.path[len("/beacon/"):]
        data = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8", "replace")
        print("[LOG] beacon %s %s" % (tag, data), flush=True)
        self.send_response(204)
        self.end_headers()


def stop(signum, frame):
    raise KeyboardInterrupt


def local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("1.1.1.1", 80))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def ensure_cert():
    if os.path.isfile(CERT):
        return True

    os.makedirs(os.path.dirname(CERT), exist_ok=True)
    key = os.path.join(ROOT, "certs", "key.pem")
    crt = os.path.join(ROOT, "certs", "cert.pem")
    result = subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            key,
            "-out",
            crt,
            "-days",
            "3650",
            "-subj",
            "/CN=manuals.playstation.net",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        print("[LOG][ERR] failed to generate " + CERT, flush=True)
        return False

    with open(crt, "rb") as cert_file, open(key, "rb") as key_file:
        data = cert_file.read() + key_file.read()
    with open(CERT, "wb") as out:
        out.write(data)
    os.remove(key)
    os.remove(crt)
    print("[LOG] generated self-signed certificate: " + CERT, flush=True)
    return True


def start_dns(ip, port):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(DNS_CONF, "w") as f:
        f.write("A manuals.playstation.net %s\n" % ip)

    process = subprocess.Popen(
        [sys.executable, "-u", DNS_SCRIPT, "-c", DNS_CONF, "-p", str(port)],
    )
    time.sleep(1)
    if process.poll() is not None:
        return None
    return process


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default=os.environ.get("PS5_HOST_PORT", "443"))
    parser.add_argument("--dns-port", default=os.environ.get("PS5_DNS_PORT", "53"))
    parser.add_argument("--ip", default=os.environ.get("PS5_IP", ""))
    parser.add_argument("--no-dns", action="store_true")
    args = parser.parse_args()

    try:
        port = int(args.port)
        dns_port = int(args.dns_port)
    except ValueError:
        print("[LOG][ERR] invalid port", flush=True)
        return 1

    ip = args.ip or local_ip()
    if not ip:
        print("[LOG][ERR] cannot detect local IP, use --ip", flush=True)
        return 1

    if not ensure_cert():
        return 1

    dns_process = None
    if not args.no_dns:
        dns_process = start_dns(ip, dns_port)
        if dns_process is None:
            print("[LOG][ERR] dns failed on port %d" % dns_port, flush=True)
            return 1

    os.makedirs(DUMP_DIR, exist_ok=True)

    handler = functools.partial(RequestHandler, directory=ROOT)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT)
    try:
        httpd = http.server.HTTPServer(("0.0.0.0", port), handler)
    except OSError as error:
        print("[LOG][ERR] cannot bind port %d: %s" % (port, error), flush=True)
        if dns_process is not None:
            dns_process.terminate()
        return 1

    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    signal.signal(signal.SIGTERM, stop)
    print("[LOG] serving[%s]:%d" % (ip, port), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        if dns_process is not None:
            dns_process.terminate()
            try:
                dns_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                dns_process.kill()
            print("[LOG] dns stopped", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
