/* The reference guest's probe: what the devices x86 programs reach answer on
 * the pinned QEMU guest (docs/design/x86-devices.md, "The pinned guest";
 * docs/research/x86-reference-guest.md).
 *
 * Built static on the host and run as root in the guest by guest.py beside
 * it, one section at a time:
 *
 *     probe [--qemu=VERSION] [--machine=TYPE] SECTION
 *
 * SECTION is system, nodes, input, events, fb, dsp-midi, dsp, mixer, midi,
 * speaker or console. Each prints one fact a line, key=value, in an order
 * that does not change between runs, so two runs diff line by line; text a
 * file holds verbatim is printed a line at a time as key[NN]=line. A call
 * that fails prints rc=-1 and its errno's name. Times are wall-clock
 * measurements of this run and differ between runs.
 *
 * The events section reads every event device until a line arrives on
 * standard input, while the host injects keys and pointer moves through
 * QMP; it says "probe: events ready" on standard error when it listens.
 *
 * Only the kernel's UAPI headers and libc: gcc -static -O2 -o probe probe.c */
#define _GNU_SOURCE
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <math.h>
#include <poll.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/utsname.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

#include <linux/fb.h>
#include <linux/input.h>
#include <linux/kd.h>
#include <linux/soundcard.h>
#include <linux/vt.h>
#include <sound/asound.h>

// OSS 4's formats, which snd-pcm-oss knows but <linux/soundcard.h> lacks
#ifndef AFMT_S32_LE
#define AFMT_S32_LE     0x00001000
#define AFMT_S32_BE     0x00002000
#define AFMT_FLOAT      0x00004000
#define AFMT_S24_LE     0x00008000
#define AFMT_S24_BE     0x00010000
#define AFMT_SPDIF_RAW  0x00020000
#define AFMT_S24_PACKED 0x00040000
#endif
#define SOUND_MIXER_READ_OUTSRC  MIXER_READ(0xfa)
#define SOUND_MIXER_READ_OUTMASK MIXER_READ(0xf9)

static const char *qemu = "unknown", *machine = "unknown";

// ------------------------------------------------------------------ output

static void out(const char *fmt, ...) {
  va_list va;
  va_start(va, fmt);
  vprintf(fmt, va);
  va_end(va);
  putchar('\n');
}

static const char *en(int e) {
  const char *name = strerrorname_np(e);
  return name ? name : "E?";
}

// A call's result: "0", "N" or "-1 ENAME".
static const char *rc_text(long rc, int e) {
  static char buf[8][64];
  static int slot;
  char *b = buf[slot++ % 8];
  if (rc < 0) {
    snprintf(b, 64, "-1 %s", en(e));
  } else {
    snprintf(b, 64, "%ld", rc);
  }
  return b;
}

#define RC(expr) ({ errno = 0; long rc_ = (long)(expr); rc_text(rc_, errno); })

// A call's result and how long it took, the clock read around the call alone
// (an argument list's order of evaluation is unspecified).
#define TIMED(expr)                                                      \
  ({                                                                     \
    static char tb_[4][96];                                              \
    static int ts_;                                                      \
    double t0_ = now_mono();                                             \
    errno = 0;                                                           \
    long rc_ = (long)(expr);                                             \
    int e_ = errno;                                                      \
    double ms_ = (now_mono() - t0_) * 1e3;                               \
    char *b_ = tb_[ts_++ % 4];                                           \
    snprintf(b_, sizeof(tb_[0]), "%s took_ms %.3f", rc_text(rc_, e_), ms_); \
    b_;                                                                  \
  })

static double now_mono(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec + ts.tv_nsec / 1e9;
}

static void msleep(int ms) {
  struct timespec ts = {ms / 1000, (ms % 1000) * 1000000L};
  while (nanosleep(&ts, &ts) == -1 && errno == EINTR) {
  }
}

/* A file's text, a line at a time, as key[NN]=line. */
static void dump_file(const char *key, const char *path) {
  FILE *f = fopen(path, "r");
  char line[4096];
  int n = 0;
  if (!f) {
    out("%s=missing %s", key, en(errno));
    return;
  }
  while (fgets(line, sizeof(line), f)) {
    size_t len = strlen(line);
    while (len && (line[len - 1] == '\n' || line[len - 1] == '\r')) line[--len] = 0;
    out("%s[%02d]=%s", key, n++, line);
  }
  if (!n) out("%s=empty", key);
  fclose(f);
}

/* A one-line sysfs or proc value. */
static void dump_value(const char *key, const char *path) {
  FILE *f = fopen(path, "r");
  char line[4096];
  if (!f) {
    out("%s=missing %s", key, en(errno));
    return;
  }
  if (!fgets(line, sizeof(line), f)) line[0] = 0;
  fclose(f);
  line[strcspn(line, "\n")] = 0;
  out("%s=%s", key, line);
}

static int compare_names(const struct dirent **a, const struct dirent **b) {
  return strverscmp((*a)->d_name, (*b)->d_name);
}

// Bytes as text, with anything unprintable escaped; four results can be in
// use at once, as one out() formats several.
static const char *printable(const unsigned char *s, size_t n) {
  static char bufs[4][1024];
  static int slot;
  char *buf = bufs[slot++ % 4];
  size_t i, j = 0;
  for (i = 0; i < n && j < sizeof(bufs[0]) - 5; ++i) {
    if (s[i] >= 32 && s[i] < 127 && s[i] != '\\') {
      buf[j++] = s[i];
    } else {
      j += sprintf(buf + j, "\\x%02x", s[i]);
    }
  }
  buf[j] = 0;
  return buf;
}

// ------------------------------------------------------------------ names

static const char *kTypes[EV_CNT] = {
    [EV_SYN] = "EV_SYN", [EV_KEY] = "EV_KEY", [EV_REL] = "EV_REL",
    [EV_ABS] = "EV_ABS", [EV_MSC] = "EV_MSC", [EV_SW] = "EV_SW",
    [EV_LED] = "EV_LED", [EV_SND] = "EV_SND", [EV_REP] = "EV_REP",
    [EV_FF] = "EV_FF",   [EV_PWR] = "EV_PWR", [EV_FF_STATUS] = "EV_FF_STATUS",
};

static const char *CodeName(int type, int code) {
  switch (type) {
    case EV_SYN:
      switch (code) {
        case SYN_REPORT: return "SYN_REPORT";
        case SYN_CONFIG: return "SYN_CONFIG";
        case SYN_MT_REPORT: return "SYN_MT_REPORT";
        case SYN_DROPPED: return "SYN_DROPPED";
      }
      break;
    case EV_KEY:
      switch (code) {
        case KEY_A: return "KEY_A";
        case KEY_RIGHT: return "KEY_RIGHT";
        case KEY_CAPSLOCK: return "KEY_CAPSLOCK";
        case KEY_NUMLOCK: return "KEY_NUMLOCK";
        case KEY_SCROLLLOCK: return "KEY_SCROLLLOCK";
        case KEY_PAUSE: return "KEY_PAUSE";
        case KEY_SYSRQ: return "KEY_SYSRQ";
        case KEY_KP1: return "KEY_KP1";
        case KEY_RIGHTCTRL: return "KEY_RIGHTCTRL";
        case KEY_LEFTCTRL: return "KEY_LEFTCTRL";
        case KEY_LEFTMETA: return "KEY_LEFTMETA";
        case KEY_LEFTSHIFT: return "KEY_LEFTSHIFT";
        case KEY_POWER: return "KEY_POWER";
        case BTN_LEFT: return "BTN_LEFT";
        case BTN_RIGHT: return "BTN_RIGHT";
        case BTN_MIDDLE: return "BTN_MIDDLE";
        case BTN_SIDE: return "BTN_SIDE";
        case BTN_EXTRA: return "BTN_EXTRA";
        case BTN_FORWARD: return "BTN_FORWARD";
        case BTN_BACK: return "BTN_BACK";
        case BTN_TASK: return "BTN_TASK";
      }
      break;
    case EV_REL:
      switch (code) {
        case REL_X: return "REL_X";
        case REL_Y: return "REL_Y";
        case REL_HWHEEL: return "REL_HWHEEL";
        case REL_WHEEL: return "REL_WHEEL";
        case REL_WHEEL_HI_RES: return "REL_WHEEL_HI_RES";
        case REL_HWHEEL_HI_RES: return "REL_HWHEEL_HI_RES";
      }
      break;
    case EV_ABS:
      switch (code) {
        case ABS_X: return "ABS_X";
        case ABS_Y: return "ABS_Y";
      }
      break;
    case EV_MSC:
      if (code == MSC_SCAN) return "MSC_SCAN";
      if (code == MSC_TIMESTAMP) return "MSC_TIMESTAMP";
      break;
    case EV_LED:
      switch (code) {
        case LED_NUML: return "LED_NUML";
        case LED_CAPSL: return "LED_CAPSL";
        case LED_SCROLLL: return "LED_SCROLLL";
      }
      break;
    case EV_SND:
      switch (code) {
        case SND_CLICK: return "SND_CLICK";
        case SND_BELL: return "SND_BELL";
        case SND_TONE: return "SND_TONE";
      }
      break;
    case EV_REP:
      if (code == REP_DELAY) return "REP_DELAY";
      if (code == REP_PERIOD) return "REP_PERIOD";
      break;
  }
  return 0;
}

static const char *EventText(const struct input_event *e) {
  static char buf[128];
  const char *type = e->type < EV_CNT && kTypes[e->type] ? kTypes[e->type] : "?";
  const char *code = CodeName(e->type, e->code);
  if (code) {
    snprintf(buf, sizeof(buf), "%s %s %d", type, code, e->value);
  } else {
    snprintf(buf, sizeof(buf), "%s %d %d", type, e->code, e->value);
  }
  return buf;
}

// ------------------------------------------------------------------ bitmaps

#define LONG_BITS (8 * sizeof(long))
#define NLONGS(bits) (((bits) + LONG_BITS - 1) / LONG_BITS)

static int TestBit(const unsigned long *bits, int n) {
  return bits[n / LONG_BITS] >> (n % LONG_BITS) & 1;
}

/* As /proc/bus/input/devices prints a bitmap (input_print_bitmap()): the
 * longs from the highest one set down to 0, in hex, spaces between. */
static const char *KernelBitmap(const unsigned long *bits, int max) {
  static char buf[1024];
  int i, n = 0;
  for (i = NLONGS(max + 1) - 1; i > 0; --i) {
    if (bits[i]) break;
  }
  for (; i >= 0; --i) n += sprintf(buf + n, "%lx%s", bits[i], i ? " " : "");
  return buf;
}

// The bits set, as ranges: 1-3,7,10-11.
static const char *BitList(const unsigned long *bits, int max) {
  static char buf[4096];
  int i, n = 0, start = -1;
  buf[0] = 0;
  for (i = 0; i <= max + 1; ++i) {
    int set = i <= max && TestBit(bits, i);
    if (set && start < 0) start = i;
    if (!set && start >= 0) {
      n += snprintf(buf + n, sizeof(buf) - n, "%s%d", n ? "," : "", start);
      if (i - 1 > start) n += snprintf(buf + n, sizeof(buf) - n, "-%d", i - 1);
      start = -1;
    }
  }
  return n ? buf : "none";
}

static const int kTypeMax[EV_CNT] = {
    [EV_SYN] = EV_MAX, [EV_KEY] = KEY_MAX, [EV_REL] = REL_MAX,
    [EV_ABS] = ABS_MAX, [EV_MSC] = MSC_MAX, [EV_SW] = SW_MAX,
    [EV_LED] = LED_MAX, [EV_SND] = SND_MAX, [EV_REP] = REP_MAX,
    [EV_FF] = FF_MAX,
};

// ------------------------------------------------------------------ system

static void dump_params(const char *module) {
  char dir[256], path[512], key[512];
  struct dirent **names;
  int i, n;
  snprintf(dir, sizeof(dir), "/sys/module/%s/parameters", module);
  if ((n = scandir(dir, &names, 0, compare_names)) < 0) {
    out("param.%s=%s", module, access(dir, F_OK) ? "no parameters directory" : en(errno));
    return;
  }
  for (i = 0; i < n; ++i) {
    if (names[i]->d_name[0] != '.') {
      snprintf(path, sizeof(path), "%s/%s", dir, names[i]->d_name);
      snprintf(key, sizeof(key), "param.%s.%s", module, names[i]->d_name);
      dump_value(key, path);
    }
    free(names[i]);
  }
  free(names);
}

static void dump_config(void) {
  static const char *kPrefixes[] = {
      "CONFIG_HZ", "CONFIG_SND_PCM_OSS", "CONFIG_SND_MIXER_OSS",
      "CONFIG_SND_OSSEMUL", "CONFIG_SND_SEQUENCER_OSS", "CONFIG_SND_VIRMIDI",
      "CONFIG_SND_PCSP", "CONFIG_INPUT_PCSPKR", "CONFIG_SOUND_OSS_CORE",
      "CONFIG_SND_HDA_INTEL", "CONFIG_SND_HDA_PREALLOC_SIZE",
      "CONFIG_SND_DYNAMIC_MINORS", "CONFIG_SND_MAX_CARDS",
      "CONFIG_DRM_BOCHS", "CONFIG_DRM_FBDEV", "CONFIG_DRM_CLIENT",
      "CONFIG_DRM_KMS_HELPER", "CONFIG_FRAMEBUFFER_CONSOLE",
      "CONFIG_FB_DEVICE", "CONFIG_FB=", "CONFIG_INPUT_EVDEV",
      "CONFIG_INPUT_MOUSEDEV", "CONFIG_KEYBOARD_ATKBD", "CONFIG_MOUSE_PS2",
      "CONFIG_HID_GENERIC", "CONFIG_USB_HID", "CONFIG_VT=",
      "CONFIG_VT_CONSOLE", "CONFIG_INPUT_UINPUT", 0};
  struct utsname u;
  char path[256], line[512];
  FILE *f;
  int i;
  uname(&u);
  snprintf(path, sizeof(path), "/boot/config-%s", u.release);
  if (!(f = fopen(path, "r"))) {
    out("config=missing %s", path);
    return;
  }
  while (fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\n")] = 0;
    for (i = 0; kPrefixes[i]; ++i) {
      const char *p = line;
      if (!strncmp(p, "# ", 2)) p += 2;
      if (!strncmp(p, kPrefixes[i], strlen(kPrefixes[i]))) {
        out("config=%s", line);
        break;
      }
    }
  }
  fclose(f);
}

static void SectionSystem(void) {
  static const char *kModules[] = {
      "drm", "drm_kms_helper", "drm_client_lib", "drm_ttm_helper", "bochs",
      "fbcon", "snd", "snd_pcm", "snd_hda_intel", "snd_hda_codec",
      "snd_hda_codec_generic", "snd_pcm_oss", "snd_mixer_oss", "snd_rawmidi",
      "snd_virmidi", "snd_seq", "snd_seq_midi_event", "snd_timer",
      "pcspkr", "snd_pcsp", "atkbd", "psmouse", "i8042", "usbhid",
      "hid", "hid_generic", "evdev", "mousedev", "button", "vt",
      "kernel", "printk", 0};
  static const char *kWanted[] = {
      "snd", "pcspkr", "bochs", "drm", "fb", "evdev", "hid", "usbhid",
      "psmouse", "mousedev", "xhci", "ttm", "soundcore", "joydev",
      "serio", "atkbd", "i8042", "button", "virtio", 0};
  struct utsname u;
  FILE *f;
  char line[1024];
  int i;
  uname(&u);
  out("host.qemu=%s", qemu);
  out("host.machine=%s", machine);
  out("uname.sysname=%s", u.sysname);
  out("uname.release=%s", u.release);
  out("uname.version=%s", u.version);
  out("uname.machine=%s", u.machine);
  dump_value("proc.cmdline", "/proc/cmdline");
  dump_file("os_release", "/etc/os-release");
  // the modules that matter here, with what uses them
  if ((f = fopen("/proc/modules", "r"))) {
    char name[128], used[512];
    long size;
    int refs;
    while (fgets(line, sizeof(line), f)) {
      if (sscanf(line, "%127s %ld %d %511s", name, &size, &refs, used) != 4) continue;
      for (i = 0; kWanted[i]; ++i) {
        if (!strncmp(name, kWanted[i], strlen(kWanted[i]))) break;
      }
      if (!kWanted[i]) continue;
      out("lsmod.%s=refs %d used by %s", name, refs, used);
    }
    fclose(f);
  }
  for (i = 0; kModules[i]; ++i) dump_params(kModules[i]);
  dump_config();
  dump_file("proc.devices", "/proc/devices");
  dump_file("proc.consoles", "/proc/consoles");
  dump_file("proc.fb", "/proc/fb");
  dump_file("proc.asound.cards", "/proc/asound/cards");
  dump_file("proc.asound.devices", "/proc/asound/devices");
  dump_file("proc.asound.pcm", "/proc/asound/pcm");
  dump_file("proc.asound.oss.sndstat", "/proc/asound/oss/sndstat");
  dump_file("proc.asound.seq.clients", "/proc/asound/seq/clients");
  dump_file("proc.asound.card0.codec0", "/proc/asound/card0/codec#0");
  dump_file("proc.asound.card0.oss_mixer", "/proc/asound/card0/oss_mixer");
  dump_file("proc.asound.card0.pcm0p.info", "/proc/asound/card0/pcm0p/info");
  dump_file("proc.asound.card0.pcm0p.oss", "/proc/asound/card0/pcm0p/oss");
  dump_file("proc.asound.card1.midi0", "/proc/asound/card1/midi0");
  dump_file("proc.asound.card1.midi1", "/proc/asound/card1/midi1");
  dump_file("proc.bus.input.handlers", "/proc/bus/input/handlers");
  dump_value("sys.fb0.name", "/sys/class/graphics/fb0/name");
  dump_file("sys.fb0.modes", "/sys/class/graphics/fb0/modes");
  dump_value("sys.fb0.mode", "/sys/class/graphics/fb0/mode");
  dump_value("sys.fb0.virtual_size", "/sys/class/graphics/fb0/virtual_size");
  dump_value("sys.fb0.bits_per_pixel", "/sys/class/graphics/fb0/bits_per_pixel");
  dump_value("sys.fb0.stride", "/sys/class/graphics/fb0/stride");
  dump_value("sys.fb0.pan", "/sys/class/graphics/fb0/pan");
  dump_value("sys.fb0.state", "/sys/class/graphics/fb0/state");
  dump_value("sys.fb0.device", "/sys/class/graphics/fb0/device/uevent");
  dump_value("sys.vtcon0.name", "/sys/class/vtconsole/vtcon0/name");
  dump_value("sys.vtcon0.bind", "/sys/class/vtconsole/vtcon0/bind");
  dump_value("sys.vtcon1.name", "/sys/class/vtconsole/vtcon1/name");
  dump_value("sys.vtcon1.bind", "/sys/class/vtconsole/vtcon1/bind");
  dump_value("sys.tty0.active", "/sys/class/tty/tty0/active");
  dump_value("sys.console.active", "/sys/class/tty/console/active");
  // DRM's view of the display
  {
    struct dirent **names;
    int n = scandir("/sys/class/drm", &names, 0, compare_names);
    char path[512], key[512];
    for (i = 0; i < n; ++i) {
      const char *d = names[i]->d_name;
      if (!strncmp(d, "card0-", 6)) {
        snprintf(path, sizeof(path), "/sys/class/drm/%s/status", d);
        snprintf(key, sizeof(key), "sys.drm.%s.status", d);
        dump_value(key, path);
        snprintf(path, sizeof(path), "/sys/class/drm/%s/enabled", d);
        snprintf(key, sizeof(key), "sys.drm.%s.enabled", d);
        dump_value(key, path);
        snprintf(path, sizeof(path), "/sys/class/drm/%s/modes", d);
        snprintf(key, sizeof(key), "sys.drm.%s.modes", d);
        dump_file(key, path);
      }
      free(names[i]);
    }
    if (n >= 0) free(names);
  }
}

// ------------------------------------------------------------------ nodes

struct Id {
  unsigned id;
  char name[64];
};
static struct Id users[256], groups[256];
static int nusers, ngroups;

static void LoadIds(const char *path, struct Id *ids, int *count) {
  FILE *f = fopen(path, "r");
  char line[1024];
  if (!f) return;
  while (*count < 256 && fgets(line, sizeof(line), f)) {
    char *name = strtok(line, ":");
    char *x = strtok(0, ":");
    char *id = strtok(0, ":");
    if (!name || !x || !id) continue;
    ids[*count].id = atoi(id);
    snprintf(ids[*count].name, sizeof(ids[*count].name), "%s", name);
    ++*count;
  }
  fclose(f);
}

static const char *IdName(struct Id *ids, int count, unsigned id) {
  static char buf[4][32];
  static int slot;
  int i;
  for (i = 0; i < count; ++i) {
    if (ids[i].id == id) return ids[i].name;
  }
  snprintf(buf[slot % 4], 32, "%u", id);
  return buf[slot++ % 4];
}

static void DescribeNode(const char *path) {
  struct stat st, target;
  char link[PATH_MAX];
  ssize_t n;
  if (lstat(path, &st)) {
    out("node.%s=absent", path);
    return;
  }
  if (S_ISLNK(st.st_mode)) {
    n = readlink(path, link, sizeof(link) - 1);
    link[n < 0 ? 0 : n] = 0;
    if (!stat(path, &target) && (S_ISCHR(target.st_mode) || S_ISBLK(target.st_mode))) {
      out("node.%s=link %s -> char %u:%u", path, link, major(target.st_rdev),
          minor(target.st_rdev));
    } else {
      out("node.%s=link %s", path, link);
    }
    return;
  }
  if (S_ISCHR(st.st_mode)) {
    out("node.%s=char %u:%u rdev=0x%llx mode=%04o owner=%s:%s", path,
        major(st.st_rdev), minor(st.st_rdev), (unsigned long long)st.st_rdev,
        st.st_mode & 07777, IdName(users, nusers, st.st_uid),
        IdName(groups, ngroups, st.st_gid));
  } else if (S_ISDIR(st.st_mode)) {
    out("node.%s=directory mode=%04o", path, st.st_mode & 07777);
  } else {
    out("node.%s=other mode=%o", path, st.st_mode);
  }
}

static void DescribeDirectory(const char *dir, int (*want)(const char *)) {
  struct dirent **names;
  char path[PATH_MAX];
  int i, n = scandir(dir, &names, 0, compare_names);
  if (n < 0) {
    out("dir.%s=absent", dir);
    return;
  }
  for (i = 0; i < n; ++i) {
    const char *d = names[i]->d_name;
    if (d[0] != '.' && (!want || want(d))) {
      snprintf(path, sizeof(path), "%s/%s", dir, d);
      DescribeNode(path);
    }
    free(names[i]);
  }
  free(names);
}

static int WantDev(const char *name) {
  static const char *kPrefixes[] = {"fb", "tty0", "tty1", "ttyS0", "console",
                                    "dsp", "adsp", "mixer", "midi", "amidi",
                                    "dmmidi", "admmidi", "audio", "sequencer",
                                    "music", "sndstat", "dmfm", "dri", "snd",
                                    "input", "uinput", 0};
  int i;
  for (i = 0; kPrefixes[i]; ++i) {
    if (!strncmp(name, kPrefixes[i], strlen(kPrefixes[i]))) return 1;
  }
  return 0;
}

static void SectionNodes(void) {
  static const char *kNamed[] = {
      "/dev/fb0", "/dev/fb1", "/dev/tty0", "/dev/dsp", "/dev/dsp1", "/dev/dsp2",
      "/dev/adsp", "/dev/mixer", "/dev/mixer1", "/dev/mixer2", "/dev/audio",
      "/dev/audio1", "/dev/audio2", "/dev/midi",
      "/dev/midi00", "/dev/midi01", "/dev/midi1", "/dev/amidi", "/dev/amidi1",
      "/dev/dmmidi", "/dev/dmmidi1", "/dev/admmidi", "/dev/admmidi1",
      "/dev/sequencer", "/dev/sequencer2", "/dev/music", "/dev/sndstat",
      "/dev/dmfm", "/dev/input/mice", "/dev/snd/midiC1D0", "/dev/snd/seq",
      "/dev/dri/card0", 0};
  int i;
  LoadIds("/etc/passwd", users, &nusers);
  LoadIds("/etc/group", groups, &ngroups);
  for (i = 0; kNamed[i]; ++i) {
    out("exists.%s=%s", kNamed[i], access(kNamed[i], F_OK) ? "no" : "yes");
  }
  DescribeDirectory("/dev", WantDev);
  DescribeDirectory("/dev/input", 0);
  DescribeDirectory("/dev/input/by-path", 0);
  DescribeDirectory("/dev/input/by-id", 0);
  DescribeDirectory("/dev/snd", 0);
  DescribeDirectory("/dev/snd/by-path", 0);
  DescribeDirectory("/dev/snd/by-id", 0);
  DescribeDirectory("/dev/dri", 0);
  DescribeDirectory("/dev/dri/by-path", 0);
}

// ------------------------------------------------------------------ input

static int EventNumbers(int *numbers, int max) {
  struct dirent **names;
  int i, n, count = 0;
  if ((n = scandir("/dev/input", &names, 0, compare_names)) < 0) return 0;
  for (i = 0; i < n; ++i) {
    if (!strncmp(names[i]->d_name, "event", 5) && count < max) {
      numbers[count++] = atoi(names[i]->d_name + 5);
    }
    free(names[i]);
  }
  free(names);
  return count;
}

static void PrintString(const char *key, int fd, unsigned long request_0, int size) {
  char buf[256];
  int rc;
  memset(buf, 0x55, sizeof(buf));
  errno = 0;
  rc = ioctl(fd, request_0 | (size << _IOC_SIZESHIFT), buf);
  if (rc < 0) {
    out("%s=rc -1 %s", key, en(errno));
  } else {
    out("%s=rc %d \"%s\"", key, rc, printable((unsigned char *)buf, rc));
  }
}

static void DescribeEventDevice(int number) {
  char path[64], key[64], k[128];
  unsigned long bits[NLONGS(KEY_CNT)], evbits[NLONGS(EV_CNT)];
  struct input_id id;
  int fd, version, type, rc, i, rep[2];
  snprintf(path, sizeof(path), "/dev/input/event%d", number);
  snprintf(key, sizeof(key), "input.event%d", number);
  if ((fd = open(path, O_RDONLY | O_NONBLOCK)) < 0) {
    out("%s.open=-1 %s", key, en(errno));
    return;
  }
  out("%s.open=0", key);
  errno = 0;
  rc = ioctl(fd, EVIOCGVERSION, &version);
  out("%s.version=%s 0x%x", key, rc_text(rc, errno), rc < 0 ? 0 : version);
  memset(&id, 0, sizeof(id));
  errno = 0;
  rc = ioctl(fd, EVIOCGID, &id);
  out("%s.id=%s bustype=0x%04x vendor=0x%04x product=0x%04x version=0x%04x", key,
      rc_text(rc, errno), id.bustype, id.vendor, id.product, id.version);
  snprintf(k, sizeof(k), "%s.name", key);
  PrintString(k, fd, EVIOCGNAME(0), 256);
  snprintf(k, sizeof(k), "%s.name_5", key);
  PrintString(k, fd, EVIOCGNAME(0), 5);
  snprintf(k, sizeof(k), "%s.phys", key);
  PrintString(k, fd, EVIOCGPHYS(0), 256);
  snprintf(k, sizeof(k), "%s.uniq", key);
  PrintString(k, fd, EVIOCGUNIQ(0), 256);
  memset(bits, 0, sizeof(bits));
  errno = 0;
  rc = ioctl(fd, EVIOCGPROP(sizeof(bits)), bits);
  out("%s.prop=rc %s bitmap %s bits %s", key, rc_text(rc, errno),
      KernelBitmap(bits, INPUT_PROP_MAX), BitList(bits, INPUT_PROP_MAX));
  memset(evbits, 0, sizeof(evbits));
  errno = 0;
  rc = ioctl(fd, EVIOCGBIT(0, sizeof(bits)), evbits);
  out("%s.bit.EV=rc %s bitmap %s bits %s", key, rc_text(rc, errno),
      KernelBitmap(evbits, EV_MAX), BitList(evbits, EV_MAX));
  for (type = 1; type < EV_CNT; ++type) {
    if (!TestBit(evbits, type)) continue;
    memset(bits, 0, sizeof(bits));
    errno = 0;
    rc = ioctl(fd, EVIOCGBIT(type, sizeof(bits)), bits);
    if (!kTypeMax[type]) {
      out("%s.bit.%s=rc %s", key, kTypes[type] ? kTypes[type] + 3 : "?", rc_text(rc, errno));
      continue;
    }
    out("%s.bit.%s=rc %s bitmap %s bits %s", key, kTypes[type] + 3, rc_text(rc, errno),
        KernelBitmap(bits, kTypeMax[type]), BitList(bits, kTypeMax[type]));
    if (type == EV_ABS) {
      for (i = 0; i <= ABS_MAX; ++i) {
        struct input_absinfo abs;
        if (!TestBit(bits, i)) continue;
        memset(&abs, 0, sizeof(abs));
        errno = 0;
        rc = ioctl(fd, EVIOCGABS(i), &abs);
        out("%s.abs.%d=%s value=%d min=%d max=%d fuzz=%d flat=%d resolution=%d", key, i,
            rc_text(rc, errno), abs.value, abs.minimum, abs.maximum, abs.fuzz, abs.flat,
            abs.resolution);
      }
    }
  }
  // the state ioctls
  memset(bits, 0, sizeof(bits));
  errno = 0;
  rc = ioctl(fd, EVIOCGKEY(sizeof(bits)), bits);
  out("%s.key_state=rc %s bits %s", key, rc_text(rc, errno), BitList(bits, KEY_MAX));
  memset(bits, 0, sizeof(bits));
  errno = 0;
  rc = ioctl(fd, EVIOCGLED(sizeof(bits)), bits);
  out("%s.led_state=rc %s bits %s", key, rc_text(rc, errno), BitList(bits, LED_MAX));
  memset(bits, 0, sizeof(bits));
  errno = 0;
  rc = ioctl(fd, EVIOCGSND(sizeof(bits)), bits);
  out("%s.snd_state=rc %s bits %s", key, rc_text(rc, errno), BitList(bits, SND_MAX));
  memset(bits, 0, sizeof(bits));
  errno = 0;
  rc = ioctl(fd, EVIOCGSW(sizeof(bits)), bits);
  out("%s.sw_state=rc %s bits %s", key, rc_text(rc, errno), BitList(bits, SW_MAX));
  rep[0] = rep[1] = -1;
  errno = 0;
  rc = ioctl(fd, EVIOCGREP, rep);
  out("%s.rep=%s delay=%d period=%d", key, rc_text(rc, errno), rep[0], rep[1]);
  errno = 0;
  rc = ioctl(fd, EVIOCGEFFECTS, &i);
  out("%s.effects=%s %d", key, rc_text(rc, errno), rc < 0 ? 0 : i);
  {
    unsigned int clk = CLOCK_MONOTONIC;
    out("%s.setclockid_monotonic=%s", key, RC(ioctl(fd, EVIOCSCLOCKID, &clk)));
    clk = 5;
    out("%s.setclockid_5=%s", key, RC(ioctl(fd, EVIOCSCLOCKID, &clk)));
  }
  // what evdev answers that it does not know, and a read too small
  out("%s.unknown_E7f=%s", key, RC(ioctl(fd, _IO('E', 0x7f), 0)));
  out("%s.unknown_Z01=%s", key, RC(ioctl(fd, _IO('Z', 0x01), 0)));
  out("%s.FIONREAD=%s", key, RC(ioctl(fd, FIONREAD, &i)));
  {
    char small[10];
    struct input_event ev;
    out("%s.read_10=%s", key, RC(read(fd, small, sizeof(small))));
    out("%s.read_empty=%s", key, RC(read(fd, &ev, sizeof(ev))));
    out("%s.write_10=%s", key, RC(write(fd, small, sizeof(small))));
  }
  // EVIOCGRAB: a second reader's grab
  {
    int fd2 = open(path, O_RDONLY | O_NONBLOCK);
    out("%s.grab_1=%s", key, RC(ioctl(fd, EVIOCGRAB, 1)));
    out("%s.grab_2=%s", key, RC(ioctl(fd2, EVIOCGRAB, 1)));
    out("%s.grab_again=%s", key, RC(ioctl(fd, EVIOCGRAB, 1)));
    out("%s.ungrab_2=%s", key, RC(ioctl(fd2, EVIOCGRAB, 0)));
    out("%s.ungrab_1=%s", key, RC(ioctl(fd, EVIOCGRAB, 0)));
    out("%s.ungrab_again=%s", key, RC(ioctl(fd, EVIOCGRAB, 0)));
    close(fd2);
  }
  // the keyboard's keymap through EVIOCGKEYCODE_V2, by index
  if (TestBit(evbits, EV_KEY)) {
    struct input_keymap_entry ke;
    int count = 0;
    for (i = 0; i < 1024; ++i) {
      unsigned scancode = 0;
      memset(&ke, 0, sizeof(ke));
      ke.flags = INPUT_KEYMAP_BY_INDEX;
      ke.index = i;
      errno = 0;
      rc = ioctl(fd, EVIOCGKEYCODE_V2, &ke);
      if (rc < 0) {
        out("%s.keymap.end=index %d %s", key, i, en(errno));
        break;
      }
      memcpy(&scancode, ke.scancode, ke.len < 4 ? ke.len : 4);
      if (ke.keycode) {
        out("%s.keymap[%03d]=scancode 0x%x len %d keycode %u", key, i, scancode, ke.len,
            ke.keycode);
        ++count;
      }
    }
    out("%s.keymap.count=%d", key, count);
    // EVIOCGKEYCODE by scan code: a key's, a tablet button's, and none
    {
      static const unsigned kScancodes[] = {0x1e, 0x90004, 0x90006};
      for (i = 0; i < 3; ++i) {
        unsigned int sk[2] = {kScancodes[i], 0xffff};
        errno = 0;
        rc = ioctl(fd, EVIOCGKEYCODE, sk);
        out("%s.getkeycode_0x%x=%s %u", key, kScancodes[i], rc_text(rc, errno), sk[1]);
      }
    }
  }
  // EVIOCSREP and what reads back, at once and once the driver had time
  if (TestBit(evbits, EV_REP)) {
    static const int kAsk[][2] = {{400, 40}, {1000, 500}, {100, 10}, {251, 34},
                                  {0, 0}, {250, 33}};
    int reader = open(path, O_RDONLY | O_NONBLOCK);
    for (i = 0; i < (int)(sizeof(kAsk) / sizeof(kAsk[0])); ++i) {
      int ask[2] = {kAsk[i][0], kAsk[i][1]}, now[2] = {-1, -1}, later[2] = {-1, -1};
      errno = 0;
      rc = ioctl(fd, EVIOCSREP, ask);
      const char *r = rc_text(rc, errno);
      ioctl(fd, EVIOCGREP, now);
      msleep(300);
      ioctl(fd, EVIOCGREP, later);
      out("%s.setrep_%d_%d=%s at once %d %d after 300 ms %d %d", key, kAsk[i][0], kAsk[i][1],
          r, now[0], now[1], later[0], later[1]);
    }
    // what the requests queued, which no SYN_REPORT has closed: a reader
    // sees it once a write closes the packet
    {
      struct input_event ev[64], syn = {.type = EV_SYN, .code = SYN_REPORT, .value = 0};
      ssize_t got, j;
      int k = 0, w = open(path, O_WRONLY);
      out("%s.setrep.read_before_syn=%s", key, RC(read(reader, ev, sizeof(ev))));
      out("%s.setrep.write_syn=%s", key, RC(write(w, &syn, sizeof(syn))));
      while ((got = read(reader, ev, sizeof(ev))) > 0) {
        for (j = 0; j < got / (ssize_t)sizeof(ev[0]); ++j) {
          out("%s.setrep.queued[%d]=%s", key, k++, EventText(ev + j));
        }
      }
      if (!k) out("%s.setrep.queued=nothing", key);
      close(w);
    }
    close(reader);
  }
  close(fd);
}

static void DumpSysfsInput(int number) {
  char path[256], key[256], link[PATH_MAX];
  static const char *kFiles[] = {"name", "phys", "uniq", "id/bustype", "id/vendor",
                                 "id/product", "id/version", "properties",
                                 "modalias", "capabilities/ev",
                                 "capabilities/key", "capabilities/rel",
                                 "capabilities/abs", "capabilities/msc",
                                 "capabilities/led", "capabilities/snd",
                                 "capabilities/sw", "capabilities/ff", 0};
  ssize_t n;
  int i;
  snprintf(path, sizeof(path), "/sys/class/input/event%d", number);
  n = readlink(path, link, sizeof(link) - 1);
  link[n < 0 ? 0 : n] = 0;
  out("sys.event%d.link=%s", number, link);
  snprintf(path, sizeof(path), "/sys/class/input/event%d/device", number);
  n = readlink(path, link, sizeof(link) - 1);
  link[n < 0 ? 0 : n] = 0;
  out("sys.event%d.device=%s", number, link);
  for (i = 0; kFiles[i]; ++i) {
    snprintf(path, sizeof(path), "/sys/class/input/event%d/device/%s", number, kFiles[i]);
    snprintf(key, sizeof(key), "sys.event%d.%s", number, kFiles[i]);
    dump_value(key, path);
  }
}

static void SectionInput(void) {
  int numbers[32], n, i;
  dump_file("proc.bus.input.devices", "/proc/bus/input/devices");
  n = EventNumbers(numbers, 32);
  out("input.count=%d", n);
  for (i = 0; i < n; ++i) DescribeEventDevice(numbers[i]);
  for (i = 0; i < n; ++i) DumpSysfsInput(numbers[i]);
}

// ------------------------------------------------------------------ events

static void PrintState(const char *when, int number, int fd) {
  unsigned long bits[NLONGS(KEY_CNT)], evbits[NLONGS(EV_CNT)];
  memset(evbits, 0, sizeof(evbits));
  ioctl(fd, EVIOCGBIT(0, sizeof(evbits)), evbits);
  if (TestBit(evbits, EV_KEY)) {
    memset(bits, 0, sizeof(bits));
    ioctl(fd, EVIOCGKEY(sizeof(bits)), bits);
    out("events.%s.event%d.keys=%s", when, number, BitList(bits, KEY_MAX));
  }
  if (TestBit(evbits, EV_LED)) {
    memset(bits, 0, sizeof(bits));
    ioctl(fd, EVIOCGLED(sizeof(bits)), bits);
    out("events.%s.event%d.leds=%s", when, number, BitList(bits, LED_MAX));
  }
  if (TestBit(evbits, EV_ABS)) {
    struct input_absinfo x, y;
    ioctl(fd, EVIOCGABS(ABS_X), &x);
    ioctl(fd, EVIOCGABS(ABS_Y), &y);
    out("events.%s.event%d.abs=x %d y %d", when, number, x.value, y.value);
  }
}

static void SectionEvents(void) {
  int numbers[32], fds[32], n, i, count = 0;
  struct pollfd pfd[33];
  struct timeval start;
  double deadline = now_mono() + 300;
  n = EventNumbers(numbers, 32);
  for (i = 0; i < n; ++i) {
    char path[64];
    snprintf(path, sizeof(path), "/dev/input/event%d", numbers[i]);
    fds[i] = open(path, O_RDONLY | O_NONBLOCK);
    pfd[i].fd = fds[i];
    pfd[i].events = POLLIN;
  }
  // the state before anything happens: what EVIOCGABS gives the tablet
  // before it has moved, which keys are held and which LEDs lit
  for (i = 0; i < n; ++i) PrintState("before", numbers[i], fds[i]);
  pfd[n].fd = 0;
  pfd[n].events = POLLIN;
  gettimeofday(&start, 0);
  fprintf(stderr, "probe: events ready\n");
  for (;;) {
    int ready = poll(pfd, n + 1, 1000);
    if (ready < 0 && errno != EINTR) break;
    if (now_mono() > deadline) {
      out("events.end=timeout");
      break;
    }
    if (pfd[n].revents & POLLIN) {
      char line[256];
      if (read(0, line, sizeof(line)) >= 0) {
        out("events.end=stdin");
        break;
      }
    }
    for (i = 0; i < n; ++i) {
      struct input_event ev[64];
      ssize_t got, j;
      if (!(pfd[i].revents & POLLIN)) continue;
      while ((got = read(fds[i], ev, sizeof(ev))) > 0) {
        for (j = 0; j < got / (ssize_t)sizeof(ev[0]); ++j) {
          double t = (ev[j].input_event_sec - start.tv_sec) +
                     (ev[j].input_event_usec - start.tv_usec) / 1e6;
          out("event[%04d]=event%d +%.6f %s", count++, numbers[i], t, EventText(ev + j));
        }
      }
    }
  }
  out("events.count=%d", count);
  for (i = 0; i < n; ++i) PrintState("after", numbers[i], fds[i]);
  for (i = 0; i < n; ++i) close(fds[i]);
}

// ------------------------------------------------------------------ fb

static void PrintVar(const char *key, const struct fb_var_screeninfo *v) {
  out("%s=xres %u yres %u xres_virtual %u yres_virtual %u xoffset %u yoffset %u bpp %u "
      "grayscale %u red %u/%u/%u green %u/%u/%u blue %u/%u/%u transp %u/%u/%u nonstd %u "
      "activate %u height %u width %u accel_flags %u pixclock %u left_margin %u "
      "right_margin %u upper_margin %u lower_margin %u hsync_len %u vsync_len %u sync %u "
      "vmode %u rotate %u colorspace %u",
      key, v->xres, v->yres, v->xres_virtual, v->yres_virtual, v->xoffset, v->yoffset,
      v->bits_per_pixel, v->grayscale, v->red.offset, v->red.length, v->red.msb_right,
      v->green.offset, v->green.length, v->green.msb_right, v->blue.offset, v->blue.length,
      v->blue.msb_right, v->transp.offset, v->transp.length, v->transp.msb_right, v->nonstd,
      v->activate, v->height, v->width, v->accel_flags, v->pixclock, v->left_margin,
      v->right_margin, v->upper_margin, v->lower_margin, v->hsync_len, v->vsync_len, v->sync,
      v->vmode, v->rotate, v->colorspace);
}

static int fb;
static struct fb_var_screeninfo orig;

/* FBIOPUT_VSCREENINFO of `v`: its answer, what it wrote back and what the
 * device reads afterwards; then the original mode again. */
static void TryPut(const char *name, struct fb_var_screeninfo v) {
  struct fb_var_screeninfo after;
  char key[128];
  int rc, e;
  errno = 0;
  rc = ioctl(fb, FBIOPUT_VSCREENINFO, &v);
  e = errno;
  out("fb.put.%s=%s", name, rc_text(rc, e));
  snprintf(key, sizeof(key), "fb.put.%s.written_back", name);
  if (rc == 0) PrintVar(key, &v);
  memset(&after, 0, sizeof(after));
  ioctl(fb, FBIOGET_VSCREENINFO, &after);
  snprintf(key, sizeof(key), "fb.put.%s.get_after", name);
  PrintVar(key, &after);
  v = orig;
  v.activate = FB_ACTIVATE_NOW | FB_ACTIVATE_FORCE;
  if (ioctl(fb, FBIOPUT_VSCREENINFO, &v)) out("fb.put.%s.restore=-1 %s", name, en(errno));
}

static void SectionFb(void) {
  struct fb_fix_screeninfo fix;
  struct fb_var_screeninfo v;
  int rc, i;
  if ((fb = open("/dev/fb0", O_RDWR)) < 0) {
    out("fb.open=-1 %s", en(errno));
    return;
  }
  out("fb.open=0");
  memset(&fix, 0, sizeof(fix));
  errno = 0;
  rc = ioctl(fb, FBIOGET_FSCREENINFO, &fix);
  out("fb.fix=%s id \"%s\" smem_start 0x%lx smem_len %u type %u type_aux %u visual %u "
      "xpanstep %u ypanstep %u ywrapstep %u line_length %u mmio_start 0x%lx mmio_len %u "
      "accel %u capabilities %u reserved %u %u",
      rc_text(rc, errno), printable((unsigned char *)fix.id, strnlen(fix.id, 16)),
      fix.smem_start, fix.smem_len, fix.type, fix.type_aux, fix.visual, fix.xpanstep,
      fix.ypanstep, fix.ywrapstep, fix.line_length, fix.mmio_start, fix.mmio_len, fix.accel,
      fix.capabilities, fix.reserved[0], fix.reserved[1]);
  out("fb.fix.id_bytes=%s", printable((unsigned char *)fix.id, 16));
  memset(&orig, 0, sizeof(orig));
  errno = 0;
  rc = ioctl(fb, FBIOGET_VSCREENINFO, &orig);
  out("fb.var.rc=%s", rc_text(rc, errno));
  PrintVar("fb.var", &orig);

  // FBIOPUT_VSCREENINFO
  TryPut("same", orig);
  v = orig;
  v.activate = FB_ACTIVATE_NOW | FB_ACTIVATE_FORCE;
  TryPut("same_force", v);
  v = orig, v.xres = orig.xres / 2, v.yres = orig.yres / 2;
  TryPut("half_size", v);
  v = orig, v.xres = 8, v.yres = 8;
  TryPut("size_8x8", v);
  v = orig, v.xres = 4, v.yres = 4;
  TryPut("size_4x4", v);
  v = orig, v.yres = orig.yres_virtual;
  TryPut("yres_to_yres_virtual", v);
  v = orig, v.xres = orig.xres + 8, v.yres = orig.yres + 8;
  TryPut("larger_by_8", v);
  v = orig, v.xres = 640, v.yres = 480;
  TryPut("size_640x480", v);
  v = orig, v.yres_virtual = orig.yres_virtual * 2;
  TryPut("yres_virtual_double", v);
  v = orig, v.xres_virtual = orig.xres_virtual + 8;
  TryPut("xres_virtual_larger", v);
  v = orig, v.yres_virtual = orig.yres;
  TryPut("yres_virtual_one_page", v);
  for (i = 0; i < 4; ++i) {
    static const unsigned kBpp[] = {8, 16, 24, 32};
    char name[64];
    v = orig, v.bits_per_pixel = kBpp[i];
    snprintf(name, sizeof(name), "bpp_%u_layout_kept", kBpp[i]);
    TryPut(name, v);
    v = orig, v.bits_per_pixel = kBpp[i];
    memset(&v.red, 0, sizeof(v.red) * 4);
    snprintf(name, sizeof(name), "bpp_%u_layout_zero", kBpp[i]);
    TryPut(name, v);
  }
  v = orig, v.bits_per_pixel = 16;
  v.red = (struct fb_bitfield){11, 5, 0};
  v.green = (struct fb_bitfield){5, 6, 0};
  v.blue = (struct fb_bitfield){0, 5, 0};
  v.transp = (struct fb_bitfield){0, 0, 0};
  TryPut("bpp_16_rgb565", v);
  v = orig, v.bits_per_pixel = 64;
  TryPut("bpp_64", v);
  v = orig;
  v.red = (struct fb_bitfield){0, 8, 0};
  v.blue = (struct fb_bitfield){16, 8, 0};
  TryPut("bgr_layout", v);
  v = orig, v.transp = (struct fb_bitfield){24, 8, 0};
  TryPut("transp_24_8", v);
  v = orig, v.grayscale = 1;
  TryPut("grayscale", v);
  v = orig, v.nonstd = 1;
  TryPut("nonstd", v);
  v = orig, v.pixclock = 12345;
  TryPut("pixclock", v);
  v = orig, v.yoffset = orig.yres;
  TryPut("yoffset_page_2", v);
  v = orig, v.yoffset = orig.yres + 1;
  TryPut("yoffset_past_page_2", v);
  v = orig, v.xoffset = 8;
  TryPut("xoffset_8", v);
  v = orig, v.xres = orig.xres / 2, v.yres = orig.yres / 2, v.yoffset = orig.yres_virtual - v.yres;
  TryPut("half_size_yoffset_bottom", v);
  v = orig, v.xres = orig.xres / 2, v.activate = FB_ACTIVATE_TEST;
  TryPut("half_width_activate_test", v);
  v = orig, v.activate = FB_ACTIVATE_INV_MODE;
  TryPut("inv_mode_current", v);
  memset(&v, 0, sizeof(v));
  TryPut("all_zero", v);
  memset(&v, 0, sizeof(v));
  v.xres = orig.xres, v.yres = orig.yres, v.xres_virtual = orig.xres_virtual;
  v.yres_virtual = orig.yres_virtual, v.bits_per_pixel = 32;
  TryPut("size_only_bpp_32", v);

  // FBIOPAN_DISPLAY
  {
    static const struct {
      const char *name;
      unsigned x, y, vmode;
    } kPans[] = {{"page_2", 0, 0, 0},       {"page_1", 0, 0, 0},  {"line_1", 0, 1, 0},
                 {"past_page_2", 0, 1, 0},  {"x_8", 8, 0, 0},     {"ywrap", 0, 1, FB_VMODE_YWRAP},
                 {"bottom", 0, 0, 0},       {"back", 0, 0, 0}};
    for (i = 0; i < (int)(sizeof(kPans) / sizeof(kPans[0])); ++i) {
      struct fb_var_screeninfo after;
      v = orig;
      v.xoffset = kPans[i].x;
      v.yoffset = kPans[i].y;
      if (!strcmp(kPans[i].name, "page_2") || !strcmp(kPans[i].name, "bottom")) v.yoffset = orig.yres;
      if (!strcmp(kPans[i].name, "past_page_2")) v.yoffset = orig.yres + 1;
      v.vmode |= kPans[i].vmode;
      errno = 0;
      rc = ioctl(fb, FBIOPAN_DISPLAY, &v);
      memset(&after, 0, sizeof(after));
      ioctl(fb, FBIOGET_VSCREENINFO, &after);
      out("fb.pan.%s=%s asked x %u y %u now xoffset %u yoffset %u vmode %u", kPans[i].name,
          rc_text(rc, errno), v.xoffset, v.yoffset, after.xoffset, after.yoffset, after.vmode);
    }
    v = orig;
    ioctl(fb, FBIOPAN_DISPLAY, &v);
  }

  // FBIO_WAITFORVSYNC
  {
    __u32 crtc = 0;
    double t0, t[11];
    errno = 0;
    rc = ioctl(fb, FBIO_WAITFORVSYNC, &crtc);
    out("fb.vsync=%s", rc_text(rc, errno));
    crtc = 1;
    out("fb.vsync_crtc_1=%s", RC(ioctl(fb, FBIO_WAITFORVSYNC, &crtc)));
    out("fb.vsync_null=%s", RC(ioctl(fb, FBIO_WAITFORVSYNC, 0)));
    crtc = 0;
    t0 = t[0] = now_mono();
    for (i = 1; i <= 10; ++i) {
      ioctl(fb, FBIO_WAITFORVSYNC, &crtc);
      t[i] = now_mono();
    }
    out("fb.vsync.ten_calls_ms=%.3f", (t[10] - t0) * 1e3);
    for (i = 1; i <= 10; ++i) out("fb.vsync.call[%d]_ms=%.3f", i, (t[i] - t[i - 1]) * 1e3);
    // a pan right after a wait, timed
    v = orig, v.yoffset = orig.yres;
    t0 = now_mono();
    rc = ioctl(fb, FBIOPAN_DISPLAY, &v);
    out("fb.pan_after_vsync=%s took_ms %.3f", rc_text(rc, errno), (now_mono() - t0) * 1e3);
    v = orig;
    ioctl(fb, FBIOPAN_DISPLAY, &v);
    // pans back to back, between the two pages: does a pan wait for vblank
    for (i = 1; i <= 8; ++i) {
      v = orig, v.yoffset = i % 2 ? orig.yres : 0;
      out("fb.pan_loop[%d]=%s", i, TIMED(ioctl(fb, FBIOPAN_DISPLAY, &v)));
    }
    // the frame loop "wait for vsync, then pan", timed a frame at a time
    t[0] = now_mono();
    for (i = 1; i <= 8; ++i) {
      ioctl(fb, FBIO_WAITFORVSYNC, &crtc);
      v = orig, v.yoffset = i % 2 ? orig.yres : 0;
      ioctl(fb, FBIOPAN_DISPLAY, &v);
      t[i % 11] = now_mono();
      out("fb.wait_then_pan[%d]_ms=%.3f", i, (t[i % 11] - t[(i - 1) % 11]) * 1e3);
    }
    // FBIOPUT_VSCREENINFO with a new yoffset, back to back
    for (i = 1; i <= 4; ++i) {
      v = orig, v.yoffset = i % 2 ? orig.yres : 0;
      out("fb.put_yoffset_loop[%d]=%s", i, TIMED(ioctl(fb, FBIOPUT_VSCREENINFO, &v)));
    }
    v = orig;
    ioctl(fb, FBIOPAN_DISPLAY, &v);
    // a pan to the page already shown
    out("fb.pan_same_page=%s", TIMED(ioctl(fb, FBIOPAN_DISPLAY, &v)));
  }

  // FBIOBLANK
  {
    static const long kLevels[] = {0, 1, 2, 3, 4, 5, -1, 0};
    for (i = 0; i < 8; ++i) {
      out("fb.blank_%ld=%s", kLevels[i], RC(ioctl(fb, FBIOBLANK, kLevels[i])));
    }
  }

  // other requests
  {
    struct fb_cmap cmap;
    __u16 r[256], g[256], b[256];
    struct fb_con2fbmap map = {1, 0};
    cmap.start = 0, cmap.len = 16, cmap.red = r, cmap.green = g, cmap.blue = b, cmap.transp = 0;
    errno = 0;
    rc = ioctl(fb, FBIOGETCMAP, &cmap);
    out("fb.getcmap=%s red0 %u red15 %u", rc_text(rc, errno), r[0], r[15]);
    out("fb.putcmap=%s", RC(ioctl(fb, FBIOPUTCMAP, &cmap)));
    errno = 0;
    rc = ioctl(fb, FBIOGET_CON2FBMAP, &map);
    out("fb.get_con2fbmap=%s console 1 framebuffer %u", rc_text(rc, errno), map.framebuffer);
    out("fb.unknown_F7f=%s", RC(ioctl(fb, _IO('F', 0x7f), 0)));
    out("fb.unknown_Z01=%s", RC(ioctl(fb, _IO('Z', 0x01), 0)));
    out("fb.cursor=%s", RC(ioctl(fb, FBIO_CURSOR, 0)));
    out("fb.getvblank=%s", RC(ioctl(fb, FBIOGET_VBLANK, &v)));
  }

  // mmap
  {
    size_t len = fix.smem_len;
    unsigned char *s, *p, *big, *off;
    size_t nonzero = 0, j;
    s = mmap(0, len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    out("fb.mmap_shared=%s", s == MAP_FAILED ? rc_text(-1, errno) : "ok");
    if (s == MAP_FAILED) return;
    for (j = 0; j < len; ++j) nonzero += s[j] != 0;
    out("fb.initial_nonzero_bytes=%zu", nonzero);
    big = mmap(0, len + 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    out("fb.mmap_past_end=%s", big == MAP_FAILED ? rc_text(-1, errno) : "ok");
    if (big != MAP_FAILED) munmap(big, len + 4096);
    off = mmap(0, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fb, (len + 4095) & ~4095ul);
    out("fb.mmap_at_end=%s", off == MAP_FAILED ? rc_text(-1, errno) : "ok");
    if (off != MAP_FAILED) munmap(off, 4096);
    out("fb.multipage_tests=%s", len >= 3 * 4096 ? "yes" : "no, smem_len under 3 pages");
    if (len < 3 * 4096) goto io;
    off = mmap(0, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 4096);
    out("fb.mmap_offset_4096=%s", off == MAP_FAILED ? rc_text(-1, errno) : "ok");
    if (off != MAP_FAILED) {
      s[4096] = 0x5a;
      out("fb.mmap_offset_4096.sees_shared=%s", off[0] == 0x5a ? "yes" : "no");
      s[4096] = 0;
      munmap(off, 4096);
    }
    p = mmap(0, len, PROT_READ | PROT_WRITE, MAP_PRIVATE, fb, 0);
    out("fb.mmap_private=%s", p == MAP_FAILED ? rc_text(-1, errno) : "ok");
    if (p != MAP_FAILED) {
      s[0] = 0x11;
      out("fb.private.sees_shared_write_untouched_page=%s", p[0] == 0x11 ? "yes" : "no");
      p[8192] = 0x22;
      out("fb.private.write_reaches_shared=%s", s[8192] == 0x22 ? "yes" : "no");
      s[8192 + 4] = 0x33;
      out("fb.private.sees_shared_after_own_write=%s", p[8192 + 4] == 0x33 ? "yes" : "no");
      s[0] = s[8192] = s[8192 + 4] = 0;
      munmap(p, len);
    }
  io:
    // write(), read(), lseek()
    {
      unsigned char data[16], back[16];
      off_t o;
      for (j = 0; j < 16; ++j) data[j] = 0xa0 + j;
      out("fb.lseek_0=%s", RC(lseek(fb, 0, SEEK_SET)));
      out("fb.write_16=%s", RC(write(fb, data, 16)));
      out("fb.write.reaches_mmap=%s", !memcmp(s, data, 16) ? "yes" : "no");
      out("fb.lseek_cur=%s", RC(lseek(fb, 0, SEEK_CUR)));
      out("fb.lseek_0_again=%s", RC(lseek(fb, 0, SEEK_SET)));
      memset(back, 0, 16);
      out("fb.read_16=%s", RC(read(fb, back, 16)));
      out("fb.read.matches=%s", !memcmp(back, data, 16) ? "yes" : "no");
      memset(s, 0, 16);
      out("fb.lseek_end_0=%s", RC(lseek(fb, 0, SEEK_END)));
      out("fb.lseek_end_minus_16=%s", RC(lseek(fb, -16, SEEK_END)));
      out("fb.lseek_data=%s", RC(lseek(fb, 0, SEEK_DATA)));
      out("fb.lseek_hole=%s", RC(lseek(fb, 0, SEEK_HOLE)));
      out("fb.lseek_negative=%s", RC(lseek(fb, -1, SEEK_SET)));
      o = lseek(fb, len - 8, SEEK_SET);
      out("fb.write_across_end=%s at %lld", RC(write(fb, data, 16)), (long long)o);
      out("fb.offset_after=%s", RC(lseek(fb, 0, SEEK_CUR)));
      out("fb.write_at_end=%s", RC(write(fb, data, 16)));
      lseek(fb, len + 16, SEEK_SET);
      out("fb.write_past_end=%s", RC(write(fb, data, 16)));
      lseek(fb, len, SEEK_SET);
      out("fb.read_at_end=%s", RC(read(fb, back, 16)));
      lseek(fb, len + 16, SEEK_SET);
      out("fb.read_past_end=%s", RC(read(fb, back, 16)));
      out("fb.pwrite_0=%s", RC(pwrite(fb, data, 16, 0)));
      out("fb.pread_0=%s", RC(pread(fb, back, 16, 0)));
      out("fb.fsync=%s", RC(fsync(fb)));
      out("fb.fdatasync=%s", RC(fdatasync(fb)));
      memset(s + len - 8, 0, 8);
      memset(s, 0, 16);
    }
    munmap(s, len);
  }
  // the poll answer
  {
    struct pollfd pf = {fb, POLLIN | POLLOUT, 0};
    errno = 0;
    rc = poll(&pf, 1, 0);
    out("fb.poll=%s revents 0x%x", rc_text(rc, errno), pf.revents);
  }
  v = orig;
  v.activate = FB_ACTIVATE_NOW | FB_ACTIVATE_FORCE;
  ioctl(fb, FBIOPUT_VSCREENINFO, &v);
  ioctl(fb, FBIOBLANK, 0);
  close(fb);
}

// ------------------------------------------------------------------ dsp

static void DumpHwParams(const char *key) {
  char k[128];
  snprintf(k, sizeof(k), "%s.hw_params", key);
  dump_file(k, "/proc/asound/card0/pcm0p/sub0/hw_params");
  snprintf(k, sizeof(k), "%s.sw_params", key);
  dump_file(k, "/proc/asound/card0/pcm0p/sub0/sw_params");
}

static void DspReport(const char *key, int fd) {
  int v = 0, rc;
  audio_buf_info info;
  memset(&info, 0, sizeof(info));
  errno = 0;
  rc = ioctl(fd, SNDCTL_DSP_GETBLKSIZE, &v);
  out("%s.getblksize=%s %d", key, rc_text(rc, errno), v);
  errno = 0;
  rc = ioctl(fd, SNDCTL_DSP_GETOSPACE, &info);
  out("%s.getospace=%s fragments %d fragstotal %d fragsize %d bytes %d", key,
      rc_text(rc, errno), info.fragments, info.fragstotal, info.fragsize, info.bytes);
  v = 0;
  errno = 0;
  rc = ioctl(fd, SNDCTL_DSP_GETODELAY, &v);
  out("%s.getodelay=%s %d", key, rc_text(rc, errno), v);
  v = AFMT_QUERY;
  errno = 0;
  rc = ioctl(fd, SNDCTL_DSP_SETFMT, &v);
  out("%s.format=%s 0x%x", key, rc_text(rc, errno), v);
  v = 0;
  errno = 0;
  rc = ioctl(fd, SOUND_PCM_READ_RATE, &v);
  out("%s.rate=%s %d", key, rc_text(rc, errno), v);
  v = 0;
  errno = 0;
  rc = ioctl(fd, SOUND_PCM_READ_CHANNELS, &v);
  out("%s.channels=%s %d", key, rc_text(rc, errno), v);
  v = 0;
  errno = 0;
  rc = ioctl(fd, SOUND_PCM_READ_BITS, &v);
  out("%s.bits=%s %d", key, rc_text(rc, errno), v);
  DumpHwParams(key);
}

static int DspOpen(const char *key, int flags) {
  int fd = open("/dev/dsp", flags);
  if (fd < 0) out("%s.open=-1 %s", key, en(errno));
  return fd;
}

static int SetInt(const char *key, const char *what, int fd, unsigned long request, int value) {
  int v = value, rc;
  errno = 0;
  rc = ioctl(fd, request, &v);
  out("%s.%s=%s %d (0x%x)", key, what, rc_text(rc, errno), v, v);
  return rc < 0 ? rc : v;
}

static void DspSequence(const char *key, int rate, int format, int channels, int rate_first) {
  int fd = DspOpen(key, O_WRONLY);
  if (fd < 0) return;
  if (rate_first) SetInt(key, "1_speed", fd, SNDCTL_DSP_SPEED, rate);
  SetInt(key, rate_first ? "2_setfmt" : "1_setfmt", fd, SNDCTL_DSP_SETFMT, format);
  SetInt(key, rate_first ? "3_channels" : "2_channels", fd, SNDCTL_DSP_CHANNELS, channels);
  if (!rate_first) SetInt(key, "3_speed", fd, SNDCTL_DSP_SPEED, rate);
  DspReport(key, fd);
  close(fd);
}

/* A tone of `seconds` at `hz`, half of full scale, in S16 or U8. */
static size_t MakeTone(void *buf, int rate, int channels, int format, double hz, double seconds) {
  size_t frames = rate * seconds, i;
  int c;
  for (i = 0; i < frames; ++i) {
    double x = 0.5 * sin(2 * M_PI * hz * i / rate);
    for (c = 0; c < channels; ++c) {
      if (format == AFMT_S16_LE) {
        ((int16_t *)buf)[i * channels + c] = (int16_t)(x * 32767);
      } else {
        ((uint8_t *)buf)[i * channels + c] = (uint8_t)(128 + x * 127);
      }
    }
  }
  return frames * channels * (format == AFMT_S16_LE ? 2 : 1);
}

/* /dev/dsp while FluidSynth plays: it holds the USB card's playback (card
 * 2), so the HDA card's, /dev/dsp's, is free. Then a tone on /dev/dsp at
 * 1250 Hz with an organ's C5 from the MIDI port under it, which the
 * recording should hold together. */
static void SectionDspMidi(void) {
  static int16_t tone[44100 * 2 * 3 / 2];
  int fd, midi, v;
  size_t size;
  fd = open("/dev/dsp", O_WRONLY);
  out("dsp_midi.open_wronly=%s", fd < 0 ? rc_text(-1, errno) : "0");
  if (fd >= 0) close(fd);
  fd = open("/dev/dsp", O_WRONLY | O_NONBLOCK);
  out("dsp_midi.open_wronly_nonblock=%s", fd < 0 ? rc_text(-1, errno) : "0");
  if (fd >= 0) close(fd);
  fd = open("/dev/mixer", O_RDWR);
  out("dsp_midi.open_mixer=%s", fd < 0 ? rc_text(-1, errno) : "0");
  if (fd >= 0) close(fd);
  dump_file("dsp_midi.card0_status", "/proc/asound/card0/pcm0p/sub0/status");
  dump_file("dsp_midi.card2_status", "/proc/asound/card2/pcm0p/sub0/status");
  dump_file("dsp_midi.card2_hw_params", "/proc/asound/card2/pcm0p/sub0/hw_params");
  if ((midi = open("/dev/snd/midiC1D0", O_WRONLY)) < 0) {
    out("dsp_midi.midi_open=-1 %s", en(errno));
    return;
  }
  if ((fd = DspOpen("dsp_midi.together", O_WRONLY)) < 0) {
    close(midi);
    return;
  }
  SetInt("dsp_midi.together", "setfmt", fd, SNDCTL_DSP_SETFMT, AFMT_S16_LE);
  SetInt("dsp_midi.together", "channels", fd, SNDCTL_DSP_CHANNELS, 2);
  SetInt("dsp_midi.together", "speed", fd, SNDCTL_DSP_SPEED, 44100);
  size = MakeTone(tone, 44100, 2, AFMT_S16_LE, 1250, 1.5);
  {
    // Church Organ on channel 1, C5, which holds as long as the key does
    unsigned char on[] = {0xc0, 19, 0x90, 72, 110};
    out("dsp_midi.together.note_on=%s", RC(write(midi, on, sizeof(on))));
  }
  out("dsp_midi.together.write=%s", TIMED(write(fd, tone, size)));
  v = 0;
  out("dsp_midi.together.sync=%s", TIMED(ioctl(fd, SNDCTL_DSP_SYNC, &v)));
  {
    unsigned char off[] = {0x80, 72, 0, 0xc0, 0};
    out("dsp_midi.together.note_off=%s", RC(write(midi, off, sizeof(off))));
  }
  close(fd);
  close(midi);
  msleep(500);
}

static void SectionDsp(void) {
  static char buf[4 << 20];
  int fd, fd2, rc, v, i;
  // the defaults right after open
  if ((fd = DspOpen("dsp.default", O_WRONLY)) >= 0) {
    v = 0;
    errno = 0;
    rc = ioctl(fd, SNDCTL_DSP_GETFMTS, &v);
    out("dsp.default.getfmts=%s 0x%x", rc_text(rc, errno), v);
    v = 0;
    errno = 0;
    rc = ioctl(fd, SNDCTL_DSP_GETCAPS, &v);
    out("dsp.default.getcaps=%s 0x%x", rc_text(rc, errno), v);
    v = 0;
    errno = 0;
    rc = ioctl(fd, SNDCTL_DSP_GETTRIGGER, &v);
    out("dsp.default.gettrigger=%s 0x%x", rc_text(rc, errno), v);
    v = 0;
    errno = 0;
    rc = ioctl(fd, OSS_GETVERSION, &v);
    out("dsp.default.oss_getversion=%s 0x%x", rc_text(rc, errno), v);
    DspReport("dsp.default", fd);
    close(fd);
  }
  // the second open while the first holds playback, and the other modes
  if ((fd = DspOpen("dsp.twice", O_WRONLY)) >= 0) {
    fd2 = open("/dev/dsp", O_WRONLY);
    out("dsp.twice.second_wronly=%s", fd2 < 0 ? rc_text(-1, errno) : "0");
    if (fd2 >= 0) close(fd2);
    fd2 = open("/dev/dsp", O_WRONLY | O_NONBLOCK);
    out("dsp.twice.second_wronly_nonblock=%s", fd2 < 0 ? rc_text(-1, errno) : "0");
    if (fd2 >= 0) close(fd2);
    close(fd);
  }
  fd = open("/dev/dsp", O_RDONLY);
  out("dsp.open_rdonly=%s", fd < 0 ? rc_text(-1, errno) : "0");
  if (fd >= 0) close(fd);
  if ((fd = open("/dev/dsp", O_RDWR)) >= 0) {
    out("dsp.open_rdwr=0");
    v = 0;
    errno = 0;
    rc = ioctl(fd, SNDCTL_DSP_GETCAPS, &v);
    out("dsp.rdwr.getcaps=%s 0x%x", rc_text(rc, errno), v);
    close(fd);
  } else {
    out("dsp.open_rdwr=-1 %s", en(errno));
  }
  // the two orders, at two settings
  DspSequence("dsp.s16_stereo_44100_rate_first", 44100, AFMT_S16_LE, 2, 1);
  DspSequence("dsp.s16_stereo_44100_rate_last", 44100, AFMT_S16_LE, 2, 0);
  DspSequence("dsp.s16_mono_22050_rate_first", 22050, AFMT_S16_LE, 1, 1);
  DspSequence("dsp.s16_mono_22050_rate_last", 22050, AFMT_S16_LE, 1, 0);
  DspSequence("dsp.s16_stereo_48000_rate_last", 48000, AFMT_S16_LE, 2, 0);
  DspSequence("dsp.u8_mono_8000_rate_last", 8000, AFMT_U8, 1, 0);
  // SETFRAGMENT
  {
    static const struct {
      const char *key;
      int frag, settings;
    } kFrags[] = {
        {"dsp.frag_0004000a_default", 0x0004000a, 0},
        {"dsp.frag_7fff000b_default", 0x7fff000b, 0},
        {"dsp.frag_0004000a_then_s16_stereo_44100", 0x0004000a, 1},
        {"dsp.frag_7fff000b_then_s16_stereo_44100", 0x7fff000b, 1},
        {"dsp.frag_0002000c_then_s16_stereo_44100", 0x0002000c, 1},
        {"dsp.frag_00020004", 0x00020004, 0},
        {"dsp.frag_00000018", 0x00000018, 0},
        {"dsp.frag_00000019", 0x00000019, 0},
    };
    for (i = 0; i < (int)(sizeof(kFrags) / sizeof(kFrags[0])); ++i) {
      if ((fd = DspOpen(kFrags[i].key, O_WRONLY)) < 0) continue;
      SetInt(kFrags[i].key, "setfragment", fd, SNDCTL_DSP_SETFRAGMENT, kFrags[i].frag);
      SetInt(kFrags[i].key, "setfragment_again", fd, SNDCTL_DSP_SETFRAGMENT, 0x0008000a);
      SetInt(kFrags[i].key, "subdivide_after", fd, SNDCTL_DSP_SUBDIVIDE, 2);
      if (kFrags[i].settings) {
        SetInt(kFrags[i].key, "setfmt", fd, SNDCTL_DSP_SETFMT, AFMT_S16_LE);
        SetInt(kFrags[i].key, "channels", fd, SNDCTL_DSP_CHANNELS, 2);
        SetInt(kFrags[i].key, "speed", fd, SNDCTL_DSP_SPEED, 44100);
      }
      DspReport(kFrags[i].key, fd);
      close(fd);
    }
    // the settings first, then SETFRAGMENT
    if ((fd = DspOpen("dsp.s16_stereo_44100_then_frag_0004000a", O_WRONLY)) >= 0) {
      const char *k = "dsp.s16_stereo_44100_then_frag_0004000a";
      SetInt(k, "setfmt", fd, SNDCTL_DSP_SETFMT, AFMT_S16_LE);
      SetInt(k, "channels", fd, SNDCTL_DSP_CHANNELS, 2);
      SetInt(k, "speed", fd, SNDCTL_DSP_SPEED, 44100);
      SetInt(k, "setfragment", fd, SNDCTL_DSP_SETFRAGMENT, 0x0004000a);
      DspReport(k, fd);
      close(fd);
    }
    // SUBDIVIDE first
    if ((fd = DspOpen("dsp.subdivide_4", O_WRONLY)) >= 0) {
      SetInt("dsp.subdivide_4", "subdivide", fd, SNDCTL_DSP_SUBDIVIDE, 4);
      SetInt("dsp.subdivide_4", "setfragment_after", fd, SNDCTL_DSP_SETFRAGMENT, 0x0004000a);
      DspReport("dsp.subdivide_4", fd);
      close(fd);
    }
  }
  // formats, rates and channels a program can ask for
  if ((fd = DspOpen("dsp.ask", O_WRONLY)) >= 0) {
    static const int kFormats[] = {AFMT_A_LAW, 0x12345, AFMT_MU_LAW, AFMT_S8, AFMT_U16_LE,
                                   AFMT_U16_BE, AFMT_S16_BE, AFMT_S24_LE, AFMT_S24_BE,
                                   AFMT_S24_PACKED, AFMT_S32_LE, AFMT_S32_BE, AFMT_FLOAT,
                                   AFMT_SPDIF_RAW, AFMT_AC3, AFMT_IMA_ADPCM, AFMT_U8};
    static const int kRates[] = {500, 999, 1000, 4000, 8000, 11025, 16000, 22050, 32000,
                                 44100, 48000, 96000, 192000, 200000, 300000, -5, 0};
    static const int kChannels[] = {0, 1, 2, 3, 6, 8, 128, 129, 200, -1, 1};
    char what[64];
    for (i = 0; i < (int)(sizeof(kFormats) / sizeof(kFormats[0])); ++i) {
      snprintf(what, sizeof(what), "setfmt_0x%x", kFormats[i]);
      SetInt("dsp.ask", what, fd, SNDCTL_DSP_SETFMT, kFormats[i]);
    }
    for (i = 0; i < (int)(sizeof(kRates) / sizeof(kRates[0])); ++i) {
      snprintf(what, sizeof(what), "speed_%d", kRates[i]);
      SetInt("dsp.ask", what, fd, SNDCTL_DSP_SPEED, kRates[i]);
    }
    for (i = 0; i < (int)(sizeof(kChannels) / sizeof(kChannels[0])); ++i) {
      snprintf(what, sizeof(what), "channels_%d", kChannels[i]);
      SetInt("dsp.ask", what, fd, SNDCTL_DSP_CHANNELS, kChannels[i]);
    }
    SetInt("dsp.ask", "stereo_1", fd, SNDCTL_DSP_STEREO, 1);
    SetInt("dsp.ask", "stereo_0", fd, SNDCTL_DSP_STEREO, 0);
    SetInt("dsp.ask", "stereo_5", fd, SNDCTL_DSP_STEREO, 5);
    out("dsp.ask.settrigger_0=%s", RC(ioctl(fd, SNDCTL_DSP_SETTRIGGER, &(int){0})));
    out("dsp.ask.settrigger_output=%s", RC(ioctl(fd, SNDCTL_DSP_SETTRIGGER, &(int){PCM_ENABLE_OUTPUT})));
    out("dsp.ask.unknown_P7f=%s", RC(ioctl(fd, _IO('P', 0x7f), 0)));
    out("dsp.ask.unknown_Z01=%s", RC(ioctl(fd, _IO('Z', 0x01), 0)));
    out("dsp.ask.nonblock=%s", RC(ioctl(fd, SNDCTL_DSP_NONBLOCK, 0)));
    out("dsp.ask.post=%s", RC(ioctl(fd, SNDCTL_DSP_POST, 0)));
    out("dsp.ask.reset=%s", RC(ioctl(fd, SNDCTL_DSP_RESET, 0)));
    v = 0;
    errno = 0;
    rc = ioctl(fd, SOUND_MIXER_READ_VOLUME, &v);
    out("dsp.ask.mixer_read_volume=%s 0x%x", rc_text(rc, errno), v);
    v = 0;
    errno = 0;
    rc = ioctl(fd, SOUND_MIXER_READ_DEVMASK, &v);
    out("dsp.ask.mixer_read_devmask=%s 0x%x", rc_text(rc, errno), v);
    {
      count_info ci;
      memset(&ci, 0, sizeof(ci));
      errno = 0;
      rc = ioctl(fd, SNDCTL_DSP_GETOPTR, &ci);
      out("dsp.ask.getoptr=%s bytes %d blocks %d ptr %d", rc_text(rc, errno), ci.bytes, ci.blocks, ci.ptr);
      out("dsp.ask.getiptr=%s", RC(ioctl(fd, SNDCTL_DSP_GETIPTR, &ci)));
      audio_buf_info info;
      out("dsp.ask.getispace=%s", RC(ioctl(fd, SNDCTL_DSP_GETISPACE, &info)));
    }
    {
      void *m = mmap(0, 65536, PROT_WRITE, MAP_SHARED, fd, 0);
      out("dsp.ask.mmap=%s", m == MAP_FAILED ? rc_text(-1, errno) : "ok");
      if (m != MAP_FAILED) munmap(m, 65536);
    }
    {
      char b[16];
      out("dsp.ask.read=%s", RC(read(fd, b, sizeof(b))));
      struct pollfd pf = {fd, POLLIN | POLLOUT, 0};
      errno = 0;
      rc = poll(&pf, 1, 0);
      out("dsp.ask.poll=%s revents 0x%x", rc_text(rc, errno), pf.revents);
    }
    close(fd);
  }
  // a tone: 0.5 s at 750 Hz, 44.1 kHz S16 stereo; the write, SYNC and close
  if ((fd = DspOpen("dsp.tone", O_WRONLY)) >= 0) {
    size_t n;
    SetInt("dsp.tone", "setfmt", fd, SNDCTL_DSP_SETFMT, AFMT_S16_LE);
    SetInt("dsp.tone", "channels", fd, SNDCTL_DSP_CHANNELS, 2);
    SetInt("dsp.tone", "speed", fd, SNDCTL_DSP_SPEED, 44100);
    n = MakeTone(buf, 44100, 2, AFMT_S16_LE, 750, 0.5);
    out("dsp.tone.write_%zu=%s", n, TIMED(write(fd, buf, n)));
    DspReport("dsp.tone.after_write", fd);
    out("dsp.tone.sync=%s", TIMED(ioctl(fd, SNDCTL_DSP_SYNC, 0)));
    DspReport("dsp.tone.after_sync", fd);
    out("dsp.tone.close=%s", TIMED(close(fd)));
  }
  msleep(500);
  // a tone in the default format, 8 kHz U8 mono, 0.5 s at 400 Hz
  if ((fd = DspOpen("dsp.tone_default", O_WRONLY)) >= 0) {
    size_t n = MakeTone(buf, 8000, 1, AFMT_U8, 400, 0.5);
    out("dsp.tone_default.write_%zu=%s", n, TIMED(write(fd, buf, n)));
    DspReport("dsp.tone_default.after_write", fd);
    out("dsp.tone_default.sync=%s", TIMED(ioctl(fd, SNDCTL_DSP_SYNC, 0)));
    close(fd);
  }
  msleep(500);
  // a short write, less than a fragment, closed without SYNC: close's wait
  if ((fd = DspOpen("dsp.short_close", O_WRONLY)) >= 0) {
    size_t n = MakeTone(buf, 8000, 1, AFMT_U8, 300, 0.1);
    out("dsp.short_close.write_%zu=%s", n, RC(write(fd, buf, n)));
    DspReport("dsp.short_close.after_write", fd);
    out("dsp.short_close.close=%s", TIMED(close(fd)));
  }
  msleep(500);
  // O_NONBLOCK: a write larger than the buffer, then RESET
  if ((fd = DspOpen("dsp.nonblock", O_WRONLY | O_NONBLOCK)) >= 0) {
    SetInt("dsp.nonblock", "setfmt", fd, SNDCTL_DSP_SETFMT, AFMT_S16_LE);
    SetInt("dsp.nonblock", "channels", fd, SNDCTL_DSP_CHANNELS, 2);
    SetInt("dsp.nonblock", "speed", fd, SNDCTL_DSP_SPEED, 44100);
    memset(buf, 0, sizeof(buf));
    out("dsp.nonblock.write_4MiB=%s", TIMED(write(fd, buf, sizeof(buf))));
    out("dsp.nonblock.write_again=%s", RC(write(fd, buf, 4096)));
    DspReport("dsp.nonblock.after_write", fd);
    {
      struct pollfd pf = {fd, POLLOUT, 0};
      errno = 0;
      rc = poll(&pf, 1, 0);
      out("dsp.nonblock.poll_full=%s revents 0x%x", rc_text(rc, errno), pf.revents);
    }
    out("dsp.nonblock.reset=%s", RC(ioctl(fd, SNDCTL_DSP_RESET, 0)));
    DspReport("dsp.nonblock.after_reset", fd);
    out("dsp.nonblock.close=%s", TIMED(close(fd)));
  }
}

// ------------------------------------------------------------------ mixer

static void SectionMixer(void) {
  static const char *kNames[] = SOUND_DEVICE_NAMES;
  static const char *kLabels[] = SOUND_DEVICE_LABELS;
  int fd, rc, v, i, devmask = 0, saved_volume = -1, saved_pcm = -1;
  mixer_info info;
  if ((fd = open("/dev/mixer", O_RDWR)) < 0) {
    out("mixer.open=-1 %s", en(errno));
    return;
  }
  out("mixer.open=0");
  memset(&info, 0, sizeof(info));
  errno = 0;
  rc = ioctl(fd, SOUND_MIXER_INFO, &info);
  out("mixer.info=%s id \"%s\" name \"%s\" modify_counter %d", rc_text(rc, errno),
      printable((unsigned char *)info.id, strnlen(info.id, 16)),
      printable((unsigned char *)info.name, strnlen(info.name, 32)), info.modify_counter);
  {
    _old_mixer_info old;
    memset(&old, 0, sizeof(old));
    errno = 0;
    rc = ioctl(fd, SOUND_OLD_MIXER_INFO, &old);
    out("mixer.old_info=%s id \"%s\" name \"%s\"", rc_text(rc, errno),
        printable((unsigned char *)old.id, strnlen(old.id, 16)),
        printable((unsigned char *)old.name, strnlen(old.name, 32)));
  }
  v = 0;
  errno = 0;
  rc = ioctl(fd, OSS_GETVERSION, &v);
  out("mixer.oss_getversion=%s 0x%x", rc_text(rc, errno), v);
  {
    static const struct {
      const char *name;
      unsigned long request;
    } kMasks[] = {{"devmask", SOUND_MIXER_READ_DEVMASK},
                  {"recmask", SOUND_MIXER_READ_RECMASK},
                  {"stereodevs", SOUND_MIXER_READ_STEREODEVS},
                  {"caps", SOUND_MIXER_READ_CAPS},
                  {"recsrc", SOUND_MIXER_READ_RECSRC},
                  {"outsrc", SOUND_MIXER_READ_OUTSRC},
                  {"outmask", SOUND_MIXER_READ_OUTMASK}};
    for (i = 0; i < 7; ++i) {
      v = 0;
      errno = 0;
      rc = ioctl(fd, kMasks[i].request, &v);
      out("mixer.%s=%s 0x%x", kMasks[i].name, rc_text(rc, errno), v);
      if (i == 0 && rc == 0) devmask = v;
    }
  }
  for (i = 0; i < SOUND_MIXER_NRDEVICES; ++i) {
    v = 0;
    errno = 0;
    rc = ioctl(fd, MIXER_READ(i), &v);
    out("mixer.read[%02d]=%s 0x%04x left %d right %d name %s label \"%s\"%s", i,
        rc_text(rc, errno), v, v & 0xff, (v >> 8) & 0xff, kNames[i], kLabels[i],
        devmask >> i & 1 ? " in devmask" : "");
    if (i == SOUND_MIXER_VOLUME) saved_volume = v;
    if (i == SOUND_MIXER_PCM) saved_pcm = v;
  }
  for (i = SOUND_MIXER_NRDEVICES; i < 32; ++i) {
    v = 0;
    out("mixer.read[%02d]=%s", i, RC(ioctl(fd, MIXER_READ(i), &v)));
  }
  // writes and their read-back
  {
    static const struct {
      const char *name;
      int channel, value;
    } kWrites[] = {{"volume_50", SOUND_MIXER_VOLUME, 50 | 50 << 8},
                   {"volume_30_80", SOUND_MIXER_VOLUME, 30 | 80 << 8},
                   {"volume_101_200", SOUND_MIXER_VOLUME, 101 | 200 << 8},
                   {"volume_1", SOUND_MIXER_VOLUME, 1 | 1 << 8},
                   {"volume_0", SOUND_MIXER_VOLUME, 0},
                   {"volume_73", SOUND_MIXER_VOLUME, 73 | 73 << 8},
                   {"volume_74", SOUND_MIXER_VOLUME, 74 | 74 << 8},
                   {"pcm_40", SOUND_MIXER_PCM, 40 | 40 << 8},
                   {"pcm_40_90", SOUND_MIXER_PCM, 40 | 90 << 8},
                   {"line_60", SOUND_MIXER_LINE, 60 | 60 << 8},
                   {"igain_50", SOUND_MIXER_IGAIN, 50 | 50 << 8},
                   {"bass_25", SOUND_MIXER_BASS, 25 | 25 << 8}};
    for (i = 0; i < (int)(sizeof(kWrites) / sizeof(kWrites[0])); ++i) {
      int w = kWrites[i].value, r = 0, rc2;
      mixer_info after;
      errno = 0;
      rc = ioctl(fd, MIXER_WRITE(kWrites[i].channel), &w);
      const char *wr = rc_text(rc, errno);
      errno = 0;
      rc2 = ioctl(fd, MIXER_READ(kWrites[i].channel), &r);
      memset(&after, 0, sizeof(after));
      ioctl(fd, SOUND_MIXER_INFO, &after);
      out("mixer.write.%s=%s wrote 0x%04x back 0x%04x read %s 0x%04x modify_counter %d",
          kWrites[i].name, wr, kWrites[i].value, w, rc_text(rc2, errno), r,
          after.modify_counter);
      if (!strcmp(kWrites[i].name, "volume_30_80") || !strcmp(kWrites[i].name, "volume_50")) {
        char cmd[128], key[64];
        snprintf(key, sizeof(key), "mixer.write.%s.amixer", kWrites[i].name);
        fflush(stdout);
        snprintf(cmd, sizeof(cmd),
                 "amixer -c 0 cget name='Master Playback Volume' | sed 's/^/%s=/'", key);
        if (system(cmd)) out("%s=failed", key);
      }
    }
  }
  out("mixer.unknown_M28_read=%s", RC(ioctl(fd, _IOR('M', 40, int), &v)));
  out("mixer.unknown_M28_write=%s", RC(ioctl(fd, _IOWR('M', 40, int), &v)));
  out("mixer.unknown_M7f=%s", RC(ioctl(fd, _IO('M', 0x7f), 0)));
  out("mixer.unknown_Z01=%s", RC(ioctl(fd, _IO('Z', 0x01), 0)));
  out("mixer.unknown_P0b=%s", RC(ioctl(fd, SNDCTL_DSP_GETFMTS, &v)));
  {
    char b[4];
    out("mixer.read_bytes=%s", RC(read(fd, b, 4)));
    out("mixer.write_bytes=%s", RC(write(fd, b, 4)));
  }
  v = 0;
  out("mixer.write_recsrc_0=%s", RC(ioctl(fd, SOUND_MIXER_WRITE_RECSRC, &v)));
  // put back what the guest had
  if (saved_volume >= 0) ioctl(fd, MIXER_WRITE(SOUND_MIXER_VOLUME), &saved_volume);
  if (saved_pcm >= 0) ioctl(fd, MIXER_WRITE(SOUND_MIXER_PCM), &saved_pcm);
  close(fd);
  // the mixer through /dev/dsp
  if ((fd = open("/dev/dsp", O_WRONLY)) >= 0) {
    v = 0;
    errno = 0;
    rc = ioctl(fd, SOUND_MIXER_READ_VOLUME, &v);
    out("mixer.via_dsp.read_volume=%s 0x%04x", rc_text(rc, errno), v);
    v = 0;
    errno = 0;
    rc = ioctl(fd, SOUND_MIXER_READ_DEVMASK, &v);
    out("mixer.via_dsp.devmask=%s 0x%x", rc_text(rc, errno), v);
    close(fd);
  } else {
    out("mixer.via_dsp.open=-1 %s", en(errno));
  }
}

// ------------------------------------------------------------------ midi

static void MidiInfo(const char *key, int fd, int stream) {
  struct snd_rawmidi_info info;
  int rc;
  memset(&info, 0, sizeof(info));
  info.stream = stream;
  errno = 0;
  rc = ioctl(fd, SNDRV_RAWMIDI_IOCTL_INFO, &info);
  if (rc < 0) {
    out("%s.info_%s=-1 %s", key, stream ? "input" : "output", en(errno));
    return;
  }
  out("%s.info_%s=0 device %u subdevice %u stream %d card %d flags 0x%x id \"%s\" name \"%s\" "
      "subname \"%s\" subdevices_count %u subdevices_avail %u tied_device %d",
      key, stream ? "input" : "output", info.device, info.subdevice, info.stream, info.card,
      info.flags, printable(info.id, strnlen((char *)info.id, 64)),
      printable(info.name, strnlen((char *)info.name, 80)),
      printable(info.subname, strnlen((char *)info.subname, 32)), info.subdevices_count,
      info.subdevices_avail, info.tied_device);
}

static void MidiStatus(const char *key, int fd, int stream) {
  struct snd_rawmidi_status st;
  int rc;
  memset(&st, 0, sizeof(st));
  st.stream = stream;
  errno = 0;
  rc = ioctl(fd, SNDRV_RAWMIDI_IOCTL_STATUS, &st);
  if (rc < 0) {
    out("%s.status_%s=-1 %s", key, stream ? "input" : "output", en(errno));
    return;
  }
  out("%s.status_%s=0 avail %zu xruns %zu tstamp_zero %s", key, stream ? "input" : "output",
      st.avail, st.xruns, st.tstamp.tv_sec || st.tstamp.tv_nsec ? "no" : "yes");
}

static void SectionMidi(void) {
  static const char *kPaths[] = {"/dev/snd/midiC1D0", "/dev/snd/midiC1D1",
                                 "/dev/snd/midiC1D2", "/dev/snd/midiC1D3",
                                 "/dev/midi1", "/dev/amidi1", "/dev/dmmidi1",
                                 "/dev/admmidi1", "/dev/midi00", "/dev/midi", 0};
  static const struct {
    const char *name;
    int flags;
  } kModes[] = {{"wronly", O_WRONLY},
                {"rdonly", O_RDONLY},
                {"rdwr", O_RDWR},
                {"wronly_nonblock", O_WRONLY | O_NONBLOCK},
                {"wronly_append", O_WRONLY | O_APPEND},
                {"wronly_append_nonblock", O_WRONLY | O_APPEND | O_NONBLOCK},
                {"rdwr_nonblock", O_RDWR | O_NONBLOCK}};
  char key[128];
  int i, j, fd, rc, v;
  for (i = 0; kPaths[i]; ++i) {
    snprintf(key, sizeof(key), "midi.%s", kPaths[i]);
    for (j = 0; j < (int)(sizeof(kModes) / sizeof(kModes[0])); ++j) {
      fd = open(kPaths[i], kModes[j].flags);
      out("%s.open_%s=%s", key, kModes[j].name, fd < 0 ? rc_text(-1, errno) : "0");
      if (fd >= 0) close(fd);
    }
    if ((fd = open(kPaths[i], O_RDWR | O_NONBLOCK)) < 0 &&
        (fd = open(kPaths[i], O_WRONLY | O_NONBLOCK)) < 0) {
      continue;
    }
    v = 0;
    errno = 0;
    rc = ioctl(fd, SNDRV_RAWMIDI_IOCTL_PVERSION, &v);
    out("%s.pversion=%s 0x%x", key, rc_text(rc, errno), v);
    MidiInfo(key, fd, SNDRV_RAWMIDI_STREAM_OUTPUT);
    MidiInfo(key, fd, SNDRV_RAWMIDI_STREAM_INPUT);
    MidiStatus(key, fd, SNDRV_RAWMIDI_STREAM_OUTPUT);
    MidiStatus(key, fd, SNDRV_RAWMIDI_STREAM_INPUT);
    out("%s.unknown_W7f=%s", key, RC(ioctl(fd, _IO('W', 0x7f), 0)));
    out("%s.unknown_Z01=%s", key, RC(ioctl(fd, _IO('Z', 0x01), 0)));
    {
      char b[16];
      struct pollfd pf = {fd, POLLIN | POLLOUT, 0};
      out("%s.read_nonblock=%s", key, RC(read(fd, b, sizeof(b))));
      errno = 0;
      rc = poll(&pf, 1, 0);
      out("%s.poll=%s revents 0x%x", key, rc_text(rc, errno), pf.revents);
    }
    close(fd);
  }
  // a note on the first port and one on OSS's /dev/midi1, which FluidSynth
  // plays on the USB card (C5 then E5, piano)
  if ((fd = open("/dev/snd/midiC1D0", O_WRONLY)) >= 0) {
    unsigned char on[] = {0xc0, 0x00, 0x90, 72, 100}, off[] = {0x80, 72, 0};
    out("midi.note.on=%s", TIMED(write(fd, on, sizeof(on))));
    MidiStatus("midi.note.after_on", fd, SNDRV_RAWMIDI_STREAM_OUTPUT);
    msleep(800);
    out("midi.note.off=%s", RC(write(fd, off, sizeof(off))));
    v = SNDRV_RAWMIDI_STREAM_OUTPUT;
    out("midi.note.drain=%s", TIMED(ioctl(fd, SNDRV_RAWMIDI_IOCTL_DRAIN, &v)));
    close(fd);
  }
  msleep(600);
  if ((fd = open("/dev/midi1", O_WRONLY)) >= 0) {
    unsigned char on[] = {0x90, 76, 100}, off[] = {0x80, 76, 0};
    out("midi.oss_note.on=%s", RC(write(fd, on, sizeof(on))));
    msleep(800);
    out("midi.oss_note.off=%s", RC(write(fd, off, sizeof(off))));
    close(fd);
  }
  msleep(600);
  // pacing: 9,000 bytes of note-offs in one blocking write, then 8 KiB at
  // once without blocking
  if ((fd = open("/dev/snd/midiC1D0", O_WRONLY)) >= 0) {
    static unsigned char bytes[9000];
    for (i = 0; i < 9000; i += 3) bytes[i] = 0x80, bytes[i + 1] = 60, bytes[i + 2] = 0;
    out("midi.pacing.write_9000=%s", TIMED(write(fd, bytes, 9000)));
    MidiStatus("midi.pacing.after_write", fd, SNDRV_RAWMIDI_STREAM_OUTPUT);
    close(fd);
  }
  if ((fd = open("/dev/snd/midiC1D0", O_WRONLY | O_NONBLOCK)) >= 0) {
    static unsigned char bytes[8192];
    for (i = 0; i < 8190; i += 3) bytes[i] = 0x80, bytes[i + 1] = 61, bytes[i + 2] = 0;
    bytes[8190] = bytes[8191] = 0;
    out("midi.pacing.nonblock_write_8192=%s", TIMED(write(fd, bytes, 8190)));
    close(fd);
  }
  // with nobody connected: FluidSynth's connection gone, where do bytes go
  dump_file("midi.proc.card1.midi0", "/proc/asound/card1/midi0");
  dump_file("midi.proc.seq.clients", "/proc/asound/seq/clients");
}

// ------------------------------------------------------------------ speaker

static int FindByName(const char *name) {
  int numbers[32], n, i;
  n = EventNumbers(numbers, 32);
  for (i = 0; i < n; ++i) {
    char path[64], buf[256] = {0};
    int fd;
    snprintf(path, sizeof(path), "/dev/input/event%d", numbers[i]);
    if ((fd = open(path, O_RDONLY | O_NONBLOCK)) < 0) continue;
    ioctl(fd, EVIOCGNAME(sizeof(buf) - 1), buf);
    close(fd);
    if (!strcmp(buf, name)) return numbers[i];
  }
  return -1;
}

static int speaker_reader;
static double speaker_start;

static void DrainReader(const char *when) {
  struct input_event ev[64];
  ssize_t got, j;
  int k = 0;
  while ((got = read(speaker_reader, ev, sizeof(ev))) > 0) {
    for (j = 0; j < got / (ssize_t)sizeof(ev[0]); ++j) {
      out("speaker.%s.read[%d]=%s", when, k++, EventText(ev + j));
    }
  }
  if (!k) out("speaker.%s.read=nothing", when);
}

static void Mark(const char *what) {
  out("speaker.mark.%s=+%.3f s", what, now_mono() - speaker_start);
}

static void SndEvent(int fd, int code, int value, const char *what) {
  struct input_event ev[2];
  memset(ev, 0, sizeof(ev));
  ev[0].type = EV_SND, ev[0].code = code, ev[0].value = value;
  ev[1].type = EV_SYN, ev[1].code = SYN_REPORT, ev[1].value = 0;
  Mark(what);
  out("speaker.%s=%s", what, RC(write(fd, ev, sizeof(ev))));
}

static void SpeakerState(int fd, const char *when) {
  unsigned long bits[1] = {0};
  int rc;
  errno = 0;
  rc = ioctl(fd, EVIOCGSND(sizeof(bits)), bits);
  out("speaker.%s.snd_state=%s bits %s", when, rc_text(rc, errno), BitList(bits, SND_MAX));
}

static void SectionSpeaker(void) {
  int n = FindByName("PC Speaker"), fd, tty, rc;
  char path[64];
  speaker_start = now_mono();
  out("speaker.event=%d", n);
  if (n < 0) return;
  snprintf(path, sizeof(path), "/dev/input/event%d", n);
  speaker_reader = open(path, O_RDONLY | O_NONBLOCK);
  if ((fd = open(path, O_WRONLY)) < 0) {
    out("speaker.open_wronly=-1 %s", en(errno));
    return;
  }
  // SND_TONE 440 for 0.6 s, SND_BELL 1 for 0.6 s
  SndEvent(fd, SND_TONE, 440, "tone_440");
  SpeakerState(fd, "tone_440");
  msleep(600);
  SndEvent(fd, SND_TONE, 0, "tone_0");
  SpeakerState(fd, "tone_0");
  DrainReader("tone");
  msleep(400);
  SndEvent(fd, SND_BELL, 1, "bell_1");
  SpeakerState(fd, "bell_1");
  msleep(600);
  SndEvent(fd, SND_BELL, 0, "bell_0");
  SpeakerState(fd, "bell_0");
  DrainReader("bell");
  msleep(400);
  // SND_TONE 20 and 32767, outside what sounds: what the state says
  SndEvent(fd, SND_TONE, 20, "tone_20");
  SpeakerState(fd, "tone_20");
  SndEvent(fd, SND_TONE, 32767, "tone_32767");
  SpeakerState(fd, "tone_32767");
  SndEvent(fd, SND_TONE, 0, "tone_0_again");
  DrainReader("limits");
  // a write that is not EV_SND
  {
    struct input_event ev = {.type = EV_KEY, .code = KEY_A, .value = 1};
    out("speaker.write_key=%s", RC(write(fd, &ev, sizeof(ev))));
    DrainReader("write_key");
  }
  close(fd);
  msleep(400);
  // /dev/tty0's KIOCSOUND (880 Hz, 0.6 s) and KDMKTONE (660 Hz, 400 ms)
  if ((tty = open("/dev/tty0", O_WRONLY | O_NOCTTY)) < 0) {
    out("speaker.tty0.open=-1 %s", en(errno));
  } else {
    struct termios t;
    char cc[256];
    int i, n = 0;
    out("speaker.tty0.open=0");
    out("speaker.tty0.isatty=%d", isatty(tty));
    errno = 0;
    rc = tcgetattr(tty, &t);
    out("speaker.tty0.tcgetattr=%s iflag 0%o oflag 0%o cflag 0%o lflag 0%o", rc_text(rc, errno),
        rc ? 0 : t.c_iflag, rc ? 0 : t.c_oflag, rc ? 0 : t.c_cflag, rc ? 0 : t.c_lflag);
    if (!rc) {
      for (i = 0; i < 19; ++i) n += sprintf(cc + n, "%s%d", i ? " " : "", t.c_cc[i]);
      out("speaker.tty0.cc=%s", cc);
    }
    {
      int mode = -1;
      errno = 0;
      rc = ioctl(tty, KDGETMODE, &mode);
      out("speaker.tty0.kdgetmode=%s %d", rc_text(rc, errno), mode);
      int kb = -1;
      errno = 0;
      rc = ioctl(tty, KDGKBMODE, &kb);
      out("speaker.tty0.kdgkbmode=%s %d", rc_text(rc, errno), kb);
      char leds = -1;
      errno = 0;
      rc = ioctl(tty, KDGETLED, &leds);
      out("speaker.tty0.kdgetled=%s %d", rc_text(rc, errno), leds);
      errno = 0;
      rc = ioctl(tty, KDGKBLED, &leds);
      out("speaker.tty0.kdgkbled=%s %d", rc_text(rc, errno), leds);
      struct vt_stat vs;
      memset(&vs, 0, sizeof(vs));
      vs.v_signal = 0x5a5a;
      errno = 0;
      rc = ioctl(tty, VT_GETSTATE, &vs);
      out("speaker.tty0.vt_getstate=%s active %u", rc_text(rc, errno), vs.v_active);
      out("speaker.tty0.vt_getstate.signal_state=0x%x 0x%x", vs.v_signal, vs.v_state);
      // the console's modes set and read back, then put back
      out("speaker.tty0.kdsetmode_graphics=%s", RC(ioctl(tty, KDSETMODE, KD_GRAPHICS)));
      mode = -1;
      ioctl(tty, KDGETMODE, &mode);
      out("speaker.tty0.kdgetmode_after=%d", mode);
      out("speaker.tty0.kdsetmode_5=%s", RC(ioctl(tty, KDSETMODE, 5)));
      out("speaker.tty0.kdsetmode_text1=%s", RC(ioctl(tty, KDSETMODE, KD_TEXT1)));
      mode = -1;
      ioctl(tty, KDGETMODE, &mode);
      out("speaker.tty0.kdgetmode_after_text1=%d", mode);
      out("speaker.tty0.kdskbmode_xlate=%s", RC(ioctl(tty, KDSKBMODE, K_XLATE)));
      kb = -1;
      ioctl(tty, KDGKBMODE, &kb);
      out("speaker.tty0.kdgkbmode_after=%d", kb);
      out("speaker.tty0.kdskbmode_9=%s", RC(ioctl(tty, KDSKBMODE, 9)));
      out("speaker.tty0.kdskbmode_unicode=%s", RC(ioctl(tty, KDSKBMODE, K_UNICODE)));
    }
    Mark("kiocsound_880");
    out("speaker.tty0.kiocsound_880=%s", RC(ioctl(tty, KIOCSOUND, 1193182 / 880)));
    SpeakerState(speaker_reader, "kiocsound_880");
    DrainReader("kiocsound_on");
    msleep(600);
    Mark("kiocsound_0");
    out("speaker.tty0.kiocsound_0=%s", RC(ioctl(tty, KIOCSOUND, 0)));
    SpeakerState(speaker_reader, "kiocsound_0");
    DrainReader("kiocsound_off");
    msleep(400);
    Mark("kdmktone_660_400ms");
    out("speaker.tty0.kdmktone_660_400ms=%s", RC(ioctl(tty, KDMKTONE, (400 << 16) | (1193182 / 660))));
    SpeakerState(speaker_reader, "kdmktone_on");
    DrainReader("kdmktone_on");
    msleep(800);
    SpeakerState(speaker_reader, "kdmktone_after");
    DrainReader("kdmktone_after");
    // what kd_mksound() left in the packet, which no SYN_REPORT closed
    if ((fd = open(path, O_WRONLY)) >= 0) {
      struct input_event syn = {.type = EV_SYN, .code = SYN_REPORT, .value = 0};
      out("speaker.syn_report=%s", RC(write(fd, &syn, sizeof(syn))));
      DrainReader("after_syn_report");
      close(fd);
    }
    out("speaker.tty0.write=%s", RC(write(tty, "x", 1)));
    close(tty);
  }
  close(speaker_reader);
}

// ------------------------------------------------------------------ console

static void DescribeTty(const char *key, int fd) {
  struct termios t;
  struct winsize ws;
  int rc, i, mode = -1;
  char cc[256];
  int n = 0;
  out("%s.isatty=%d", key, isatty(fd));
  // the kernel's struct termios is shorter than glibc's: TCGETS for the
  // answer, tcgetattr() for the fields, and the kernel's 19 characters
  errno = 0;
  rc = ioctl(fd, TCGETS, cc);
  out("%s.tcgets=%s", key, rc_text(rc, errno));
  if (tcgetattr(fd, &t) == 0) {
    for (i = 0; i < 19; ++i) n += sprintf(cc + n, "%s%d", i ? " " : "", t.c_cc[i]);
    out("%s.termios=iflag 0%o oflag 0%o cflag 0%o lflag 0%o line %d cbaud 0%o cc %s", key,
        t.c_iflag, t.c_oflag, t.c_cflag, t.c_lflag, t.c_line, t.c_cflag & CBAUD, cc);
  }
  memset(&ws, 0, sizeof(ws));
  errno = 0;
  rc = ioctl(fd, TIOCGWINSZ, &ws);
  out("%s.winsize=%s rows %u cols %u", key, rc_text(rc, errno), ws.ws_row, ws.ws_col);
  out("%s.kdsetmode_text=%s", key, RC(ioctl(fd, KDSETMODE, KD_TEXT)));
  out("%s.kdsetmode_graphics=%s", key, RC(ioctl(fd, KDSETMODE, KD_GRAPHICS)));
  errno = 0;
  rc = ioctl(fd, KDGETMODE, &mode);
  out("%s.kdgetmode=%s", key, rc_text(rc, errno));
  out("%s.kdskbmode_raw=%s", key, RC(ioctl(fd, KDSKBMODE, K_RAW)));
  out("%s.kiocsound_0=%s", key, RC(ioctl(fd, KIOCSOUND, 0)));
  out("%s.kdmktone_0=%s", key, RC(ioctl(fd, KDMKTONE, 0)));
  {
    struct vt_stat vs;
    out("%s.vt_getstate=%s", key, RC(ioctl(fd, VT_GETSTATE, &vs)));
  }
  out("%s.fbioget_vscreeninfo=%s", key, RC(ioctl(fd, FBIOGET_VSCREENINFO, cc)));
}

static void SectionConsole(void) {
  int fd;
  char *name = ttyname(0);
  out("console.stdin_ttyname=%s", name ? name : "none");
  DescribeTty("console.stdin", 0);
  if ((fd = open("/dev/ttyS0", O_RDWR | O_NOCTTY | O_NONBLOCK)) >= 0) {
    DescribeTty("console.ttyS0", fd);
    close(fd);
  } else {
    out("console.ttyS0.open=-1 %s", en(errno));
  }
  if ((fd = open("/dev/tty0", O_RDONLY | O_NOCTTY | O_NONBLOCK)) >= 0) {
    out("console.tty0.isatty=%d", isatty(fd));
    {
      char b[4];
      out("console.tty0.read=%s", RC(read(fd, b, 4)));
      struct pollfd pf = {fd, POLLIN | POLLOUT, 0};
      int rc;
      errno = 0;
      rc = poll(&pf, 1, 0);
      out("console.tty0.poll=%s revents 0x%x", rc_text(rc, errno), pf.revents);
    }
    close(fd);
  } else {
    out("console.tty0.open=-1 %s", en(errno));
  }
  dump_file("console.proc.tty.drivers", "/proc/tty/drivers");
}

// ------------------------------------------------------------------ main

int main(int argc, char **argv) {
  const char *section = 0;
  int i;
  setvbuf(stdout, 0, _IOLBF, 0);
  for (i = 1; i < argc; ++i) {
    if (!strncmp(argv[i], "--qemu=", 7)) {
      qemu = argv[i] + 7;
    } else if (!strncmp(argv[i], "--machine=", 10)) {
      machine = argv[i] + 10;
    } else {
      section = argv[i];
    }
  }
  if (!section) {
    fprintf(stderr, "usage: probe [--qemu=VERSION] [--machine=TYPE] SECTION\n");
    return 2;
  }
  out("section=%s", section);
  if (!strcmp(section, "system")) {
    SectionSystem();
  } else if (!strcmp(section, "nodes")) {
    SectionNodes();
  } else if (!strcmp(section, "input")) {
    SectionInput();
  } else if (!strcmp(section, "events")) {
    SectionEvents();
  } else if (!strcmp(section, "fb")) {
    SectionFb();
  } else if (!strcmp(section, "dsp-midi")) {
    SectionDspMidi();
  } else if (!strcmp(section, "dsp")) {
    SectionDsp();
  } else if (!strcmp(section, "mixer")) {
    SectionMixer();
  } else if (!strcmp(section, "midi")) {
    SectionMidi();
  } else if (!strcmp(section, "speaker")) {
    SectionSpeaker();
  } else if (!strcmp(section, "console")) {
    SectionConsole();
  } else {
    fprintf(stderr, "probe: no section %s\n", section);
    return 2;
  }
  out("section.end=%s", section);
  return 0;
}
