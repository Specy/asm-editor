/** Public helper declarations shared by the header renderer and source-help catalogs. */
export const DEVICE_HELPERS = [
    {
        name: 'sim_keyboard_ready',
        returns: { type: 'int' },
        parameters: [],
        summary: 'Returns nonzero if a typed character is waiting.',
        body: (devices, address, ready) =>
            `return (*${address(devices.receiverControl)} & ${ready}u) != 0;`,
        headerDoc: (devices, hex) =>
            `Whether a typed character is waiting: the Ready bit of the receiver control register, ${hex(devices.receiverControl)}.`
    },
    {
        name: 'sim_keyboard_read',
        returns: { type: 'int' },
        parameters: [],
        summary: 'Reads and removes the waiting character. Check sim_keyboard_ready first.',
        body: (devices, address) => `return (int)*${address(devices.receiverData)};`,
        headerDoc: (devices, hex) =>
            `The waiting character, from the receiver data register, ${hex(devices.receiverData)}: reading it takes it.`
    },
    {
        name: 'sim_display_ready',
        returns: { type: 'int' },
        parameters: [],
        summary: 'Returns nonzero if the Terminal can accept a character.',
        body: (devices, address, ready) =>
            `return (*${address(devices.transmitterControl)} & ${ready}u) != 0;`,
        headerDoc: (devices, hex) =>
            `Whether the console takes a character: the Ready bit of the transmitter control register, ${hex(devices.transmitterControl)}.`
    },
    {
        name: 'sim_display_write',
        returns: { type: 'void' },
        parameters: [{ type: 'int', name: 'character' }],
        summary: 'Prints a character in the Terminal. Character 12 clears the Terminal.',
        body: (devices, address) => `*${address(devices.transmitterData)} = (unsigned)character;`,
        headerDoc: (devices, hex) =>
            `Prints a character through the transmitter data register, ${hex(devices.transmitterData)}; 12, a form feed, clears the console.`
    }
]
/**
 * RISC-V's timer helpers, over RARS's Timer Tool registers: `time`, the milliseconds the program has
 * run, and `timecmp`, when the timer interrupts.
 */
export const RISCV_TIMER_HELPERS = [
    {
        name: 'sim_timer_now',
        returns: { type: 'unsigned long long' },
        parameters: [],
        summary:
            'Returns the timer register time: the milliseconds the program has run, from 0 at the start of the run, not counting time stopped at a breakpoint or between steps.',
        body: () =>
            [
                'unsigned high, low;',
                'do {',
                '    high = SIM_TIME_HIGH;',
                '    low = SIM_TIME_LOW;',
                '} while (high != SIM_TIME_HIGH);',
                'return ((unsigned long long)high << 32) | low;'
            ].join('\n    ')
    },
    {
        name: 'sim_timer_set',
        returns: { type: 'void' },
        parameters: [{ type: 'unsigned long long', name: 'when' }],
        summary:
            'Sets timecmp, arming the timer: once time reaches when, one timer interrupt is requested. Enable it with uie bit 4 and ustatus bit 0, and set utvec to the handler.',
        body: () =>
            [
                'SIM_TIMECMP_LOW = 0xffffffffu; /* never earlier than when, while the high word changes */',
                'SIM_TIMECMP_HIGH = (unsigned)(when >> 32);',
                'SIM_TIMECMP_LOW = (unsigned)when;'
            ].join('\n    ')
    }
]

/** MIPS's: coprocessor 0's Count and Compare, read and written with `mfc0` and `mtc0`. */
export const MIPS_TIMER_HELPERS = [
    {
        name: 'sim_cp0_count',
        returns: { type: 'unsigned' },
        parameters: [],
        summary:
            'Returns CP0 Count ($9), which goes up once every two instructions the program runs.',
        body: () =>
            'unsigned value;\n    __asm__ volatile("mfc0 %0, $9" : "=r"(value));\n    return value;'
    },
    {
        name: 'sim_cp0_set_count',
        returns: { type: 'void' },
        parameters: [{ type: 'unsigned', name: 'value' }],
        summary: 'Sets CP0 Count ($9), which counts on from value.',
        body: () => '__asm__ volatile("mtc0 %0, $9" : : "r"(value));'
    },
    {
        name: 'sim_cp0_compare',
        returns: { type: 'unsigned' },
        parameters: [],
        summary: 'Returns CP0 Compare ($11).',
        body: () =>
            'unsigned value;\n    __asm__ volatile("mfc0 %0, $11" : "=r"(value));\n    return value;'
    },
    {
        name: 'sim_cp0_set_compare',
        returns: { type: 'void' },
        parameters: [{ type: 'unsigned', name: 'value' }],
        summary:
            'Sets CP0 Compare ($11): the timer interrupt (Cause bit 15) is requested when Count becomes value. Writing it also clears a pending timer interrupt, and the first write turns the timer on.',
        body: () => '__asm__ volatile("mtc0 %0, $11" : : "r"(value));'
    }
]

export const RGB_HELPER = {
    name: 'sim_rgb',
    returns: { type: 'unsigned' },
    parameters: [
        { type: 'int', name: 'red' },
        { type: 'int', name: 'green' },
        { type: 'int', name: 'blue' }
    ],
    summary: 'Creates a Screen color from red, green and blue components, each from 0 to 255.'
}
export const SCREEN_MACRO = {
    name: 'SIM_SCREEN',
    parameters: ['name', 'width', 'height', 'unit'],
    summary:
        'Defines a global array of Screen cells and configures the Screen at Build. Use outside functions; each cell covers unit by unit pixels.'
}

/** `SIM_LINK`, which asks for the File defining a global the program never uses, as `ld -u` does. */
export const LINK_MACRO = {
    name: 'SIM_LINK',
    parameters: ['name'],
    summary:
        'Links the assembly File that defines the global name, which the program never calls, such as an exception handler. Use outside functions.'
}

/** The Synth's three helpers; everything else is a register a program writes through `SIM_SYNTH8` or `SIM_SYNTH16`. */
export const SYNTH_HELPERS = [
    {
        name: 'sim_synth_play',
        returns: { type: 'void' },
        parameters: [
            { type: 'int', name: 'channel' },
            { type: 'unsigned', name: 'hz' }
        ],
        summary:
            'Sets frequency in Hz and turns the gate on. If it is already on, turn it off first with sim_synth_gate(channel, 0) to start another attack.',
        body: () =>
            'SIM_SYNTH16(channel, SIM_SYNTH_FREQUENCY) = (unsigned short)hz;\n    SIM_SYNTH8(channel, SIM_SYNTH_CONTROL) |= SIM_SYNTH_GATE;'
    },
    {
        name: 'sim_synth_gate',
        returns: { type: 'void' },
        parameters: [
            { type: 'int', name: 'channel' },
            { type: 'int', name: 'on' }
        ],
        summary:
            "Changes a Synth channel's gate: off to on starts attack, on to off starts release. Keeping the same gate value does not retrigger.",
        body: () =>
            'unsigned char control = SIM_SYNTH8(channel, SIM_SYNTH_CONTROL);\n    SIM_SYNTH8(channel, SIM_SYNTH_CONTROL) =\n        (unsigned char)(on ? control | SIM_SYNTH_GATE : control & ~SIM_SYNTH_GATE);'
    },
    {
        name: 'sim_synth_upload',
        returns: { type: 'void' },
        parameters: [
            { type: 'const void *', name: 'source' },
            { type: 'unsigned', name: 'length' },
            { type: 'unsigned', name: 'offset' }
        ],
        summary:
            'Immediately copies signed 8-bit sample bytes from source into shared Sample memory at offset. Length 0 means 65,536 bytes; the destination wraps at 65,536.',
        body: () =>
            [
                'SIM_SYNTH_UPLOAD32(SIM_SYNTH_UPLOAD_SOURCE) = (unsigned)(unsigned long)source;',
                'SIM_SYNTH_UPLOAD16(SIM_SYNTH_UPLOAD_LENGTH) = (unsigned short)length;',
                'SIM_SYNTH_UPLOAD16(SIM_SYNTH_UPLOAD_DESTINATION) = (unsigned short)offset;',
                'SIM_SYNTH_UPLOAD8(SIM_SYNTH_UPLOAD_START) = 1;'
            ].join('\n    ')
    }
]

/**
 * The Input controller's helpers; everything else is a register or a field macro. The bodies use the
 * header's own macros, so they read the same registers a program reaches through `SIM_INPUT_*`.
 */
export const INPUT_HELPERS = [
    {
        name: 'sim_input_present',
        returns: { type: 'int' },
        parameters: [],
        summary:
            'Returns nonzero if the Input controller is there: its ID register reads "INP". In MARS and RARS it reads 0.',
        body: () => 'return (SIM_INPUT_ID >> 8) == 0x494e50u;'
    },
    {
        name: 'sim_input_pending',
        returns: { type: 'unsigned' },
        parameters: [],
        summary:
            'Returns how many events wait in the queue, from the Status register. Reading it takes nothing.',
        body: () => 'return SIM_INPUT_STATUS & 0x7fu;'
    },
    {
        name: 'sim_input_event',
        returns: { type: 'unsigned' },
        parameters: [],
        summary:
            'Takes the oldest event out of the queue and returns it, or 0 when the queue is empty. Read its fields with SIM_INPUT_KIND and SIM_INPUT_CODE.',
        body: () => 'return SIM_INPUT_EVENT;'
    },
    {
        name: 'sim_input_key_down',
        returns: { type: 'int' },
        parameters: [{ type: 'unsigned', name: 'usage' }],
        summary: 'Returns nonzero if the key with this HID usage, a SIM_KEY_ name, is held now.',
        body: () => 'return (int)((SIM_INPUT_KEYS[(usage & 0xffu) >> 3] >> (usage & 7u)) & 1u);'
    },
    {
        name: 'sim_input_pointer',
        returns: { type: 'unsigned' },
        parameters: [],
        summary:
            'Returns the pointer register: read it with SIM_INPUT_X, SIM_INPUT_Y and SIM_INPUT_BUTTONS.',
        body: () => 'return SIM_INPUT_POINTER;'
    }
]

/**
 * The MIDI port's helpers; everything else is a register. The bodies use the header's own macros,
 * so they read the same registers a program reaches through `SIM_MIDI_*`.
 */
export const MIDI_HELPERS = [
    {
        name: 'sim_midi_present',
        returns: { type: 'int' },
        parameters: [],
        summary:
            'Returns nonzero if the MIDI port is there: bit 7 of its Status register is always set. In MARS and RARS it reads 0.',
        body: () => 'return (SIM_MIDI_STATUS & SIM_MIDI_NO_INPUT) != 0;'
    },
    {
        name: 'sim_midi_write',
        returns: { type: 'void' },
        parameters: [{ type: 'unsigned', name: 'byte' }],
        summary:
            'Sends one MIDI byte, once the port can take it: waits while bit 6 of Status says the port is busy, as a byte written then would be dropped.',
        body: () =>
            'while (SIM_MIDI_STATUS & SIM_MIDI_BUSY) {\n    }\n    SIM_MIDI_DATA = byte & 0xffu;'
    }
]

/**
 * The sampled-audio output's helpers; everything else is a register. The bodies use the header's
 * own macros, so they read the same registers a program reaches through `SIM_PCM_*`.
 */
export const PCM_HELPERS = [
    {
        name: 'sim_pcm_present',
        returns: { type: 'int' },
        parameters: [],
        summary:
            'Returns nonzero if the sampled-audio output is there: its Rate register is never 0. In MARS and RARS it reads 0.',
        body: () => 'return SIM_PCM_RATE != 0;'
    },
    {
        name: 'sim_pcm_start',
        returns: { type: 'void' },
        parameters: [
            { type: 'unsigned', name: 'rate' },
            { type: 'int', name: 'stereo' }
        ],
        summary:
            'Sets the rate in samples a second, 4,000 to 48,000, and turns the output on, in stereo or in mono. Changing either while samples wait drops them.',
        body: () =>
            'SIM_PCM_RATE = rate;\n    SIM_PCM_CONTROL = SIM_PCM_ON | (stereo ? SIM_PCM_STEREO : 0u);'
    },
    {
        name: 'sim_pcm_free',
        returns: { type: 'unsigned' },
        parameters: [],
        summary:
            'Returns how many frames the FIFO can take now, from the Free register; in mono always even, as a word holds two.',
        body: () => 'return SIM_PCM_FREE;'
    },
    {
        name: 'sim_pcm_write',
        returns: { type: 'void' },
        parameters: [
            { type: 'int', name: 'first' },
            { type: 'int', name: 'second' }
        ],
        summary:
            'Writes two samples, -32768 to 32767, once the FIFO has room for them: in mono two in a row, in stereo the left and the right of one frame.',
        body: () =>
            'while (SIM_PCM_FREE == 0) {\n    }\n    SIM_PCM_DATA = ((unsigned)first & 0xffffu) | ((unsigned)second << 16);'
    }
]
