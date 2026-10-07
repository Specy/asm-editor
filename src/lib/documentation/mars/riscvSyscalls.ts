import type { MarsSyscall } from './syscallBinding'

/**
 * The RARS services of RISC-V and RISC-V-64, as their Documentation shows them and `<sim.h>` calls
 * them. Free of the Core, so build scripts read it with plain Node. These bindings follow the RARS
 * 4.0.0 Core APIs, including service 40 and the Project-root GetCWD service.
 */
export const riscvSyscalls: Record<number, MarsSyscall> = {
    [1]: {
        name: 'print integer',
        code: 1,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_print_int',
            parameters: [{ name: 'value', type: 'int', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [2]: {
        name: 'print float',
        code: 2,
        arguments: [{ name: 'fa0', description: 'float to print' }],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_print_float',
            parameters: [{ name: 'value', type: 'float', register: 'fa0' }],
            returns: { type: 'void' }
        }
    },
    [3]: {
        name: 'print double',
        code: 3,
        arguments: [{ name: 'fa0', description: 'double to print' }],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_print_double',
            parameters: [{ name: 'value', type: 'double', register: 'fa0' }],
            returns: { type: 'void' }
        }
    },
    [4]: {
        name: 'print string',
        code: 4,
        arguments: [{ name: 'a0', description: 'address of null-terminated string to print' }],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_print_string',
            parameters: [{ name: 'text', type: 'const char *', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [5]: {
        name: 'read integer',
        code: 5,
        arguments: [],
        result: { arguments: [{ name: 'a0', description: 'contains integer read' }] },
        implemented: true,
        binding: {
            name: 'sim_read_int',
            parameters: [],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [6]: {
        name: 'read float',
        code: 6,
        arguments: [],
        result: { arguments: [{ name: 'fa0', description: 'contains float read' }] },
        implemented: true,
        binding: {
            name: 'sim_read_float',
            parameters: [],
            returns: { type: 'float', register: 'fa0' }
        }
    },
    [7]: {
        name: 'read double',
        code: 7,
        arguments: [],
        result: { arguments: [{ name: 'fa0', description: 'contains double read' }] },
        implemented: true,
        binding: {
            name: 'sim_read_double',
            parameters: [],
            returns: { type: 'double', register: 'fa0' }
        }
    },
    [8]: {
        name: 'read string',
        code: 8,
        arguments: [
            { name: 'a0', description: 'address of input buffer' },
            { name: 'a1', description: 'maximum number of characters to read' }
        ],
        result: {
            other: "Service 8 - Follows semantics of UNIX 'fgets'. For specified length n, string can be no longer than n-1. If less than that, adds newline to end. In either case, then pads with null byte If n = 1, input is ignored and null byte placed at buffer address. If n < 1, input is ignored and nothing is written to the buffer."
        },
        implemented: true,
        binding: {
            name: 'sim_read_string',
            parameters: [
                { name: 'buffer', type: 'char *', register: 'a0' },
                { name: 'size', type: 'int', register: 'a1' }
            ],
            returns: { type: 'void' }
        }
    },
    [9]: {
        name: 'sbrk (allocate heap memory)',
        code: 9,
        arguments: [{ name: 'a0', description: 'number of bytes to allocate' }],
        result: {
            arguments: [{ name: 'a0', description: 'contains address of allocated memory' }]
        },
        implemented: true,
        binding: {
            name: 'sim_sbrk',
            parameters: [{ name: 'bytes', type: 'int', register: 'a0' }],
            returns: { type: 'void *', register: 'a0' }
        }
    },
    [10]: {
        name: 'exit (terminate execution)',
        code: 10,
        arguments: [],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_exit',
            parameters: [],
            returns: { type: 'void' },
            noreturn: true
        }
    },
    [11]: {
        name: 'print character',
        code: 11,
        arguments: [{ name: 'a0', description: 'character to print' }],
        result: {
            other: 'Service 11 - Prints ASCII character corresponding to contents of low-order byte.'
        },
        implemented: true,
        binding: {
            name: 'sim_print_char',
            parameters: [{ name: 'character', type: 'int', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [12]: {
        name: 'read character',
        code: 12,
        arguments: [],
        result: { arguments: [{ name: 'a0', description: 'contains character read' }] },
        implemented: true,
        binding: {
            name: 'sim_read_char',
            parameters: [],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [17]: {
        name: 'Get cwd',
        code: 17,
        arguments: [
            { name: 'a0', description: 'address of the buffer to write the path into' },
            { name: 'a1', description: 'length of the buffer' }
        ],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description:
                        'contains -1 if the path and its terminating null do not fit in the buffer, and is left unchanged otherwise'
                }
            ],
            other: 'Writes /, the Project root, followed by a null byte. The minimum buffer size is 2.'
        },
        implemented: true,
        binding: {
            name: 'sim_get_cwd',
            parameters: [
                { name: 'buffer', type: 'char *', register: 'a0' },
                { name: 'size', type: 'int', register: 'a1' }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [1024]: {
        name: 'open file',
        code: 1024,
        arguments: [
            { name: 'a0', description: 'address of null-terminated string containing filename' },
            { name: 'a1', description: 'flags' },
            { name: 'a2', description: 'mode' }
        ],
        result: {
            arguments: [
                { name: 'a0', description: 'contains file descriptor (negative if error)' }
            ],
            other: 'Service 1024 - MARS implements three flag values: 0 for read-only, 1 for write-only with create, and 9 for write-only with create and append. It ignores mode. The returned file descriptor will be negative if the operation failed. MARS maintains file descriptors internally and allocates them starting with 3. File descriptors 0, 1 and 2 are always open for: reading from standard input, writing to standard output, and writing to standard error, respectively (new in release 4.3).'
        },
        implemented: true,
        binding: {
            name: 'sim_open',
            parameters: [
                { name: 'path', type: 'const char *', register: 'a0' },
                { name: 'flags', type: 'int', register: 'a1' },
                { name: 'mode', type: 'int', register: 'a2' }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [63]: {
        name: 'read from file',
        code: 63,
        arguments: [
            { name: 'a0', description: 'file descriptor' },
            { name: 'a1', description: 'address of input buffer' },
            { name: 'a2', description: 'maximum number of characters to read' }
        ],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description:
                        'contains number of characters read (0 if end-of-file, negative if error)'
                }
            ]
        },
        implemented: true,
        binding: {
            name: 'sim_read',
            parameters: [
                { name: 'fd', type: 'int', register: 'a0' },
                { name: 'buffer', type: 'void *', register: 'a1' },
                { name: 'length', type: 'int', register: 'a2' }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [64]: {
        name: 'write to file',
        code: 64,
        arguments: [
            { name: 'a0', description: 'file descriptor' },
            { name: 'a1', description: 'address of output buffer' },
            { name: 'a2', description: 'number of characters to write' }
        ],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description: 'contains number of characters written (negative if error)'
                }
            ]
        },
        implemented: true,
        binding: {
            name: 'sim_write',
            parameters: [
                { name: 'fd', type: 'int', register: 'a0' },
                { name: 'buffer', type: 'const void *', register: 'a1' },
                { name: 'length', type: 'int', register: 'a2' }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [57]: {
        name: 'close file',
        code: 57,
        arguments: [{ name: 'a0', description: 'file descriptor' }],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_close',
            parameters: [{ name: 'fd', type: 'int', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [62]: {
        name: 'lseek (move file position)',
        code: 62,
        arguments: [
            { name: 'a0', description: 'file descriptor' },
            { name: 'a1', description: 'offset in bytes' },
            {
                name: 'a2',
                description:
                    'where the offset counts from: 0 the start of the file, 1 the current position, 2 the end of the file'
            }
        ],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description:
                        'contains the new position, counted from the beginning of the file (-1 if error)'
                }
            ],
            other: 'Service 62 - Descriptors 0, 1 and 2 cannot seek.'
        },
        implemented: true,
        binding: {
            name: 'sim_lseek',
            parameters: [
                { name: 'fd', type: 'int', register: 'a0' },
                { name: 'offset', type: 'int', register: 'a1' },
                { name: 'whence', type: 'int', register: 'a2' }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [93]: {
        name: 'exit2 (terminate with value)',
        code: 93,
        arguments: [{ name: 'a0', description: 'termination result' }],
        result: {
            other: 'Service 93 - Ends the program with the signed exit code in a0. The editor shows this code in the Log, while the RARS graphical interface ignores it.'
        },
        implemented: true,
        binding: {
            name: 'sim_exit2',
            parameters: [{ name: 'code', type: 'int', register: 'a0' }],
            returns: { type: 'void' },
            noreturn: true
        }
    },
    [30]: {
        name: 'time (program time)',
        code: 30,
        arguments: [],
        result: {
            arguments: [
                { name: 'a0', description: 'low order 32 bits of the program time' },
                { name: 'a1', description: 'high order 32 bits of the program time' }
            ],
            other: 'Service 30 - Milliseconds since the run started, rather than since 1 January 1970 as in RARS: it is the time the program can observe passing, and in a testcase it comes from a virtual clock that starts at zero and only advances through the waits of service 32.'
        },
        implemented: true,
        binding: {
            name: 'sim_time',
            parameters: [],
            returns: { type: 'long long', low: 'a0', high: 'a1' }
        }
    },
    [32]: {
        name: 'sleep',
        code: 32,
        arguments: [{ name: 'a0', description: 'the length of time to sleep in milliseconds' }],
        result: {
            other: 'Service 32 - Lets that much program time pass before the next instruction. The editor stays responsive while it waits and the wait costs no instructions, so a program idling on the keyboard never reaches the execution limit; in a testcase it completes at once and advances the virtual clock instead.'
        },
        implemented: true,
        binding: {
            name: 'sim_sleep',
            parameters: [{ name: 'milliseconds', type: 'int', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [34]: {
        name: 'print integer in hexadecimal',
        code: 34,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: {
            other: 'Displayed value is 8 hexadecimal digits, left-padding with zeroes if necessary.'
        },
        implemented: true,
        binding: {
            name: 'sim_print_hex',
            parameters: [{ name: 'value', type: 'int', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [35]: {
        name: 'print integer in binary',
        code: 35,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: { other: 'Displayed value is 32 bits, left-padding with zeroes if necessary.' },
        implemented: true,
        binding: {
            name: 'sim_print_binary',
            parameters: [{ name: 'value', type: 'int', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [36]: {
        name: 'print integer as unsigned',
        code: 36,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: { other: 'Displayed as unsigned decimal value.' },
        implemented: true,
        binding: {
            name: 'sim_print_unsigned',
            parameters: [{ name: 'value', type: 'unsigned', register: 'a0' }],
            returns: { type: 'void' }
        }
    },
    [40]: {
        name: 'set seed',
        code: 40,
        arguments: [
            { name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' },
            { name: 'a1', description: 'seed for corresponding pseudorandom number generator' }
        ],
        result: {
            other: 'No values are returned. Sets the seed of the corresponding underlying Java pseudorandom number generator (java.util.Random). Each stream (identified by a0 contents) is modeled by a different Random object. An unseeded stream starts from host randomness in an interactive run and a fixed per-generator seed in a Testcase. Service 40 supplies an explicit seed in either run mode. Sequences match java.util.Random on JDK 21; Undo restores the stream before a draw or reseed.'
        },
        implemented: true,
        binding: {
            name: 'sim_random_seed',
            parameters: [
                { name: 'generator', type: 'int', register: 'a0' },
                { name: 'seed', type: 'int', register: 'a1' }
            ],
            returns: { type: 'void' }
        }
    },
    [41]: {
        name: 'random int',
        code: 41,
        arguments: [{ name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' }],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description:
                        "contains the next pseudorandom, uniformly distributed int value from this random number generator's sequence"
                }
            ],
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. An unseeded stream starts from host randomness in an interactive run and a fixed per-generator seed in a Testcase. Service 40 supplies an explicit seed in either run mode. Sequences match java.util.Random on JDK 21; Undo restores the stream before a draw or reseed.'
        },
        implemented: true,
        binding: {
            name: 'sim_random_int',
            parameters: [{ name: 'generator', type: 'int', register: 'a0' }],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [42]: {
        name: 'random int range',
        code: 42,
        arguments: [
            { name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' },
            { name: 'a1', description: 'upper bound of range of returned values' }
        ],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description:
                        "contains pseudorandom, uniformly distributed int value in the range 0 <= [int] < [upper bound], drawn from this random number generator's sequence"
                }
            ],
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. An unseeded stream starts from host randomness in an interactive run and a fixed per-generator seed in a Testcase. Service 40 supplies an explicit seed in either run mode. Sequences match java.util.Random on JDK 21; Undo restores the stream before a draw or reseed.'
        },
        implemented: true,
        binding: {
            name: 'sim_random_int_range',
            parameters: [
                { name: 'generator', type: 'int', register: 'a0' },
                { name: 'bound', type: 'int', register: 'a1' }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [43]: {
        name: 'random float',
        code: 43,
        arguments: [{ name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' }],
        result: {
            arguments: [
                {
                    name: 'fa0',
                    description:
                        "contains the next pseudorandom, uniformly distributed float value in the range 0.0 <= f < 1.0 from this random number generator's sequence"
                }
            ],
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. An unseeded stream starts from host randomness in an interactive run and a fixed per-generator seed in a Testcase. Service 40 supplies an explicit seed in either run mode. Sequences match java.util.Random on JDK 21; Undo restores the stream before a draw or reseed.'
        },
        implemented: true,
        binding: {
            name: 'sim_random_float',
            parameters: [{ name: 'generator', type: 'int', register: 'a0' }],
            returns: { type: 'float', register: 'fa0' }
        }
    },
    [44]: {
        name: 'random double',
        code: 44,
        arguments: [{ name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' }],
        result: {
            arguments: [
                {
                    name: 'fa0',
                    description:
                        "contains the next pseudorandom, uniformly distributed double value in the range 0.0 <= f < 1.0 from this random number generator's sequence"
                }
            ],
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. An unseeded stream starts from host randomness in an interactive run and a fixed per-generator seed in a Testcase. Service 40 supplies an explicit seed in either run mode. Sequences match java.util.Random on JDK 21; Undo restores the stream before a draw or reseed.'
        },
        implemented: true,
        binding: {
            name: 'sim_random_double',
            parameters: [{ name: 'generator', type: 'int', register: 'a0' }],
            returns: { type: 'double', register: 'fa0' }
        }
    },
    [50]: {
        name: 'ConfirmDialog',
        code: 50,
        arguments: [
            {
                name: 'a0',
                description: 'address of null-terminated string that is the message to user'
            }
        ],
        result: {
            arguments: [
                {
                    name: 'a0',
                    description: 'contains value of user-chosen option\n0: Yes\n1: No\n2: Cancel'
                }
            ]
        },
        implemented: true,
        binding: {
            name: 'sim_confirm_dialog',
            parameters: [{ name: 'message', type: 'const char *', register: 'a0' }],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [51]: {
        name: 'InputDialogInt',
        code: 51,
        arguments: [
            {
                name: 'a0',
                description: 'address of null-terminated string that is the message to user'
            }
        ],
        result: {
            arguments: [
                { name: 'a0', description: 'contains int read' },
                {
                    name: 'a1',
                    description:
                        'contains status value\n0: OK status\n-1: input data cannot be correctly parsed\n-2: Cancel was chosen\n-3: OK was chosen but no data had been input into field'
                }
            ]
        },
        implemented: true,
        binding: {
            name: 'sim_input_dialog_int',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'status', type: 'int *', register: 'a1', out: true }
            ],
            returns: { type: 'int', register: 'a0' }
        }
    },
    [52]: {
        name: 'InputDialogFloat',
        code: 52,
        arguments: [
            {
                name: 'a0',
                description: 'address of null-terminated string that is the message to user'
            }
        ],
        result: {
            arguments: [
                { name: 'f0', description: 'contains float read' },
                {
                    name: 'a1',
                    description:
                        'contains status value\n0: OK status\n-1: input data cannot be correctly parsed\n-2: Cancel was chosen\n-3: OK was chosen but no data had been input into field'
                }
            ]
        },
        implemented: true,
        binding: {
            name: 'sim_input_dialog_float',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'status', type: 'int *', register: 'a1', out: true }
            ],
            // f0, not fa0: RARS 1.6 returns this float there, unlike every other service
            returns: { type: 'float', register: 'f0' }
        }
    },
    [53]: {
        name: 'InputDialogDouble',
        code: 53,
        arguments: [
            {
                name: 'a0',
                description: 'address of null-terminated string that is the message to user'
            }
        ],
        result: {
            arguments: [
                { name: 'fa0', description: 'contains double read' },
                {
                    name: 'a1',
                    description:
                        'contains status value\n0: OK status\n-1: input data cannot be correctly parsed\n-2: Cancel was chosen\n-3: OK was chosen but no data had been input into field'
                }
            ]
        },
        implemented: true,
        binding: {
            name: 'sim_input_dialog_double',
            parameters: [
                // RARS 1.6, and @specy/risc-v up to 3.7.0, read the message from x4 (tp) instead
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'status', type: 'int *', register: 'a1', out: true }
            ],
            returns: { type: 'double', register: 'fa0' },
            // RARS zeroes f0 before it writes the double to fa0
            clobbers: ['f0']
        }
    },
    [54]: {
        name: 'InputDialogString',
        code: 54,
        arguments: [
            {
                name: 'a0',
                description: 'address of null-terminated string that is the message to user'
            },
            { name: 'a1', description: 'address of input buffer' },
            { name: 'a2', description: 'maximum number of characters to read' }
        ],
        result: {
            arguments: [
                {
                    name: 'a1',
                    description:
                        'contains status value\n0: OK status. Buffer contains the input string.\n-2: Cancel was chosen. No change to buffer.\n-3: OK was chosen but no data had been input into field. No change to buffer.\n-4: length of the input string exceeded the specified maximum. Buffer contains the maximum allowable input string plus a terminating null.'
                }
            ],
            other: 'See Service 8 note below table'
        },
        implemented: true,
        binding: {
            name: 'sim_input_dialog_string',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'buffer', type: 'char *', register: 'a1' },
                { name: 'size', type: 'int', register: 'a2' }
            ],
            returns: { type: 'int', register: 'a1' }
        }
    },
    [55]: {
        name: 'MessageDialog',
        code: 55,
        arguments: [
            {
                name: 'a0',
                description: 'address of null-terminated string that is the message to user'
            },
            {
                name: 'a1',
                description:
                    'the type of message to be displayed:\n0: error message, indicated by Error icon\n1: information message, indicated by Information icon\n2: warning message, indicated by Warning icon\n3: question message, indicated by Question icon\nother: plain message (no icon displayed)'
            }
        ],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_message_dialog',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'type', type: 'int', register: 'a1' }
            ],
            returns: { type: 'void' }
        }
    },
    [56]: {
        name: 'MessageDialogInt',
        code: 56,
        arguments: [
            {
                name: 'a0',
                description:
                    'address of null-terminated string that is an information-type message to user'
            },
            {
                name: 'a1',
                description: 'int value to display in string form after the first string'
            }
        ],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_message_dialog_int',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'value', type: 'int', register: 'a1' }
            ],
            returns: { type: 'void' }
        }
    },
    [60]: {
        name: 'MessageDialogFloat',
        code: 60,
        arguments: [
            {
                name: 'a0',
                description:
                    'address of null-terminated string that is an information-type message to user'
            },
            {
                name: 'fa1',
                description: 'float value to display in string form after the first string'
            }
        ],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_message_dialog_float',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'value', type: 'float', register: 'fa1' }
            ],
            returns: { type: 'void' }
        }
    },
    [58]: {
        name: 'MessageDialogDouble',
        code: 58,
        arguments: [
            {
                name: 'a0',
                description:
                    'address of null-terminated string that is an information-type message to user'
            },
            {
                name: 'fa0',
                description: 'double value to display in string form after the first string'
            }
        ],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_message_dialog_double',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'value', type: 'double', register: 'fa0' }
            ],
            returns: { type: 'void' }
        }
    },
    [59]: {
        name: 'MessageDialogString',
        code: 59,
        arguments: [
            {
                name: 'a0',
                description:
                    'address of null-terminated string that is an information-type message to user'
            },
            {
                name: 'a1',
                description: 'address of null-terminated string to display after the first string'
            }
        ],
        result: {},
        implemented: true,
        binding: {
            name: 'sim_message_dialog_string',
            parameters: [
                { name: 'message', type: 'const char *', register: 'a0' },
                { name: 'text', type: 'const char *', register: 'a1' }
            ],
            returns: { type: 'void' }
        }
    }
}
