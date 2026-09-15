import { RISCV } from '@specy/risc-v'

const previousTargetWas64Bit = RISCV.is64Bit()
RISCV.setIs64Bit(true)
const riscvIse = RISCV.getInstructionSet().map((i) => ({
    name: i.name,
    description: `${i.description}${i.getIsRv64Only() ? ' (64bit)' : ''}`,
    tokens: i.tokens,
    example: i.example,
    isRv64Only: i.getIsRv64Only()
}))
RISCV.setIs64Bit(previousTargetWas64Bit)

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
    isRv64Only: boolean
}

type RISCVInstructionVariants = [RISCVInstruction, ...RISCVInstruction[]]

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

export const riscvInstructionsWithDuplicates = riscvIse.map((ins) => {
    return {
        name: ins.name,
        description: ins.description,
        example: ins.example.trim(),
        interactiveExample: {
            code: ins.example.trim()
        },
        args: ins.tokens.slice(1).map((t) => {
            return [
                {
                    type: t.type,
                    value: t.value
                }
            ] satisfies RISCVAddressingMode[]
        }),
        isRv64Only: ins.isRv64Only
    } satisfies RISCVInstruction
})

export const riscvInstructionMap = new Map<string, RISCVInstructionVariants>()
for (const ins of riscvInstructionsWithDuplicates) {
    const variants = riscvInstructionMap.get(ins.name)
    if (variants) {
        variants.push(ins)
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

export const riscvInstructionEntries = [...riscvInstructionMap.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
)

export const riscvInstructionNames = riscvInstructionEntries.map(([name]) => name)

export function riscvVariantOperands(variant: RISCVInstruction): string[] {
    const isReg = (s: string) => s === 'reg' || s === 'freg' || s === 'regnum'

    function getLabel(type: string): string {
        if (type.startsWith('INTEGER')) return 'imm'
        return hasOwnKey(RISCVAddressingModes, type) ? RISCVAddressingModes[type].label : type
    }

    const tokens = variant.args.map((a) => a[0])
    if (tokens.length === 0) return []

    const operands: string[] = []
    let parts: string[] = []

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]
        const label = getLabel(t.type)

        if (t.type === 'LEFT_PAREN') {
            const last = parts[parts.length - 1]
            if (parts.length > 0 && !isReg(last)) {
                parts.push('(')
            } else {
                if (parts.length > 0) operands.push(parts.join(''))
                parts = ['(']
            }
        } else if (t.type === 'RIGHT_PAREN') {
            parts.push(')')
            operands.push(parts.join(''))
            parts = []
        } else if (t.type === 'PLUS') {
            parts.push('+')
        } else {
            const prevType = i > 0 ? tokens[i - 1].type : null
            if (parts.length > 0 && prevType !== 'LEFT_PAREN' && prevType !== 'PLUS') {
                operands.push(parts.join(''))
                parts = []
            }
            parts.push(label)
        }
    }
    if (parts.length > 0) operands.push(parts.join(''))
    return operands
}

export function formatAggregatedArgs(ins: RISCVInstruction[]): string {
    const allOps = ins.map(riscvVariantOperands)
    const maxLen = Math.max(...allOps.map((o) => o.length))
    const result: string[] = []

    for (let pos = 0; pos < maxLen; pos++) {
        const values = [...new Set(allOps.map((o) => o[pos]).filter(Boolean))]
        if (values.length <= 1) {
            result.push(values[0] ?? '')
        } else {
            result.push(`[${values.join(' / ')}]`)
        }
    }

    return result.join(', ')
}

export function groupVariantsByDescription(
    variants: RISCVInstruction[]
): { description: string; examples: string[] }[] {
    const groups: { description: string; examples: string[] }[] = []
    const map = new Map<string, number>()
    for (const v of variants) {
        const idx = map.get(v.description)
        if (idx !== undefined) {
            groups[idx].examples.push(v.example)
        } else {
            map.set(v.description, groups.length)
            groups.push({ description: v.description, examples: [v.example] })
        }
    }
    return groups
}

export const RISCVAddressingModes = {
    REGISTER_NAME: {
        detail: 't1',
        label: 'reg',
        insertText: 't0',
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
    INTEGER_6: {
        detail: '0',
        label: 'int6',
        documentation: '6 bit integer',
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
    INTEGER_64: {
        detail: '0',
        label: 'int64',
        documentation: '64 bit integer',
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
    },
    bss: {
        name: 'bss',
        description: 'Subsequent items stored in the Data segment, which starts out zeroed'
    },
    sbss: {
        name: 'sbss',
        description: 'Alias for .bss'
    },
    zero: {
        name: 'zero',
        description:
            'Reserve the next specified number of bytes, which read as zero. Alias for .space'
    },
    comm: {
        name: 'comm',
        description:
            'Reserve the given number of bytes for a global symbol, the way a C compiler declares an uninitialized global variable. Takes a symbol, a size in bytes and an optional alignment'
    },
    lcomm: {
        name: 'lcomm',
        description:
            'Reserve the given number of bytes for a symbol local to this file, the way a C compiler declares an uninitialized static variable'
    },
    p2align: {
        name: 'p2align',
        description: 'Align next data item on a 2^n byte boundary. Alias for .align'
    },
    balign: {
        name: 'balign',
        description:
            'Align next data item on the given byte boundary, written directly rather than as a power of two'
    },
    '2byte': {
        name: '2byte',
        description: 'Alias for .half'
    },
    '4byte': {
        name: '4byte',
        description: 'Alias for .word'
    },
    '8byte': {
        name: '8byte',
        description: 'Alias for .dword'
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
        name: 'time (program time)',
        code: 30,
        arguments: [],
        result: {
            arguments: [
                { name: 'a0', description: 'low order 32 bits of the program time' },
                { name: 'a1', description: 'high order 32 bits of the program time' }
            ],
            other: 'Service 30 - Milliseconds since the run started, rather than since 1 January 1970 as in RARS: it is the time the program can observe passing, and in a testcase it comes from a virtual clock that starts at zero and only advances through the waits of service 32.'
        }
    },
    [32]: {
        name: 'sleep',
        code: 32,
        arguments: [{ name: 'a0', description: 'the length of time to sleep in milliseconds' }],
        result: {
            other: 'Service 32 - Lets that much program time pass before the next instruction. The editor stays responsive while it waits and the wait costs no instructions, so a program idling on the keyboard never reaches the execution limit; in a testcase it completes at once and advances the virtual clock instead.'
        }
    },

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

export type RISCVRegisterDoc = {
    /** The name, or the range of names, the panel and the assembler spell the registers with. */
    name: string
    /** The register number behind the name, or the address in the case of a CSR. */
    number: string
    description: string
}

/**
 * One of the register files the simulator holds, in the order the registers panel offers its tabs.
 * Registers are grouped by the role their ABI name announces rather than listed one entry per
 * number, because the role is what a reader has to learn: to the hardware the general registers are
 * all the same register.
 */
export type RISCVRegisterFileDoc = {
    /**
     * The anchor of the section on the page. For the files beyond the CPU one it is also the id
     * of the tab the registers panel shows them under.
     */
    id: string
    title: string
    /** Markdown, shown once above the registers of the file. */
    intro: string
    registers: RISCVRegisterDoc[]
}

export const riscvRegisterFiles: RISCVRegisterFileDoc[] = [
    {
        id: 'general-registers',
        title: 'General purpose registers',
        intro: 'RISC-V has 32 general purpose registers, and with one exception the hardware treats them all alike: `x0` reads as zero whatever is written to it, and the other 31 are plain 32 bit words, or 64 bit on the RV64 target. Everything else is convention, written down in the ABI and followed by every program that means to call another one.\n\nEach register has a number and a name, and the assembler accepts both: `addi t0, zero, 1` and `addi x5, x0, 1` assemble to the same instruction. The names are what the panel shows and what a program should use, because the name says what the register is for. The convention divides them into registers a called function may destroy, the temporaries and the arguments, and registers it has to give back unchanged, the saved ones.',
        registers: [
            {
                name: 'zero',
                number: 'x0',
                description:
                    'Always reads as **0**, and writing to it is silently ignored. It is not a wasted register: having a guaranteed zero is what lets one instruction do the work of many, so `mv a0, a1` is really `add a0, zero, a1`, `beqz t0, label` is `beq t0, zero, label`, and a store of a constant zero needs no register loaded first.'
            },
            {
                name: 'ra',
                number: 'x1',
                description:
                    '**Return address**. `jal` and `jalr` write the address of the following instruction here before jumping, and a function returns by executing `ret`, which is `jalr zero, ra, 0`. A function that calls another one has to save `ra` on the stack first, because the inner call overwrites it.'
            },
            {
                name: 'sp',
                number: 'x2',
                description:
                    '**Stack pointer**, pointing at the lowest used word of the stack. A function makes room by subtracting from it on entry and gives the room back by adding the same amount before returning. The ABI expects it to stay aligned to 16 bytes at every call.'
            },
            {
                name: 'gp',
                number: 'x3',
                description:
                    '**Global pointer**. It is set up once before the program starts and never changed, so that a global variable near it can be reached in a single instruction with a signed 12 bit offset instead of the two an arbitrary address needs.'
            },
            {
                name: 'tp',
                number: 'x4',
                description:
                    '**Thread pointer**, the base of the storage private to the running thread. A program here has one thread and no use for it, but the ABI reserves it, so nothing else should be kept in it.'
            },
            {
                name: 't0 - t2',
                number: 'x5 - x7',
                description:
                    '**Temporaries**. A called function may overwrite them freely, so a caller that still needs a value after the call has to save it, or keep it in a saved register instead.'
            },
            {
                name: 's0, also written fp',
                number: 'x8',
                description:
                    'The first **saved register**, and by convention the **frame pointer**: the fixed handle on the current stack frame for functions whose stack pointer moves while they run. The assembler accepts both spellings for the same register.'
            },
            {
                name: 's1',
                number: 'x9',
                description:
                    'A **saved register**. A function that uses it must put back the value it found, which is what makes it the right place for anything that has to survive a call.'
            },
            {
                name: 'a0 - a1',
                number: 'x10 - x11',
                description:
                    'The first two **arguments** of a call, and the registers a result comes back in: `a0` carries a single return value and `a1` the second half of a pair. The environment calls that this simulator implements also take their argument in `a0` and leave their result there.'
            },
            {
                name: 'a2 - a7',
                number: 'x12 - x17',
                description:
                    'Six more **argument** registers; anything beyond the eighth argument is passed on the stack. `a7` has a second job here: it holds the number of the environment call `ecall` is about to make.'
            },
            {
                name: 's2 - s11',
                number: 'x18 - x27',
                description:
                    'Ten more **saved registers**, preserved across calls by whoever uses them. A loop whose body calls a function keeps its counter in one of these.'
            },
            {
                name: 't3 - t6',
                number: 'x28 - x31',
                description:
                    'Four more **temporaries**, with the same rule as `t0` to `t2`: free to use, gone after a call.'
            }
        ]
    },
    {
        id: 'fpu',
        title: 'Floating point registers',
        intro: 'The floating point extension adds 32 registers of its own, `f0` to `f31`, with the same kind of ABI names as the general ones. They are a separate file: no arithmetic instruction reads one of each, and a value crosses over only through an explicit instruction. `fcvt.s.w ft0, t0` converts the integer in a general register into a single precision number, `fcvt.w.s t0, ft0` converts back, and `fmv.x.w` copies the raw **bits** of a floating point register into an integer one while `fmv.w.x` copies them back, neither of them converting anything. The older spellings `fmv.x.s` and `fmv.s.x` assemble to the same two instructions. A comparison is the other place the two files meet: `feq.s`, `flt.s` and `fle.s` test two floating point registers and write 1 or 0 into a general register, so a floating point comparison reaches a branch through `bnez` or `beqz` rather than through a flag of its own.\n\nEvery register here is 64 bits wide, on both the 32 and the 64 bit targets, because that is what a double needs. A single precision value is stored **NaN-boxed**: it occupies the low 32 bits and the upper 32 are all ones, a pattern that reads as a NaN if a double instruction looks at it. That is deliberate, and it is why the panel shows NaN in the single format for a register holding a genuine double: it is the same protection, running the other way. `fadd.s` adds singles and `fadd.d` doubles, `flw` and `fsw` load and store a single, `fld` and `fsd` a double, and `fcvt.d.s` widens a single into a double when the two have to meet.',
        registers: [
            {
                name: 'ft0 - ft7',
                number: 'f0 - f7',
                description:
                    'Floating point **temporaries**, destroyed by a call like the integer ones. The first eight registers of the file, which is why an example that needs one register usually reaches for `ft0`.'
            },
            {
                name: 'fs0 - fs1',
                number: 'f8 - f9',
                description:
                    'The first two floating point **saved registers**, preserved across calls by the function that uses them.'
            },
            {
                name: 'fa0 - fa7',
                number: 'f10 - f17',
                description:
                    'The floating point **arguments** of a call, and in `fa0` the floating point return value. They sit beside the integer argument registers rather than counting against them, so a function taking an integer and a double is passed `a0` and `fa0`.'
            },
            {
                name: 'fs2 - fs11',
                number: 'f18 - f27',
                description:
                    'Ten more floating point **saved registers**. Note that the ABI names run out of order against the numbers: `fs2` is `f18`, well after `fa7`. The reason is the compressed encoding, the 16 bit form of the instruction set that this simulator does not assemble but that the ABI was written around: an instruction that short has only three bits for a register, which reaches `f8` to `f15` and no further, so the ABI put the registers a program uses most there, `fs0`, `fs1` and `fa0` to `fa5`, and the saved registers that were left over landed at `f18` and above.'
            },
            {
                name: 'ft8 - ft11',
                number: 'f28 - f31',
                description:
                    'Four more floating point **temporaries**, closing the file. They follow the same rule as `ft0` to `ft7`, and as `t3` to `t6` on the integer side: free to use, and gone after a call.'
            }
        ]
    },
    {
        id: 'csr',
        title: 'Control and status registers',
        intro: 'The control and status registers are the machine talking about itself: how the floating point unit is rounding, why an exception happened, how many instructions have run. They are not addressed like the other registers. `csrr t0, fcsr` reads one into a general register and `csrw t0, fcsr` writes it back: the general register comes **first** in both of them and the control register second. Each is a short form of one of the `csrr*` instructions, which read the old value and write a new one in a single step: `csrr` is `csrrs` with `zero` as the value to set, so nothing is written, and `csrw` is `csrrw` with `zero` as the destination, so the old value is thrown away. The forms that take a constant instead of a register, `csrwi` and `csrsi`, are the exception to the order and name the control register first, as in `csrsi ustatus, 1`.\n\nThis simulator implements the seventeen registers below, the user level subset. On the 32 bit target a counter that needs 64 bits is read as two registers, the name for the low half and the name ending in `h` for the high half; on RV64 the plain name holds all of it.',
        registers: [
            {
                name: 'ustatus',
                number: '0x000',
                description:
                    'The user status register. Only two bits of it are writable here: the one that enables user level interrupts, and the one that remembers whether they were enabled before the current handler was entered, so that `uret` can put things back as it found them. Entering a handler copies the first into the second and clears the first, which is why a handler is not interrupted by the thing it is handling.'
            },
            {
                name: 'fflags',
                number: '0x001',
                description:
                    'The five floating point exception flags: invalid operation, divide by zero, overflow, underflow and inexact. Arithmetic sets them and nothing clears them, so they say what has happened since the program started, or since it last wrote a zero here. This is not a separate register but the low five bits of `fcsr` under their own name.'
            },
            {
                name: 'frm',
                number: '0x002',
                description:
                    'The rounding mode the floating point instructions use when they are not given one: round to nearest with ties to even by default, with truncation and the two directed roundings selectable. Like `fflags`, it is a window onto `fcsr`, bits 5 to 7.'
            },
            {
                name: 'fcsr',
                number: '0x003',
                description:
                    'The floating point control and status register, which is the two registers above in one place: `fflags` is its low five bits and `frm` the three above them. Writing it writes both, which is how a program resets the flags and chooses a rounding mode in a single instruction.'
            },
            {
                name: 'uie',
                number: '0x004',
                description:
                    'Which user level interrupts are enabled, one bit per source. An interrupt is delivered only when its bit is set here and interrupts are enabled in `ustatus`.'
            },
            {
                name: 'utvec',
                number: '0x005',
                description:
                    'The address of the user level trap handler: where the machine jumps when an exception or an enabled interrupt happens. A program that means to handle its own traps writes the address of its handler here and also sets the enable bit of `ustatus`, with `csrsi ustatus, 1`, because this simulator only enters the handler when that bit is set. A trap taken without both of them stops the program with the usual error message.'
            },
            {
                name: 'uscratch',
                number: '0x040',
                description:
                    'A word the handler may use as it likes. The classic use is to give the handler a stack pointer of its own, since the trap arrives with the program halfway through something and no register free to borrow.'
            },
            {
                name: 'uepc',
                number: '0x041',
                description:
                    'The address of the instruction the trap interrupted. `uret` returns to it, so a handler that has fixed the cause returns unchanged, and a handler that means to skip the offending instruction adds 4 to this register first.'
            },
            {
                name: 'ucause',
                number: '0x042',
                description:
                    'Why the trap happened: a code such as an illegal instruction or a misaligned address, with the top bit set when the cause was an interrupt rather than an exception. A handler serving several causes reads this first.'
            },
            {
                name: 'utval',
                number: '0x043',
                description:
                    'The detail that goes with the cause: the address a load or store failed on, or the instruction that could not be decoded. Meaningless for causes that carry no such value.'
            },
            {
                name: 'uip',
                number: '0x044',
                description:
                    'Which interrupts are pending, in the same bit positions as `uie`. A source can be pending and not enabled, in which case nothing happens until the program enables it.'
            },
            {
                name: 'cycle, time, instret',
                number: '0xC00 - 0xC02',
                description:
                    'The three counters, read only: elapsed cycles, elapsed time, and the number of instructions retired. A program times a piece of itself by reading one of them before and after and subtracting.'
            },
            {
                name: 'cycleh, timeh, instreth',
                number: '0xC80 - 0xC82',
                description:
                    'The high halves of the three counters, for the 32 bit target where a 64 bit count does not fit in one register. Reading the pair safely means reading the high half, then the low, then the high again, and starting over if it changed in between.'
            }
        ]
    }
]
