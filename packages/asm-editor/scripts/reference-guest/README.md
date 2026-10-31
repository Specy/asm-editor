# The reference guest

x86's devices behave as they do in a pinned QEMU guest running Debian 13 ([x86-devices.md](../../../../docs/design/x86-devices.md), "The pinned guest"; [ADR 0067](../../../../docs/adr/0067-x86-devices-follow-a-qemu-guest.md)). This folder boots that guest and records what its devices answer. The configuration, how it was chosen and what the guest said against the Core's values are in [x86-reference-guest.md](../../../../docs/research/x86-reference-guest.md).

- `guest.py` makes the guest and drives it: QEMU, its serial console and QMP, and an HTTP server the guest reaches at `10.0.2.2:8765`.
- `probe.c` is what runs in the guest: one section at a time, it prints one fact a line, `key=value`.
- `facts.txt` is the probe's output from the pinned guest, the fixture for differential runs.
- `core-run.mjs` runs the same probe binary in the Core as built in `packages/x86/blink-js/dist`, and `guest.py compare` sets its output beside `facts.txt`, device by device.

## Running it

Needs `qemu-system-x86_64` 10.2 (machine `pc-q35-10.2`), `gcc` with a static glibc, Python 3 and the network. KVM is not needed: the guest runs under TCG, slowly. Everything downloaded or made goes in the main checkout's `.cache/qemu-guest/` (gitignored), or in `$REFERENCE_GUEST_DIR`.

```sh
python3 guest.py setup    # once: download and check the image, then provision a disk (about 30 minutes under TCG)
python3 guest.py probe    # boot it, run every section, write facts.txt (about 15 minutes)
```

`setup` downloads Debian's `nocloud` image of build 20261026-2643, checks its SHA-512, and boots a copy-on-write disk over it: systemd-firstboot takes root's password and the timezone from SMBIOS credentials, then the setup installs the backports kernel, ALSA's tools, FluidSynth and its General MIDI sound font, sets the kernel command line, the modules and FluidSynth's service, and powers off. `setup --fresh` starts again from a new disk.

`probe` builds `probe.c` with `gcc -static -O2`, boots the guest, logs in on the serial console (root logs in by itself there), fetches the probe and runs each section, sending what it prints back over HTTP. During the `events` section it injects keys, tablet moves, buttons and wheel notches through QMP's `input-send-event`. The guest's sound goes to `.cache/qemu-guest/out.wav`, which `probe` analyses for the tones it played. It appends the injected input and the recording's tones to `facts.txt`.

For poking at the guest by hand:

```sh
python3 guest.py boot                 # in the background; the serial log is .cache/qemu-guest/serial.log
python3 guest.py serve &              # the HTTP server, for fetching files into the guest
python3 guest.py sh --login 'uname -r'
python3 guest.py sh 'cat /proc/bus/input/devices'
python3 guest.py qmp '{"execute": "input-send-event", "arguments": {"events": [{"type": "key", "data": {"down": true, "key": {"type": "qcode", "data": "a"}}}]}}'
python3 guest.py stop
```

## Against the Core

```sh
node core-run.mjs ../../../../.cache/qemu-guest/www/probe core.txt    # every section but events
python3 guest.py compare core.txt                                       # what differs, and what only one side has
python3 guest.py compare core.txt --prefix fb. --prefix dsp.            # one area
```

`core-run.mjs` takes the probe `guest.py probe` built (or any build of `probe.c`) and runs each section in a fresh emulator at the 320×240 display mode, waits included; the `events` section is left out, since nothing injects input there. `compare` renames the Core's event devices to the guest's numbers by name, so devices compare whatever their order, and leaves out durations and `/proc/bus/input/devices`, whose text the `input.*` keys cover.

## The probe alone

```sh
gcc -static -O2 -o probe probe.c -lm
./probe --qemu="$(qemu-system-x86_64 --version | head -1)" --machine=pc-q35-10.2 input
```

The sections are `system`, `nodes`, `input`, `events`, `fb`, `dsp-busy`, `dsp`, `mixer`, `midi`, `speaker` and `console`; run them as root. `dsp` needs the HDA card free, so FluidSynth (`reference-fluidsynth.service`) is stopped around it, and `dsp-busy` records what `/dev/dsp` answers while FluidSynth holds the card. `events` reads every event device until a line arrives on standard input, and says `probe: events ready` on standard error when it is listening. The `fb`, `dsp`, `mixer` and `speaker` sections change the screen mode, play sound and write the mixer, and put the mixer and the mode back when they finish.
