import { MIPS } from '@specy/mips'

const mipsIse = MIPS.getInstructionSet()

type MIPSAddressingMode = {
    type: string
    value: string
}

export type MIPSInstruction = {
    name: string
    args: MIPSAddressingMode[][]
    description: string
    example: string
    interactiveExample?: {
        code: string
    }
}

export const mipsInstructionsWithDuplicates = mipsIse.map((ins) => {
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
            ] satisfies MIPSAddressingMode[]
        })
    } satisfies MIPSInstruction
})

export const mipsInstructionMap = new Map<string, MIPSInstruction[]>()
for (const ins of mipsInstructionsWithDuplicates) {
    if (mipsInstructionMap.has(ins.name)) {
        mipsInstructionMap.get(ins.name).push(ins)
    } else {
        mipsInstructionMap.set(ins.name, [ins])
    }
}


export function aggregateArgs(ins: MIPSInstruction[]): MIPSAddressingMode[][] {
    const args = new Array(Math.max(...ins.map(i => i.args.length))).fill(undefined) as MIPSAddressingMode[][]
    for (const i of ins) {
        i.args.forEach((a, idx) => {
            if (args[idx] === undefined) {
                args[idx] = []
            }
            for (const arg of a) {
                if (!args[idx].some(e => e.type === arg.type)) {
                    args[idx].push(arg)
                }
            }
        })
    }
    return args
}

export const mipsInstructionsVariants = [...mipsInstructionMap.values()]

export const mipsInstructionNames = [...mipsInstructionMap.keys()]

export function formatAggregatedArgs(ins: MIPSInstruction[]): string {
    return aggregateArgs(ins).map(a => {
        const args = a.map(arg => MIPSAddressingModes[arg.type].label)
        if(args.length > 1) {
            return `[${args.join('/')}]`
        }else{
            return args[0]
        }
    }).join(', ')
}

export const MIPSAddressingModes = {
    REGISTER_NAME: {
        detail: '$t1',
        label: '$reg',
        insertText: '$',
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
        detail: '$f1',
        label: '$freg',
        insertText: '$f',
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

export const mipsDirectivesMap = {
    data: {
        name: 'data',
        description: 'Declares a section for storing **initialized** data, such as variables.'
    },
    text: {
        name: 'text',
        description:
            'Declares a section for storing **executable instructions**. This is where program logic is written.'
    },
    kdata: {
        name: 'kdata',
        description: 'Declares a section for storing **kernel-mode initialized data**.'
    },
    ktext: {
        name: 'ktext',
        description: 'Declares a section for storing **kernel-mode executable instructions**.'
    },
    word: {
        name: 'word',
        description:
            'Allocates **one or more** 32-bit (4-byte) words in memory.\n\nExample:\n```mips\nvalues: .word 1, 2, 3, 4\n```'
    },
    half: {
        name: 'half',
        description:
            'Allocates **one or more** 16-bit (2-byte) halfwords in memory.\n\nExample:\n```mips\nvalues: .half 1234, 5678\n```'
    },
    byte: {
        name: 'byte',
        description:
            'Allocates **one or more** 8-bit (1-byte) values in memory.\n\nExample:\n```mips\nflags: .byte 0, 1, 1, 0\n```'
    },
    float: {
        name: 'float',
        description: 'Allocates a **single-precision floating-point (32-bit) number** in memory.'
    },
    double: {
        name: 'double',
        description: 'Allocates a **double-precision floating-point (64-bit) number** in memory.'
    },
    asciiz: {
        name: 'asciiz',
        description:
            'Stores a **null-terminated string** (C-style string).\n\nExample:\n```mips\nmessage: .asciiz "Hello, world!"\n```'
    },
    ascii: {
        name: 'ascii',
        description:
            'Stores a **string without a null terminator**. Useful when manually handling string length.'
    },
    space: {
        name: 'space',
        description:
            'Reserves a **specified number of bytes** in memory without initializing them.\n\nExample:\n```mips\nbuffer: .space 100   # Reserves 100 bytes\n```'
    },
    align: {
        name: 'align',
        description:
            'Aligns the next data to a **2^n-byte boundary**.\n\nExample:\n```mips\n.align 2   # Aligns to a 4-byte boundary\n```'
    },
    globl: {
        name: 'globl',
        description:
            "Marks a **symbol as global**, making it accessible from other files.\n\nExample:\n```mips\n.globl main   # Makes 'main' visible to the linker\n```"
    },
    extern: {
        name: 'extern',
        description: 'Declares a **symbol that is defined in another file**, specifying its size.'
    },
    macro: {
        name: 'macro',
        description: 'Defines a **macro**, which allows writing reusable code blocks.'
    },
    end_macro: {
        name: 'end_macro',
        description: 'Ends a macro definition.'
    },
    include: {
        name: 'include',
        description:
            'Includes an external assembly file.\n\nExample:\n```mips\n.include "myfile.s"\n```'
    },
    eqv: {
        name: 'eqv',
        description:
            'Defines a **symbolic constant**, similar to `#define` in C.\n\nExample:\n```mips\n.eqv SIZE 10\n```'
    },
    set: {
        name: 'set',
        description:
            'Configures assembler settings, such as allowing modifications to the `$at` register.\n\nExample:\n```mips\n.set noat  # Allows use of register $at\n```'
    },
    bss: {
        name: 'bss',
        description:
            'Declares an **uninitialized data section**, typically used for reserving large blocks of memory.'
    },
    org: {
        name: 'org',
        description:
            'Sets the **location counter** to a specific address, controlling where subsequent data or code is placed.'
    },
    ltorg: {
        name: 'ltorg',
        description:
            'Forces the assembler to place **literal pools** (constants) at the current location.'
    },
    frame: {
        name: '.frame',
        description:
            "Defines a function's **stack frame structure**, including base register, stack size, and return register."
    },
    ent: {
        name: 'ent',
        description: 'Marks the **start of a function** for debugging or profiling purposes.'
    },
    end: {
        name: 'end',
        description: 'Marks the **end of an assembly file** or function.'
    },
    local: {
        name: 'local',
        description:
            'Declares a **symbol as local**, meaning it is only accessible within the current file.'
    }
} as const
