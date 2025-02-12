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

export const mipsInstructionsVariants = [...mipsInstructionMap.values()]

export const mipsInstructionNames = [...mipsInstructionMap.keys()]

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
            'Allocates **one or more** 32-bit (4-byte) words in memory.\n\nExample:\n```assembly\nvalues: .word 1, 2, 3, 4\n```'
    },
    half: {
        name: 'half',
        description:
            'Allocates **one or more** 16-bit (2-byte) halfwords in memory.\n\nExample:\n```assembly\nvalues: .half 1234, 5678\n```'
    },
    byte: {
        name: 'byte',
        description:
            'Allocates **one or more** 8-bit (1-byte) values in memory.\n\nExample:\n```assembly\nflags: .byte 0, 1, 1, 0\n```'
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
            'Stores a **null-terminated string** (C-style string).\n\nExample:\n```assembly\nmessage: .asciiz "Hello, world!"\n```'
    },
    ascii: {
        name: 'ascii',
        description:
            'Stores a **string without a null terminator**. Useful when manually handling string length.'
    },
    space: {
        name: 'space',
        description:
            'Reserves a **specified number of bytes** in memory without initializing them.\n\nExample:\n```assembly\nbuffer: .space 100   # Reserves 100 bytes\n```'
    },
    align: {
        name: 'align',
        description:
            'Aligns the next data to a **2^n-byte boundary**.\n\nExample:\n```assembly\n.align 2   # Aligns to a 4-byte boundary\n```'
    },
    globl: {
        name: 'globl',
        description:
            "Marks a **symbol as global**, making it accessible from other files.\n\nExample:\n```assembly\n.globl main   # Makes 'main' visible to the linker\n```"
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
            'Includes an external assembly file.\n\nExample:\n```assembly\n.include "myfile.s"\n```'
    },
    eqv: {
        name: 'eqv',
        description:
            'Defines a **symbolic constant**, similar to `#define` in C.\n\nExample:\n```assembly\n.eqv SIZE 10\n```'
    },
    set: {
        name: 'set',
        description:
            'Configures assembler settings, such as allowing modifications to the `$at` register.\n\nExample:\n```assembly\n.set noat  # Allows use of register $at\n```'
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
}
