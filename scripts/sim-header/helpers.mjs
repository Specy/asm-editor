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
