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
