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
            'Sets a Synth channel to a frequency in Hz and turns its gate on, starting a note when the gate was off.',
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
            "Turns a Synth channel's gate on, which starts its attack, or off, which starts its release.",
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
            "Copies length bytes of signed 8-bit samples from source into the Synth's Sample memory at offset, at once.",
        body: () =>
            [
                'SIM_SYNTH_UPLOAD32(SIM_SYNTH_UPLOAD_SOURCE) = (unsigned)(unsigned long)source;',
                'SIM_SYNTH_UPLOAD16(SIM_SYNTH_UPLOAD_LENGTH) = (unsigned short)length;',
                'SIM_SYNTH_UPLOAD16(SIM_SYNTH_UPLOAD_DESTINATION) = (unsigned short)offset;',
                'SIM_SYNTH_UPLOAD8(SIM_SYNTH_UPLOAD_START) = 1;'
            ].join('\n    ')
    }
]
