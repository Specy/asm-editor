/*
 * Sound, through the raw MIDI port of the machine's General MIDI synthesizer. A note is three
 * bytes written to the port; the synthesizer plays it at once. Notes that should start or stop
 * later wait in a small queue, which the main loop empties when their time comes, so a jingle never
 * holds the desktop up.
 */

static int midi_fd = -1;

typedef struct {
    long due;
    unsigned char bytes[3];
    int length;
} MidiLater;

enum { MIDI_QUEUE = 64 };
static MidiLater midi_queue[MIDI_QUEUE];
static int midi_queued;

void sound_init(void) { midi_fd = open("/dev/snd/midiC1D0", O_WRONLY); }

static void midi_send(const unsigned char *bytes, int length) {
    if (midi_fd >= 0) write(midi_fd, bytes, length);
}

static void midi_later(long delay, int status, int data1, int data2, int length) {
    unsigned char bytes[3] = { (unsigned char)status, (unsigned char)data1, (unsigned char)data2 };
    if (delay <= 0) {
        midi_send(bytes, length);
        return;
    }
    if (midi_queued == MIDI_QUEUE || midi_fd < 0) return;
    MidiLater *later = &midi_queue[midi_queued++];
    later->due = now_ms() + delay;
    later->bytes[0] = bytes[0];
    later->bytes[1] = bytes[1];
    later->bytes[2] = bytes[2];
    later->length = length;
}

void sound_program(int channel, int program) { midi_later(0, 0xc0 | channel, program, 0, 2); }
void sound_note(int channel, int note, int velocity) {
    midi_later(0, 0x90 | channel, note, velocity, 3);
}
void sound_off(int channel, int note) { midi_later(0, 0x80 | channel, note, 0, 3); }

/* A note that starts after `start` milliseconds and lasts `length`. */
static void sound_play(int channel, int note, int velocity, long start, long length) {
    midi_later(start, 0x90 | channel, note, velocity, 3);
    midi_later(start + length, 0x80 | channel, note, 0, 3);
}

/* Sends what is due; returns how long until the next queued message, or -1 for none. */
static int sound_run(void) {
    long now = now_ms(), next = -1;
    for (int i = 0; i < midi_queued;) {
        if (midi_queue[i].due <= now) {
            midi_send(midi_queue[i].bytes, midi_queue[i].length);
            midi_queue[i] = midi_queue[--midi_queued];
        } else {
            long wait = midi_queue[i].due - now;
            if (next < 0 || wait < next) next = wait;
            i++;
        }
    }
    return (int)next;
}

/* The start-up chime: a warm pad under a rising vibraphone arpeggio; falling at shut down. */
void sound_chime(int shutdown) {
    static const int rising[] = { 60, 64, 67, 71, 74, 79 };
    sound_program(0, 89);      /* Pad 2 (warm) */
    sound_program(1, 11);      /* Vibraphone */
    int root = shutdown ? 53 : 48;
    sound_play(0, root, 70, 0, 2200);
    sound_play(0, root + 7, 60, 0, 2200);
    sound_play(0, root + 16, 55, 0, 2200);
    for (int i = 0; i < 6; i++) {
        int note = shutdown ? rising[5 - i] - 2 : rising[i];
        sound_play(1, note, 90, i * 150, 1200);
    }
}

/* A short two-tone ding for something the desktop cannot do. */
void desktop_beep(void) {
    sound_program(2, 14);      /* Tubular bells */
    sound_play(2, 76, 70, 0, 300);
    sound_play(2, 72, 70, 120, 400);
}

void sound_click(void) {
    sound_program(3, 115);     /* Woodblock */
    sound_play(3, 84, 60, 0, 60);
}

/* An explosion on the drum channel: a bass drum and a crash cymbal. */
void sound_boom(void) {
    sound_play(9, 36, 127, 0, 400);
    sound_play(9, 35, 127, 30, 400);
    sound_play(9, 49, 110, 40, 1500);
    sound_play(9, 57, 100, 60, 1500);
}

static void sound_fanfare(void) {
    static const int notes[] = { 72, 76, 79, 84 };
    sound_program(4, 56);      /* Trumpet */
    for (int i = 0; i < 4; i++) sound_play(4, notes[i], 100, i * 130, i == 3 ? 600 : 120);
}
