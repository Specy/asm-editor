#!/usr/bin/env python3
"""Boots the reference guest x86's devices follow (docs/design/x86-devices.md,
"The pinned guest"; docs/research/x86-reference-guest.md) and runs the probe in
it.

    guest.py setup      download the image, make the disk and provision it
    guest.py probe      boot it, run the probe with input injected through QMP,
                        and write facts.txt beside this script
    guest.py boot       boot it in the background, for poking at it by hand
    guest.py sh CMD     run a shell command on its serial console
    guest.py qmp JSON   send a QMP command, {"execute": ..., "arguments": ...}
    guest.py stop       power it off
    guest.py serve      serve the cache's www/ folder to the guest (with PUT)
    guest.py collect    rebuild facts.txt from the last probe's uploads
    guest.py wav FILE   analyse a recording of the guest's sound
    guest.py compare F  facts.txt against core-run.mjs's output F

Everything it downloads or makes lives in the cache folder, by default the
main checkout's .cache/qemu-guest (gitignored), or $REFERENCE_GUEST_DIR.
Python 3 standard library only. Needs qemu-system-x86_64 10.2 and gcc."""

import argparse
import hashlib
import http.server
import json
import math
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- the pins

QEMU_VERSION = "10.2.1"
MACHINE = "pc-q35-10.2"
IMAGE_BUILD = "20261026-2643"
IMAGE_NAME = "debian-13-nocloud-amd64.qcow2"
IMAGE_URL = (
    f"https://cloud.debian.org/images/cloud/trixie/{IMAGE_BUILD}/"
    f"debian-13-nocloud-amd64-{IMAGE_BUILD}.qcow2"
)
IMAGE_SHA512 = (
    "129471badafeff16e59f7e95cb0fcc91828d570ecc7803ca06a05160176e65e6"
    "1dd5c770310531cd68e6863b8dd102d939519002943e0bc77a4a5fe6a724f8a9"
)
HTTP_PORT = 8765  # on the host's 127.0.0.1, the guest's 10.0.2.2
ROOT_PASSWORD = "reference"  # given to systemd-firstboot as a credential

# The kernel command line the pinned guest boots with (GRUB_CMDLINE_LINUX).
# video= takes a CVT mode (M): the GTF mode a bare 320x240 asks for has its
# sync inside the picture at 60 Hz, and Linux 7.2 refuses it.
CMDLINE = (
    "console=ttyS0 fbcon=map:1 video=320x240M "
    "drm_kms_helper.drm_fbdev_overalloc=200 "
    "snd_hda_intel.index=0 snd_virmidi.index=1"
)


def cache_dir():
    if os.environ.get("REFERENCE_GUEST_DIR"):
        return Path(os.environ["REFERENCE_GUEST_DIR"])
    common = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=HERE, capture_output=True, text=True, check=True,
    ).stdout.strip()
    return Path(common).parent / ".cache" / "qemu-guest"


CACHE = cache_dir()
DISK = CACHE / "guest.qcow2"
BASE = CACHE / "dl" / IMAGE_NAME
SERIAL = CACHE / "serial.sock"
QMP = CACHE / "qmp.sock"
WAV = CACHE / "out.wav"
WWW = CACHE / "www"
UPLOADS = CACHE / "uploads"
PIDFILE = CACHE / "qemu.pid"


def qemu_argv(daemonize=False, wav=WAV, kernel=None, append=None, firstboot=False):
    argv = [
        "qemu-system-x86_64",
        "-name", "reference-guest",
        "-machine", f"{MACHINE},vmport=off,pcspk-audiodev=snd0",
        "-accel", "tcg",
        "-cpu", "qemu64",
        "-smp", "2",
        "-m", "2G",
        "-display", "none",
        "-vga", "std",
        "-drive", f"file={DISK},if=none,id=disk0,format=qcow2",
        "-device", "virtio-blk-pci,drive=disk0,addr=0x3",
        "-netdev", "user,id=net0",
        "-device", "virtio-net-pci,netdev=net0,addr=0x2",
        "-device", "qemu-xhci,id=xhci,addr=0x4",
        "-device", "usb-tablet,bus=xhci.0",
        "-audiodev", f"wav,id=snd0,path={wav}",
        "-device", "intel-hda,id=hda,addr=0x5",
        "-device", "hda-duplex,audiodev=snd0",
        "-chardev",
        f"socket,id=ser0,path={SERIAL},server=on,wait=off,"
        f"logfile={CACHE / 'serial.log'},logappend=off",
        "-serial", "chardev:ser0",
        "-qmp", f"unix:{QMP},server=on,wait=off",
        "-pidfile", str(PIDFILE),
    ]
    if firstboot:
        # systemd-firstboot takes these instead of asking on the console
        # (skipping its root password prompt would lock root)
        argv += ["-smbios", "type=11,value=io.systemd.credential:"
                 f"passwd.plaintext-password.root={ROOT_PASSWORD}",
                 "-smbios", "type=11,value=io.systemd.credential:firstboot.timezone=Etc/UTC"]
    if kernel:
        argv += ["-kernel", kernel[0], "-initrd", kernel[1], "-append", append]
    if daemonize:
        argv.append("-daemonize")
    return argv


# ------------------------------------------------------------ the channels


class Serial:
    """The guest's ttyS0, where root's shell runs."""

    def __init__(self, path=SERIAL, timeout=60):
        self.sock = connect_unix(path, timeout)
        self.buf = bytearray()
        self.mark = 0
        self.cond = threading.Condition()
        self.closed = False
        self.counter = int(time.time() * 1000) % 1000000
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self):
        while True:
            try:
                data = self.sock.recv(65536)
            except OSError:
                data = b""
            with self.cond:
                if not data:
                    self.closed = True
                    self.cond.notify_all()
                    return
                self.buf += data
                self.cond.notify_all()

    def text(self, start=0, end=None):
        with self.cond:
            return self.buf[start:end].decode("utf-8", "replace")

    def wait(self, pattern, timeout=600, start=None):
        """Waits for `pattern` in what arrived since `start` (the mark)."""
        regex = re.compile(pattern.encode() if isinstance(pattern, str) else pattern)
        start = self.mark if start is None else start
        deadline = time.time() + timeout
        with self.cond:
            while True:
                m = regex.search(self.buf, start)
                if m:
                    return m
                left = deadline - time.time()
                if left <= 0 or self.closed:
                    tail = self.buf[-2000:].decode("utf-8", "replace")
                    raise TimeoutError(f"no {pattern!r} on the serial line; last:\n{tail}")
                self.cond.wait(min(left, 1))

    def send(self, text):
        self.sock.sendall(text.encode() if isinstance(text, str) else text)

    def sh(self, cmd, timeout=900, check=True):
        """Runs `cmd` in root's shell; returns its output (\r stripped)."""
        self.counter += 1
        n = self.counter
        start = len(self.buf)
        # one line, and the command's standard input not the serial line: a
        # second line typed ahead would be read by whatever reads the tty
        self.send(f"echo __BEG{n}__; {{ {cmd}\n}} </dev/null; echo __END{n}=$?__\n")
        b = self.wait(rf"__BEG{n}__\r?\n", timeout, start)
        e = self.wait(rf"__END{n}=(\d+)__", timeout, b.end())
        self.mark = e.end()
        out = self.text(b.end(), e.start()).replace("\r", "")
        # drop the echo of the line's continuation, the end marker's command
        out = re.sub(rf"(^|\n)[^\n]*__END{n}=\$\?__\n?", r"\1", out)
        rc = int(e.group(1))
        if check and rc:
            raise RuntimeError(f"`{cmd}` exited {rc}:\n{out}")
        return out


class Qmp:
    def __init__(self, path=QMP, timeout=60):
        self.sock = connect_unix(path, timeout)
        self.file = self.sock.makefile("rwb")
        self.events = []
        json.loads(self.file.readline())  # the greeting
        self.cmd("qmp_capabilities")

    def cmd(self, name, **arguments):
        msg = {"execute": name}
        if arguments:
            msg["arguments"] = arguments
        self.file.write(json.dumps(msg).encode() + b"\n")
        self.file.flush()
        while True:
            line = self.file.readline()
            if not line:
                raise ConnectionError("QMP closed")
            reply = json.loads(line)
            if "event" in reply:
                self.events.append(reply)
                continue
            if "error" in reply:
                raise RuntimeError(f"QMP {name}: {reply['error']}")
            return reply.get("return")

    def input(self, *events):
        self.cmd("input-send-event", events=list(events))


def key(qcode, down):
    return {"type": "key", "data": {"down": down, "key": {"type": "qcode", "data": qcode}}}


def btn(button, down):
    return {"type": "btn", "data": {"down": down, "button": button}}


def absolute(axis, value):
    return {"type": "abs", "data": {"axis": axis, "value": value}}


def connect_unix(path, timeout):
    deadline = time.time() + timeout
    while True:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            s.connect(str(path))
            return s
        except OSError:
            s.close()
            if time.time() > deadline:
                raise
            time.sleep(0.2)


class Uploads(http.server.SimpleHTTPRequestHandler):
    """GET from www/, PUT into uploads/ (curl -T FILE http://10.0.2.2:8765/)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WWW), **kwargs)

    def do_PUT(self):
        length = int(self.headers["Content-Length"])
        data = self.rfile.read(length)
        UPLOADS.mkdir(parents=True, exist_ok=True)
        (UPLOADS / os.path.basename(self.path.rstrip("/"))).write_bytes(data)
        self.send_response(201)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


def start_server():
    WWW.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Uploads)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# ------------------------------------------------------------ the machine


def running():
    try:
        pid = int(PIDFILE.read_text())
        os.kill(pid, 0)
        return pid
    except (OSError, ValueError):
        return None


def boot(daemonize, **kwargs):
    if running():
        raise SystemExit("the guest is already running (guest.py stop)")
    for p in (SERIAL, QMP):
        p.unlink(missing_ok=True)
    argv = qemu_argv(daemonize=daemonize, **kwargs)
    (CACHE / "qemu-argv.txt").write_text(" ".join(argv) + "\n")
    if daemonize:
        subprocess.run(argv, check=True)
        return None
    return subprocess.Popen(argv)


def login(serial, timeout=900):
    """Waits for root's shell on ttyS0, logging in if the getty asks."""
    deadline = time.time() + timeout
    quiet = seen = 0
    while True:
        # the image's first boot runs systemd-firstboot on the console, which
        # waits for a key, then asks for a timezone and a root password
        try:
            m = serial.wait(r"(login: |root@[^\n]*# |Press any key to proceed|"
                            r"(\(empty to skip|password again)[^\n]*: "
                            r"(\x1b\[[0-9;:]*m)*(\(press TAB for no echo\) (\x1b\[[0-9;:]*m)*)?)", 20)
        except TimeoutError:
            if time.time() > deadline:
                raise
            # a prompt printed before this client connected: ask again, once
            # the line has been quiet for a minute (an early key would answer
            # one of firstboot's prompts)
            if len(serial.buf) != seen:
                seen, quiet = len(serial.buf), 0
                continue
            quiet += 1
            if quiet >= 3:
                serial.send("\r")
                quiet = 0
            continue
        quiet = 0
        serial.mark = m.end()
        if b"Press any key" in m.group(0):
            time.sleep(1)
            serial.send("\r")
            continue
        if b"empty to skip" in m.group(0) or b"password again" in m.group(0):
            # skipping the password locks root, so it gets one, typed slowly
            # since the prompt flushes what came before it; autologin on
            # ttyS0 means it is never asked for again
            if b"password" in m.group(0):
                type_slowly(serial, ROOT_PASSWORD + "\r")
            else:
                time.sleep(1)
                serial.send("\r")
            continue
        break
    if m.group(0).endswith(b"login: "):
        serial.send("root\n")
        m = serial.wait(r"(Password: |root@[^\n]*# )", 120, m.end())
        if m.group(0) == b"Password: ":
            serial.send(f"{ROOT_PASSWORD}\n")
            serial.wait(r"root@[^\n]*# ", 120, m.end())
    time.sleep(1)
    serial.mark = len(serial.buf)
    # no line editing (its redraws garble long lines), no pager, no colour,
    # and no kernel messages on the line the probe reports on
    serial.send("set +o emacs +o vi; export PS1='# ' TERM=dumb PAGER=cat "
                "SYSTEMD_PAGER=cat SYSTEMD_COLORS=0\n")
    time.sleep(1)
    serial.sh("dmesg -n 1")


def type_slowly(serial, text):
    time.sleep(2)
    for c in text:
        serial.send(c)
        time.sleep(0.3)


def power_off(serial, proc=None, timeout=600):
    try:
        serial.send("systemctl poweroff\n")
    except OSError:
        pass
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc is not None and proc.poll() is not None:
            return
        if proc is None and not running():
            return
        time.sleep(1)
    raise TimeoutError("the guest did not power off")


# ------------------------------------------------------------ provisioning


def download():
    BASE.parent.mkdir(parents=True, exist_ok=True)
    if not BASE.exists():
        print(f"downloading {IMAGE_URL}")
        urllib.request.urlretrieve(IMAGE_URL, BASE)
    digest = hashlib.sha512(BASE.read_bytes()).hexdigest()
    if digest != IMAGE_SHA512:
        raise SystemExit(f"{BASE}: SHA-512 {digest}, expected {IMAGE_SHA512}")


FLUIDSYNTH_UNIT = """\
[Unit]
Description=FluidSynth on the HDA card, played by snd-virmidi's ports
After=sound.target systemd-modules-load.service

[Service]
ExecStart=/usr/bin/fluidsynth --no-shell --server --audio-driver=alsa \\
  -o audio.alsa.device=plughw:0,0 --midi-driver=alsa_seq \\
  -o midi.alsa_seq.id=fluidsynth --gain=1.0 \\
  /usr/share/sounds/sf2/FluidR3_GM.sf2
ExecStartPost=/usr/local/sbin/reference-aconnect

[Install]
WantedBy=multi-user.target
"""

# Connects every "Virtual Raw MIDI 1-N" client's port 0 to FluidSynth's.
ACONNECT = """\
#!/bin/sh
for i in $(seq 1 100); do
  fluid=$(aconnect -o | sed -n 's/^client \\([0-9]*\\): .FLUID Synth.*/\\1/p' | head -1)
  [ -n "$fluid" ] && break
  sleep 0.2
done
[ -n "$fluid" ] || exit 1
for c in $(aconnect -i | sed -n 's/^client \\([0-9]*\\): .Virtual Raw MIDI 1-.*/\\1/p'); do
  aconnect "$c:0" "$fluid:0"
done
"""

AUTOLOGIN = """\
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noreset --noclear --keep-baud 115200,57600,38400,9600 - $TERM
"""


def write_guest_file(serial, path, content, mode="644"):
    """Writes a file in the guest through the HTTP server."""
    name = re.sub(r"[^A-Za-z0-9._-]", "_", path)
    (WWW / name).write_text(content)
    serial.sh(f"curl -fsS http://10.0.2.2:{HTTP_PORT}/{name} -o {path} && chmod {mode} {path}")


def setup(args):
    CACHE.mkdir(parents=True, exist_ok=True)
    download()
    if args.fresh and DISK.exists():
        DISK.unlink()
    if not DISK.exists():
        subprocess.run(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2",
                        "-b", str(BASE), str(DISK), "8G"], check=True)
    server = start_server()
    proc = None if args.resume else boot(False, firstboot=True)
    serial = Serial()
    log = open(CACHE / "setup.log", "a" if args.resume else "w")

    def sh(cmd, **kw):
        print(f"# {cmd}", flush=True)
        out = serial.sh(cmd, **kw)
        log.write(f"# {cmd}\n{out}")
        log.flush()
        return out

    try:
        if args.resume:
            # a guest the setup left running: a fresh prompt
            serial.send("\n")
            time.sleep(2)
            serial.mark = len(serial.buf)
        else:
            login(serial)
        sh("cat /proc/cmdline; uname -a; df -h /")
        # the backports kernel, when one at 6.19 or later exists
        sh("apt-get update -q", timeout=1800)
        policy = sh("apt-cache policy linux-image-amd64")
        bpo = re.findall(r"(\d+\.\d+)\.\d+-\d+~bpo13\+\d+", policy)
        newest = max(bpo, key=lambda v: tuple(map(int, v.split("."))), default=None)
        kernel_pkgs = ""
        if newest and tuple(map(int, newest.split("."))) >= (6, 19):
            kernel_pkgs = "linux-image-amd64/trixie-backports"
        sh("DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "
           f"alsa-utils fluidsynth fluid-soundfont-gm pciutils usbutils {kernel_pkgs}",
           timeout=3600)
        # the module that owns drm_fbdev_overalloc on the kernel grub boots
        kver = sh("ls /boot | sed -n 's/^vmlinuz-//p' | sort -V | tail -1").strip()
        owner = sh(f"for m in drm_kms_helper drm drm_client_lib drm_ttm_helper bochs; do "
                   f"modinfo -k {kver} -p $m 2>/dev/null | grep -q '^drm_fbdev_overalloc:' "
                   "&& echo $m; done; true").split()
        log.write(f"kernel {kver}: drm_fbdev_overalloc in {owner}\n")
        cmdline = CMDLINE
        if owner and owner[0] != "drm_kms_helper":
            cmdline = cmdline.replace("drm_kms_helper.", owner[0] + ".")
        # the kernel command line, the modules, snd-pcsp kept off the speaker
        sh(f"sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT=\"\"/; "
           f"s/^GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX=\"{cmdline}\"/' /etc/default/grub")
        sh("grep -rn CMDLINE /etc/default/grub /etc/default/grub.d/ || true")
        write_guest_file(serial, "/etc/modules-load.d/reference-guest.conf",
                         "snd-pcm-oss\nsnd-mixer-oss\nsnd-virmidi\npcspkr\n")
        write_guest_file(serial, "/etc/modprobe.d/reference-guest.conf",
                         "blacklist snd-pcsp\n")
        write_guest_file(serial, "/etc/systemd/system/reference-fluidsynth.service",
                         FLUIDSYNTH_UNIT)
        write_guest_file(serial, "/usr/local/sbin/reference-aconnect", ACONNECT, "755")
        sh("mkdir -p /etc/systemd/system/serial-getty@ttyS0.service.d")
        write_guest_file(serial, "/etc/systemd/system/serial-getty@ttyS0.service.d/autologin.conf",
                         AUTOLOGIN)
        # nothing changes the machine between runs: no timers or upgrades,
        # and the mixer starts at alsactl init's levels at every boot (udev's
        # alsactl restore finds no state; nothing stores one at shutdown)
        sh("systemctl mask apt-daily.timer apt-daily-upgrade.timer unattended-upgrades.service "
           "alsa-restore.service alsa-state.service; rm -f /var/lib/alsa/asound.state")
        # one FluidSynth, the system's: the package's user unit would start
        # another in root's session, holding the card too
        sh("systemctl --global disable fluidsynth.service; systemctl --global mask fluidsynth.service")
        sh("systemctl enable reference-fluidsynth.service")
        sh("update-grub 2>&1 | tail -5", timeout=1800)
        sh("dpkg -l | awk '/^ii/ {print $2, $3}' > /root/packages.txt; "
           f"curl -fsS -T /root/packages.txt http://10.0.2.2:{HTTP_PORT}/packages.txt")
        sh("sync")
        power_off(serial, proc)
    finally:
        log.close()
        if proc is not None and proc.poll() is None:
            proc.terminate()
        server.shutdown()


# ---------------------------------------------------------------- the probe


def build_probe():
    WWW.mkdir(parents=True, exist_ok=True)
    out = WWW / "probe"
    subprocess.run(["gcc", "-static", "-O2", "-Wall", "-o", str(out),
                    str(HERE / "probe.c"), "-lm"], check=True)
    return out


def tablet_value(pixel, size):
    """What a QEMU front-end sends for a pixel: ⌊x × 32767 ÷ size⌋."""
    return pixel * 32767 // size


def inject_input(qmp, serial, width, height):
    """The input the probe's event phase records, with markers between."""
    steps = []

    def note(text):
        steps.append(text)
        print(f"  inject: {text}", flush=True)

    def tap(qcode, hold=0.15):
        note(f"key {qcode}")
        qmp.input(key(qcode, True))
        time.sleep(hold)
        qmp.input(key(qcode, False))
        time.sleep(0.6)

    for qcode in ("a", "right", "caps_lock", "caps_lock", "num_lock",
                  "num_lock", "scroll_lock", "scroll_lock", "pause", "print",
                  "kp_1", "ctrl_r", "meta_l"):
        tap(qcode)
    note("key a held 1.2 s")
    qmp.input(key("a", True))
    time.sleep(1.2)
    qmp.input(key("a", False))
    time.sleep(0.6)
    note("key shift and a")
    qmp.input(key("shift", True))
    time.sleep(0.1)
    tap("a")
    qmp.input(key("shift", False))
    time.sleep(0.6)
    for (px, py) in ((0, 0), (width - 1, 0), (width - 1, height - 1),
                     (0, height - 1), (width // 2, height // 2)):
        x, y = tablet_value(px, width), tablet_value(py, height)
        note(f"tablet pixel {px},{py} = abs {x},{y}")
        qmp.input(absolute("x", x), absolute("y", y))
        time.sleep(0.5)
    note("tablet abs 32767,32767 (the edge)")
    qmp.input(absolute("x", 32767), absolute("y", 32767))
    time.sleep(0.5)
    note("tablet abs 16384,16384 x only then y only")
    qmp.input(absolute("x", 16384))
    time.sleep(0.4)
    qmp.input(absolute("y", 16384))
    time.sleep(0.5)
    for b in ("left", "right", "middle", "side", "extra"):
        note(f"button {b}")
        qmp.input(btn(b, True))
        time.sleep(0.2)
        qmp.input(btn(b, False))
        time.sleep(0.5)
    note("left and right together, released together")
    qmp.input(btn("left", True), btn("right", True))
    time.sleep(0.2)
    qmp.input(btn("left", False), btn("right", False))
    time.sleep(0.5)
    for b in ("wheel-up", "wheel-up", "wheel-down", "wheel-left", "wheel-right"):
        note(f"wheel {b}")
        qmp.input(btn(b, True))
        qmp.input(btn(b, False))
        time.sleep(0.5)
    note("move with the left button held")
    qmp.input(btn("left", True))
    time.sleep(0.2)
    qmp.input(absolute("x", 20000), absolute("y", 20000))
    time.sleep(0.2)
    qmp.input(btn("left", False))
    time.sleep(0.5)
    note("relative move (QEMU routes it to the PS/2 mouse)")
    qmp.input({"type": "rel", "data": {"axis": "x", "value": 5}},
              {"type": "rel", "data": {"axis": "y", "value": -3}})
    time.sleep(0.8)
    return steps


def probe(args):
    if not DISK.exists():
        raise SystemExit("no disk: run guest.py setup first")
    build_probe()
    server = start_server()
    WAV.unlink(missing_ok=True)
    UPLOADS.mkdir(parents=True, exist_ok=True)
    for f in UPLOADS.glob("facts*.txt"):
        f.unlink()
    proc = boot(False)
    serial = Serial()
    qmp = Qmp()
    qemu = subprocess.run(["qemu-system-x86_64", "--version"], capture_output=True,
                          text=True).stdout.splitlines()[0]
    hostinfo = f"--qemu={qemu!r} --machine={MACHINE}"
    try:
        login(serial, timeout=1200)
        serial.sh("systemctl is-system-running --wait >/dev/null 2>&1 || true", timeout=600)
        serial.sh(f"curl -fsS http://10.0.2.2:{HTTP_PORT}/probe -o /root/probe && chmod 755 /root/probe")

        def run(section, timeout=600, extra=""):
            print(f"probe {section}", flush=True)
            serial.sh(f"/root/probe {hostinfo} {section} {extra} > /root/facts-{section}.txt 2>&1; "
                      f"curl -fsS -T /root/facts-{section}.txt http://10.0.2.2:{HTTP_PORT}/",
                      timeout=timeout)

        run("system")
        run("nodes")
        run("input")
        # the event phase: the probe reads every event device until a line
        # arrives on standard input, while QMP injects the input
        print("probe events", flush=True)
        start = len(serial.buf)
        serial.send(f"/root/probe {hostinfo} events > /root/facts-events.txt; "
                    f"curl -fsS -T /root/facts-events.txt http://10.0.2.2:{HTTP_PORT}/; "
                    "echo __EVENTS_DONE__\n")
        serial.wait(r"probe: events ready", 120, start)
        time.sleep(1)
        width, height = (int(v) for v in args.mode.split("x"))
        steps = inject_input(qmp, serial, width, height)
        time.sleep(1)
        serial.send("\n")
        serial.wait(r"__EVENTS_DONE__\r?\n", 120, start)
        serial.mark = len(serial.buf)
        (UPLOADS / "injected.txt").write_text("".join(f"inject[{i:02d}]={s}\n" for i, s in enumerate(steps)))
        run("fb")
        # FluidSynth holds the card's one playback substream: what /dev/dsp
        # answers with it running, then without it for the dsp's own probe
        run("dsp-busy")
        serial.sh("systemctl stop reference-fluidsynth.service")
        run("dsp", timeout=900)
        run("mixer")
        serial.sh("systemctl start reference-fluidsynth.service; sleep 2; aconnect -l")
        run("midi", timeout=900)
        run("speaker", timeout=900)
        run("console", extra="< /dev/ttyS0")
        # the configuration as booted, for the research record
        serial.sh("{ cat /proc/cmdline; uname -a; lsmod; aconnect -l; amixer -c 0 contents; "
                  "cat /proc/asound/cards /proc/asound/devices /proc/asound/oss/sndstat; "
                  "lspci -nn; lsusb -t; systemctl status reference-fluidsynth --no-pager -n 0; "
                  "ls -l /dev/input /dev/input/by-path /dev/input/by-id /dev/snd /dev/dri; "
                  "ls /sys/module/drm_kms_helper/parameters /sys/module/drm/parameters; "
                  "grep . /sys/module/drm_kms_helper/parameters/* /sys/class/graphics/fb0/{name,modes,virtual_size,bits_per_pixel,stride} "
                  "/sys/class/vtconsole/*/name /sys/class/drm/card*-*/modes; "
                  "modprobe -c | grep -E 'blacklist (pcspkr|snd.pcsp)'; "
                  "stty -a < /dev/ttyS0; } > /root/guest-config.txt 2>&1; "
                  f"curl -fsS -T /root/guest-config.txt http://10.0.2.2:{HTTP_PORT}/", timeout=300)
        power_off(serial, proc)
    finally:
        if proc.poll() is None:
            time.sleep(5)
            proc.terminate()
        server.shutdown()
    collect(args)


SECTIONS = ("system", "nodes", "input", "events", "fb", "dsp-busy", "dsp",
            "mixer", "midi", "speaker", "console")


def collect(args):
    parts = []
    for s in SECTIONS:
        f = UPLOADS / f"facts-{s}.txt"
        parts.append(f.read_text() if f.exists() else f"missing.{s}=1\n")
        if s == "events" and (UPLOADS / "injected.txt").exists():
            parts.append((UPLOADS / "injected.txt").read_text())
    if WAV.exists():
        parts.append(analyse_wav(WAV))
    (HERE / "facts.txt").write_text("".join(parts))
    print(f"wrote {HERE / 'facts.txt'}")


# ------------------------------------------------------------ the sound


def analyse_wav(path, window=0.05):
    """The tones in a recording: each run of windows with one steady pitch,
    as key=value lines. Pitch from zero crossings, interpolated to a
    fraction of a sample, on the left channel; silent windows are skipped
    (the recording runs for as long as FluidSynth keeps the card open)."""
    import array
    with wave.open(str(path)) as w:
        rate, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        frames = w.getnframes()
        samples = array.array("h")
        samples.frombytes(w.readframes(frames))
    lines = [f"wav.rate={rate}", f"wav.channels={channels}", f"wav.bits={8 * width}",
             f"wav.seconds={frames / rate:.3f}"]
    n = int(rate * window)
    segments = []
    for start in range(0, frames - n, n):
        block = samples[start * channels:(start + n) * channels:channels]
        if max(block) - min(block) < 400:
            segments.append((start / rate, 0.0, 0.0))
            continue
        mean = sum(block) / n
        rms = math.sqrt(sum((v - mean) ** 2 for v in block) / n)
        crossings = [i + (mean - block[i]) / (block[i + 1] - block[i])
                     for i in range(n - 1)
                     if block[i] < mean <= block[i + 1]]
        freq = ((len(crossings) - 1) * rate / (crossings[-1] - crossings[0])
                if len(crossings) > 2 else 0.0)
        segments.append((start / rate, freq, rms))
    runs = []
    for t, f, r in segments:
        if runs and f and runs[-1]["f"] and abs(runs[-1]["f"] - f) < max(3, 0.02 * f):
            run = runs[-1]
            run["end"] = t + window
            run["fs"].append(f)
            run["rms"] = max(run["rms"], r)
        elif runs and not f and not runs[-1]["f"]:
            runs[-1]["end"] = t + window
        else:
            runs.append({"start": t, "end": t + window, "f": f, "fs": [f], "rms": r})
    # the MIDI notes FluidSynth played, a piano's C5 and E5, whose harmonics
    # defeat the zero crossings: windows where the note's own frequency holds
    # a fifth of the signal or more
    notes = {"C5": 523.25, "E5": 659.26}
    step = int(rate * 0.1)
    found = {}
    for start in range(0, frames - step, step):
        block = samples[start * channels:(start + step) * channels:channels]
        if max(block) - min(block) < 400:
            continue
        rms = math.sqrt(sum(v * v for v in block) / step)
        for name, f in notes.items():
            k = 2 * math.cos(2 * math.pi * f / rate)
            s1 = s2 = 0.0
            for v in block:
                s1, s2 = v + k * s1 - s2, s1
            level = math.sqrt(max(0.0, s1 * s1 + s2 * s2 - k * s1 * s2)) / step
            if level > 0.2 * rms:
                found.setdefault(name, []).append(start / rate)
    for name, times in found.items():
        lines.append(f"wav.note.{name}=from {times[0]:.1f} s, {len(times)} windows of 0.1 s")
    i = 0
    for run in runs:
        if not run["f"] or run["end"] - run["start"] < 0.1:
            continue
        fs = sorted(run["fs"])
        median = fs[len(fs) // 2]
        lines.append(f"wav.tone[{i:02d}]=start {run['start']:.2f} s, "
                     f"{run['end'] - run['start']:.2f} s, {median:.1f} Hz, peak rms {run['rms']:.0f}")
        i += 1
    return "".join(line + "\n" for line in lines)


# ------------------------------------------------------------ comparing


def load_facts(path):
    """A facts file as {key: value}, a key seen again numbered key#2."""
    facts, seen = {}, {}
    for line in Path(path).read_text(errors="replace").splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        seen[key] = seen.get(key, 0) + 1
        facts[key if seen[key] == 1 else f"{key}#{seen[key]}"] = value
    return facts


def compare(guest_path, core_path, prefixes=("",)):
    """The keys whose values differ, the Core's event numbers renamed to the
    guest's by device name, so devices are compared whatever their order.
    Times and the input devices' /proc text, which `input.*` covers, are
    left out."""
    guest, core = load_facts(guest_path), load_facts(core_path)

    def names(facts):
        return {m.group(1): v for k, v in facts.items()
                if (m := re.match(r"input\.event(\d+)\.name$", k))}

    by_name = {v: n for n, v in names(guest).items()}
    rename = {n: by_name.get(v, n) for n, v in names(core).items()}

    def renamed(key):
        return re.sub(r"^(input|sys)\.event(\d+)",
                      lambda m: f"{m.group(1)}.event{rename.get(m.group(2), m.group(2))}", key)

    core = {renamed(k): v for k, v in core.items()}
    skip = re.compile(r"took_ms|_ms=|\.mark\.|^proc\.bus\.input\.devices|hw_params|sw_params")
    lines = []
    for key, value in guest.items():
        if not key.startswith(prefixes) or skip.search(key + "=" + value):
            continue
        if key not in core:
            lines.append(f"guest only: {key}={value}")
        elif core[key] != value:
            lines.append(f"differs: {key}\n  guest: {value}\n  core:  {core[key]}")
    for key, value in core.items():
        if key.startswith(prefixes) and key not in guest and not skip.search(key):
            lines.append(f"core only: {key}={value}")
    return "".join(line + "\n" for line in lines)


# ------------------------------------------------------------ the commands


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("setup")
    p.add_argument("--fresh", action="store_true", help="start from a new disk")
    p.add_argument("--resume", action="store_true",
                   help="provision the guest already running (guest.py boot)")
    p = sub.add_parser("probe")
    p.add_argument("--mode", default="320x240", help="the video= mode booted")
    sub.add_parser("collect")
    p = sub.add_parser("boot")
    p.add_argument("--firstboot", action="store_true")
    p = sub.add_parser("sh")
    p.add_argument("cmd")
    p.add_argument("--timeout", type=int, default=900)
    p.add_argument("--login", action="store_true", help="wait for the shell first")
    p = sub.add_parser("qmp")
    p.add_argument("json")
    sub.add_parser("stop")
    sub.add_parser("serve")
    p = sub.add_parser("wav")
    p.add_argument("file", nargs="?", default=str(WAV))
    p = sub.add_parser("compare", help="facts.txt against the Core's run of the probe")
    p.add_argument("core", help="the output of core-run.mjs")
    p.add_argument("--guest", default=str(HERE / "facts.txt"))
    p.add_argument("--prefix", action="append", default=[],
                   help="only keys starting with this (repeatable)")
    args = parser.parse_args()

    if args.command == "setup":
        setup(args)
    elif args.command == "probe":
        probe(args)
    elif args.command == "collect":
        collect(args)
    elif args.command == "boot":
        boot(True, firstboot=args.firstboot)
        print(f"booting; serial log {CACHE / 'serial.log'}")
    elif args.command == "sh":
        serial = Serial()
        if args.login:
            login(serial, timeout=args.timeout)
        else:
            serial.send("\n")
            time.sleep(0.5)
            serial.mark = len(serial.buf)
        sys.stdout.write(serial.sh(args.cmd, timeout=args.timeout, check=False))
    elif args.command == "qmp":
        msg = json.loads(args.json)
        print(json.dumps(Qmp().cmd(msg["execute"], **msg.get("arguments", {}))))
    elif args.command == "stop":
        if running():
            try:
                Qmp(timeout=5).cmd("system_powerdown")
            except Exception:
                pass
            for _ in range(300):
                if not running():
                    break
                time.sleep(1)
            else:
                os.kill(running(), 15)
    elif args.command == "serve":
        server = start_server()
        print(f"serving {WWW} on 127.0.0.1:{HTTP_PORT}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    elif args.command == "wav":
        sys.stdout.write(analyse_wav(args.file))
    elif args.command == "compare":
        sys.stdout.write(compare(args.guest, args.core, tuple(args.prefix) or ("",)))


if __name__ == "__main__":
    main()
