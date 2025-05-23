import { RISCV } from '@specy/risc-v'

const riscvIse = RISCV.getInstructionSet()

type RISCVAddressingMode = {
    type: string
    value: string
}

export type RISCVInstruction = {
    name: string
    args: RISCVAddressingMode[][]
    description: string
    example: string
    interactiveExample?: {
        code: string
    }
}

export const riscvInstructionsWithDuplicates = riscvIse.map((ins) => {
    return {
        name: ins.name,
        description: ins.description,
        example: ins.example,
        interactiveExample: {
            code: ins.example
        },
        args: ins.tokens.slice(1).map((t) => {
            return [
                {
                    type: t.type,
                    value: t.value
                }
            ] satisfies RISCVAddressingMode[]
        })
    } satisfies RISCVInstruction
})

export const riscvInstructionMap = new Map<string, RISCVInstruction[]>()
for (const ins of riscvInstructionsWithDuplicates) {
    if (riscvInstructionMap.has(ins.name)) {
        riscvInstructionMap.get(ins.name).push(ins)
    } else {
        riscvInstructionMap.set(ins.name, [ins])
    }
}

export function aggregateArgs(ins: RISCVInstruction[]): RISCVAddressingMode[][] {
    const args = new Array(Math.max(...ins.map((i) => i.args.length))).fill(
        undefined
    ) as RISCVAddressingMode[][]
    for (const i of ins) {
        i.args.forEach((a, idx) => {
            if (args[idx] === undefined) {
                args[idx] = []
            }
            for (const arg of a) {
                if (!args[idx].some((e) => e.type === arg.type)) {
                    args[idx].push(arg)
                }
            }
        })
    }
    return args
}

export const riscvInstructionsVariants = [...riscvInstructionMap.values()]

export const riscvInstructionNames = [...riscvInstructionMap.keys()]

export function formatAggregatedArgs(ins: RISCVInstruction[]): string {
    return aggregateArgs(ins)
        .map((a) => {
            const args = a.map((arg) => RISCVAddressingModes[arg.type].label)
            if (args.length > 1) {
                return `[{args.join('/')}]`
            } else {
                return args[0]
            }
        })
        .join(', ')
}

export const RISCVAddressingModes = {
    REGISTER_NAME: {
        detail: 't1',
        label: 'reg',
        insertText: '',
        documentation: 'Register name',
        priority: 1
    },
    INTEGER_16: {
        detail: '0',
        label: 'int16',
        documentation: '16 bit integer',
        priority: 2
    },
    INTEGER_16U: {
        detail: '0',
        label: 'int16u',
        documentation: 'Unsigned 16 bit integer',
        priority: 2
    },
    INTEGER_5: {
        detail: '0',
        label: 'int5',
        documentation: '5 bit integer',
        priority: 2
    },
    INTEGER_32: {
        detail: '0',
        label: 'int32',
        documentation: '32 bit integer',
        priority: 2
    },
    INTEGER_12: {
        detail: '0',
        label: 'int12',
        documentation: '12 bit integer',
        priority: 2
    },
    INTEGER_20: {
        detail: '0',
        label: 'int20',
        documentation: '20 bit integer',
        priority: 2
    },
    CSR_NAME: {
        detail: '',
        label: 'csr',
        documentation: 'Control and Status Register name',
        priority: 1
    },
    ROUNDING_MODE: {
        detail: '',
        label: 'rounding',
        documentation: 'Rounding mode',
        priority: 1
    },
    HI: {
        detail: '%hi',
        label: '%hi',
        documentation: 'Symbol address high part',
        priority: 1
    },
    LO: {
        detail: '%lo',
        label: '%lo',
        documentation: 'Symbol address low part',
        priority: 1
    },
    LEFT_PAREN: {
        detail: '(',
        label: '(',
        documentation: 'Left parenthesis',
        priority: 3
    },
    RIGHT_PAREN: {
        detail: ')',
        label: ')',
        documentation: 'Right parenthesis',
        priority: 3
    },
    IDENTIFIER: {
        detail: 'identifier',
        label: 'id',
        documentation: 'Identifier',
        priority: 4
    },
    REGISTER_NUMBER: {
        detail: '0',
        label: 'regnum',
        documentation: 'Register number',
        priority: 1
    },
    FP_REGISTER_NAME: {
        detail: 'f1',
        label: 'freg',
        insertText: 'f',
        documentation: 'Floating point register name',
        priority: 1
    },
    PLUS: {
        detail: '+',
        label: '+',
        documentation: 'Plus',
        priority: 3
    }
} as const

export const riscvDirectivesMap = {
    data: {
        name: 'data',
        description: 'Subsequent items stored in Data segment at next available address'
    },
    text: {
        name: 'text',
        description:
            'Subsequent items (instructions) stored in Text segment at next available address'
    },
    word: {
        name: 'word',
        description: 'Store the listed value(s) as 32 bit words on word boundary'
    },
    dword: {
        name: 'dword',
        description: 'Store the listed value(s) as 64 bit double-word on word boundary'
    },
    ascii: {
        name: 'ascii',
        description: 'Store the string in the Data segment but do not add null terminator'
    },
    asciz: {
        name: 'asciz',
        description: 'Store the string in the Data segment and add null terminator'
    },
    string: {
        name: 'string',
        description: 'Alias for .asciz'
    },
    byte: {
        name: 'byte',
        description: 'Store the listed value(s) as 8 bit bytes'
    },
    align: {
        name: 'align',
        description:
            'Align next data item on specified byte boundary (0=byte, 1=half, 2=word, 3=double)'
    },
    half: {
        name: 'half',
        description: 'Store the listed value(s) as 16 bit halfwords on halfword boundary'
    },
    space: {
        name: 'space',
        description: 'Reserve the next specified number of bytes in Data segment'
    },
    double: {
        name: 'double',
        description: 'Store the listed value(s) as double precision floating point'
    },
    float: {
        name: 'float',
        description: 'Store the listed value(s) as single precision floating point'
    },
    extern: {
        name: 'extern',
        description: 'Declare the listed label and byte length to be a global data field'
    },
    globl: {
        name: 'globl',
        description: 'Declare the listed label(s) as global to enable referencing from other files'
    },
    global: {
        name: 'global',
        description: 'Declare the listed label(s) as global to enable referencing from other files'
    },
    eqv: {
        name: 'eqv',
        description:
            'Substitute second operand for first. First operand is symbol, second operand is expression (like #define)'
    },
    macro: {
        name: 'macro',
        description: 'Begin macro definition.  See .end_macro'
    },
    end_macro: {
        name: 'end_macro',
        description: 'End macro definition.  See .macro'
    },
    include: {
        name: 'include',
        description: 'Insert the contents of the specified file.  Put filename in quotes.'
    },
    section: {
        name: 'section',
        description:
            'Allows specifying sections without .text or .data directives. Included for gcc comparability'
    }
}

export const riscvSyscall = {
    [1]: {
        name: 'print integer',
        code: 1,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: {}
    },
    [2]: {
        name: 'print float',
        code: 2,
        arguments: [{ name: 'f12', description: 'float to print' }],
        result: {}
    },
    [3]: {
        name: 'print double',
        code: 3,
        arguments: [{ name: 'f12', description: 'double to print' }],
        result: {}
    },
    [4]: {
        name: 'print string',
        code: 4,
        arguments: [{ name: 'a0', description: 'address of null-terminated string to print' }],
        result: {}
    },
    [5]: {
        name: 'read integer',
        code: 5,
        arguments: [],
        result: { arguments: [{ name: 'v0', description: 'contains integer read' }] }
    },
    [6]: {
        name: 'read float',
        code: 6,
        arguments: [],
        result: { arguments: [{ name: 'f0', description: 'contains float read' }] }
    },
    [7]: {
        name: 'read double',
        code: 7,
        arguments: [],
        result: { arguments: [{ name: 'f0', description: 'contains double read' }] }
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
        }
    },
    [9]: {
        name: 'sbrk (allocate heap memory)',
        code: 9,
        arguments: [{ name: 'a0', description: 'number of bytes to allocate' }],
        result: { arguments: [{ name: 'v0', description: 'contains address of allocated memory' }] }
    },
    [10]: {
        name: 'exit (terminate execution)',
        code: 10,
        arguments: [],
        result: {}
    },
    [11]: {
        name: 'print character',
        code: 11,
        arguments: [{ name: 'a0', description: 'character to print' }],
        result: {
            other: 'Service 11 - Prints ASCII character corresponding to contents of low-order byte.'
        }
    },
    [12]: {
        name: 'read character',
        code: 12,
        arguments: [],
        result: { arguments: [{ name: 'v0', description: 'contains character read' }] }
    },
    [17]: {
        name: 'Get cwd',
        code: 17,
        arguments: [], //TODO
        result: {}
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
                { name: 'v0', description: 'contains file descriptor (negative if error)' }
            ],
            other: 'Service 1024 - MARS implements three flag values: 0 for read-only, 1 for write-only with create, and 9 for write-only with create and append. It ignores mode. The returned file descriptor will be negative if the operation failed. MARS maintains file descriptors internally and allocates them starting with 3. File descriptors 0, 1 and 2 are always open for: reading from standard input, writing to standard output, and writing to standard error, respectively (new in release 4.3).'
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
                    name: 'v0',
                    description:
                        'contains number of characters read (0 if end-of-file, negative if error)'
                }
            ]
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
                    name: 'v0',
                    description: 'contains number of characters written (negative if error)'
                }
            ]
        }
    },
    [57]: {
        name: 'close file',
        code: 57,
        arguments: [{ name: 'a0', description: 'file descriptor' }],
        result: {}
    },
    [93]: {
        name: 'exit2 (terminate with value)',
        code: 93,
        arguments: [{ name: 'a0', description: 'termination result' }],
        result: {
            other: 'Service 93 - If the RISCV program is run under control of the MARS graphical interface (GUI), the exit code in a0 is ignored.'
        }
    },
    [30]: {
        name: 'time (system time)',
        code: 30,
        arguments: [],
        result: {
            arguments: [
                { name: 'a0', description: 'low order 32 bits of system time' },
                { name: 'a1', description: 'high order 32 bits of system time' }
            ],
            other: 'Service 30 - System time as milliseconds since 1 January 1970.'
        }
    },
    /*
[32]: {
        name: "sleep",
        code: 32,
        arguments: [{ name: "a0", description: "the length of time to sleep in milliseconds." }],
        result: { other: "Causes the MARS Java thread to sleep for (at least) the specified number of milliseconds. This timing will not be precise, as the Java implementation will add some overhead." }
    },

    */

    [34]: {
        name: 'print integer in hexadecimal',
        code: 34,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: {
            other: 'Displayed value is 8 hexadecimal digits, left-padding with zeroes if necessary.'
        }
    },
    [35]: {
        name: 'print integer in binary',
        code: 35,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: { other: 'Displayed value is 32 bits, left-padding with zeroes if necessary.' }
    },
    [36]: {
        name: 'print integer as unsigned',
        code: 36,
        arguments: [{ name: 'a0', description: 'integer to print' }],
        result: { other: 'Displayed as unsigned decimal value.' }
    },
    /*
        [40]: {
                name: "set seed",
                code: 40,
                arguments: [
                    { name: "a0", description: "i.d. of pseudorandom number generator (any int)" },
                    { name: "a1", description: "seed for corresponding pseudorandom number generator" }
                ],
                result: { other: "No values are returned. Sets the seed of the corresponding underlying Java pseudorandom number generator (java.util.Random). Each stream (identified by a0 contents) is modeled by a different Random object. There are no default seed values, so use the Set Seed service (40) if replicated random sequences are desired." }
            },
    */
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
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. There are no default seed values, so use the Set Seed service (40) if replicated random sequences are desired.'
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
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. There are no default seed values, so use the Set Seed service (40) if replicated random sequences are desired.'
        }
    },
    [43]: {
        name: 'random float',
        code: 43,
        arguments: [{ name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' }],
        result: {
            arguments: [
                {
                    name: 'f0',
                    description:
                        "contains the next pseudorandom, uniformly distributed float value in the range 0.0 <= f < 1.0 from this random number generator's sequence"
                }
            ],
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. There are no default seed values, so use the Set Seed service (40) if replicated random sequences are desired.'
        }
    },
    [44]: {
        name: 'random double',
        code: 44,
        arguments: [{ name: 'a0', description: 'i.d. of pseudorandom number generator (any int)' }],
        result: {
            arguments: [
                {
                    name: 'f0',
                    description:
                        "contains the next pseudorandom, uniformly distributed double value in the range 0.0 <= f < 1.0 from this random number generator's sequence"
                }
            ],
            other: 'Each stream (identified by a0 contents) is modeled by a different Random object. There are no default seed values, so use the Set Seed service (40) if replicated random sequences are desired.'
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
                { name: 'f0', description: 'contains double read' },
                {
                    name: 'a1',
                    description:
                        'contains status value\n0: OK status\n-1: input data cannot be correctly parsed\n-2: Cancel was chosen\n-3: OK was chosen but no data had been input into field'
                }
            ]
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
        result: {}
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
        result: {}
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
                name: 'f12',
                description: 'float value to display in string form after the first string'
            }
        ],
        result: {}
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
                name: 'f12',
                description: 'double value to display in string form after the first string'
            }
        ],
        result: {}
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
        result: {}
    }
} as Record<number, Syscall>

export interface SyscallArgument {
    name: string
    description: string
}

export interface SyscallResult {
    arguments?: SyscallArgument[] // Optional, as some syscalls have no result arguments
    other?: string // Optional, for additional notes
}

export interface Syscall {
    name: string
    code: number
    arguments: SyscallArgument[]
    result: SyscallResult
}
