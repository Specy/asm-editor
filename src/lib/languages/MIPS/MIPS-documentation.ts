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
}

type MIPSInstructionVariants = [MIPSInstruction, ...MIPSInstruction[]]

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

export const mipsInstructionsWithDuplicates = mipsIse.map((ins) => {
    return {
        name: ins.name,
        description: ins.description,
        example: ins.example,
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

export const mipsInstructionMap = new Map<string, MIPSInstructionVariants>()
for (const ins of mipsInstructionsWithDuplicates) {
    const variants = mipsInstructionMap.get(ins.name)
    if (variants) {
        variants.push(ins)
    } else {
        mipsInstructionMap.set(ins.name, [ins])
    }
}

export function aggregateArgs(ins: MIPSInstruction[]): MIPSAddressingMode[][] {
    const args = new Array(Math.max(...ins.map((i) => i.args.length))).fill(
        undefined
    ) as MIPSAddressingMode[][]
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

export const mipsInstructionsVariants = [...mipsInstructionMap.values()]

export const mipsInstructionEntries = [...mipsInstructionMap.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
)

export const mipsInstructionNames = mipsInstructionEntries.map(([name]) => name)

export function mipsVariantOperands(variant: MIPSInstruction): string[] {
    const isReg = (s: string) => s === '$reg' || s === '$freg' || s === 'regnum'

    function getLabel(type: string): string {
        if (type.startsWith('INTEGER')) return 'imm'
        return hasOwnKey(MIPSAddressingModes, type) ? MIPSAddressingModes[type].label : type
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

export function formatAggregatedArgs(ins: MIPSInstruction[]): string {
    const allOps = ins.map(mipsVariantOperands)
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
    variants: MIPSInstruction[]
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
            'Aligns the next data address to a boundary of 2^n bytes: `.align 2` moves it to a 4-byte boundary, and `.align 3` to an 8-byte boundary. The operand is an exponent, not a byte count.\n\nExample:\n```mips\n.align 2   # Aligns to a 4-byte boundary\n```'
    },
    globl: {
        name: 'globl',
        description:
            'Marks a symbol as global so other source files or a linker can refer to it. For example, `.globl main` gives the symbol `main` external visibility.\n\nExample:\n```mips\n.globl main\n```'
    },
    extern: {
        name: 'extern',
        description:
            'Declares an external data symbol and its size in bytes, so the assembler can reserve its address for references to that symbol.'
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
    frame: {
        //every other name here is written without the dot, which the page adds itself
        name: 'frame',
        description:
            "Describes a function's **stack frame** for debugging tools: base register, stack size and return register. The assembler accepts this metadata directive but does not use it to change program behavior."
    },
    ent: {
        name: 'ent',
        description:
            'Marks the **start of a function** for debugging tools. The assembler accepts this metadata directive but does not use it to change program behavior.'
    },
    end: {
        name: 'end',
        description:
            'Marks the **end of a function** for debugging tools. The assembler accepts this metadata directive but does not use it to change program behavior.'
    },
    local: {
        name: 'local',
        description:
            'Marks a symbol as **local to this file** for the linker. This assembler accepts the directive but does not use it to change symbol visibility.'
    },
    section: {
        name: 'section',
        description:
            'Switches to the named section. In this simulator, `.rodata` and `.bss` share the data segment with `.data`; use `.text` for instructions.\n\nExample:\n```mips\n.section .rodata\nmessage: .asciiz "Ready"\n```'
    },
    rdata: {
        name: 'rdata',
        description:
            'Declares a section for **read-only initialized data**, such as string literals. Read-only data is not stored separately in this simulator, so it joins the data segment.'
    },
    sdata: {
        name: 'sdata',
        description: 'Alias for `.rdata`.'
    },
    sbss: {
        name: 'sbss',
        description: 'Alias for `.bss`.'
    },
    comm: {
        name: 'comm',
        description:
            'Reserves bytes for an **uninitialized global variable**, the way a C compiler declares one. Takes a symbol, a size in bytes and an optional alignment, and leaves the current section unchanged.\n\nExample:\n```mips\n.comm total, 4, 4\n```'
    },
    lcomm: {
        name: 'lcomm',
        description:
            'Like `.comm`, but for a symbol **local to this file**, as a C compiler declares an uninitialized `static` variable.'
    },
    zero: {
        name: 'zero',
        description: 'Reserves the given number of bytes, which read as zero. Alias for `.space`.'
    },
    p2align: {
        name: 'p2align',
        description: 'Alias for `.align`: aligns the next item on a 2^n byte boundary.'
    },
    balign: {
        name: 'balign',
        description:
            'Aligns the next item on the given byte boundary, written **directly** rather than as a power of two.\n\nExample:\n```mips\n.balign 8\n```'
    },
    '2byte': {
        name: '2byte',
        description: 'Alias for `.half`.'
    },
    '4byte': {
        name: '4byte',
        description: 'Alias for `.word`.'
    },
    asciz: {
        name: 'asciz',
        description: 'Alias for `.asciiz`: stores a null-terminated string.'
    },
    string: {
        name: 'string',
        description: 'Alias for `.asciiz`: stores a null-terminated string.'
    },
    global: {
        name: 'global',
        description: 'Alias for `.globl`.'
    }
} as const

/**
 * The syscalls live in `documentation/mars/mipsSyscalls.ts`, free of the Core, so that build
 * scripts can read them.
 */
export { mipsSyscalls as mipsSyscall } from '$lib/documentation/mars/mipsSyscalls'

export const mipsRegisters = {
    zero: {
        name: '$zero',
        number: '$0',
        description:
            'Always contains the value **0**. Any write attempt to this register is silently ignored.'
    },
    at: {
        name: '$at',
        number: '$1',
        description:
            '**Assembly temporary**, reserved for **assembler** internal use. It is used by macro instructions like `li` or `la` to break them into multiple real instructions. You can take control of it using the `.set noat` directive, but after that, macro instructions that rely on it will stop working.'
    },
    v: {
        name: '$v0 - $v1',
        number: '$2 - $3',
        description:
            'Used to return non-floating point values from a subroutine. If the return value fits in 32 bits, only `$v0` is used; for 64-bit values, the high word goes in `$v1`. `$v0` also holds the system call number before a `syscall` instruction.'
    },
    a: {
        name: '$a0 - $a3',
        number: '$4 - $7',
        description:
            '**Arguments**, used to pass the first four non-floating point arguments to a subroutine. Additional arguments are passed on the stack.'
    },
    t: {
        name: '$t0 - $t7',
        number: '$8 - $15',
        description:
            '**Temporary registers**, their values are not preserved across subroutine calls. The caller is responsible for saving them if needed.'
    },
    s: {
        name: '$s0 - $s7',
        number: '$16 - $23',
        description:
            '**Saved registers**, subroutines must preserve their values across calls, either by not using them or by saving and restoring them on the stack.'
    },
    t2: {
        name: '$t8 - $t9',
        number: '$24 - $25',
        description:
            'Additional **temporary registers**, same conventions as `$t0-$t7`. Note that `$t9` has a special role in PIC code: by convention it holds the address of the called function, allowing the callee to compute `$gp`.'
    },
    k: {
        name: '$k0 - $k1',
        number: '$26 - $27',
        description:
            'Reserved for **OS/interrupt handler** use. They can be overwritten at any time by an interrupt or trap handler, so user code should never rely on their values.'
    },
    gp: {
        name: '$gp',
        number: '$28',
        description:
            '**Global pointer**, used for two distinct purposes. In **PIC code** (Linux shared libraries), it points to the GOT (Global Offset Table), a table of pointers that the dynamic loader fills at runtime with the real addresses of external symbols. In **non-PIC code** (embedded systems), it points to the center of a compact region of small global/static variables, allowing them to be accessed with a single instruction using a signed 16-bit offset (covering ±32KB, 64KB total).'
    },
    sp: {
        name: '$sp',
        number: '$29',
        description:
            '**Stack pointer**, points to the top of the stack. It is explicitly adjusted by the callee on subroutine entry and exit.'
    },
    fp: {
        name: '$fp',
        number: '$30',
        description:
            '**Frame pointer**, also known as `$s8`. Used by a subroutine to track the stack frame when the stack pointer cannot be used directly, for example when the stack size is not known at compile time (e.g. when using `alloca()`).'
    },
    ra: {
        name: '$ra',
        number: '$31',
        description:
            '**Return address**, automatically written by `jal` with the address of the instruction following the call. The subroutine returns by executing `jr $ra`. Functions that themselves call other subroutines must save `$ra` on the stack first, since `jal` would otherwise overwrite it.'
    }
}

export type MIPSRegisterDoc = {
    name: string
    /**
     * What the page prints in the parenthesis after the name: the numbers behind it where the entry
     * is one register or a run of them, and what the entry covers where it is a rule about the file
     * rather than a register of its own. Left out where the name already carries the number, as the
     * CP0 names do.
     */
    detail?: string
    description: string
}

/**
 * A register file beside the general purpose registers: the coprocessors the simulator shows on
 * their own tabs. The registers are grouped by role, as the general ones above are, rather than
 * listed one entry per number.
 */
export type MIPSRegisterFileDoc = {
    /**
     * The anchor of the section on the page, and the tab the registers panel shows the file
     * under.
     */
    id: string
    title: string
    /** Markdown, shown once above the registers of the file. */
    intro: string
    registers: MIPSRegisterDoc[]
}

export const mipsRegisterFiles: MIPSRegisterFileDoc[] = [
    {
        id: 'fpu',
        title: 'FPU (coprocessor 1)',
        intro: 'Floating point numbers live in a coprocessor with registers and instructions of its own: `add.s` adds two single precision values the way `add` adds two integers, and no arithmetic instruction reads a register from each file. Crossing between them is a job of its own. `mtc1` and `mfc1` name one general register and one floating point register and move the **bits** between them without converting anything, while `cvt.s.w` and `cvt.w.s` convert between an integer and a float once the value is inside the coprocessor.\n\nThis simulator has no `li.s` or `li.d` pseudo-instruction. A constant is either written in the data section as a `.float` or a `.double` and loaded with `l.s` or `l.d`, or assembled as a bit pattern in a general register and moved across with `mtc1`.',
        registers: [
            {
                name: '$f0 - $f31',
                detail: '32 bits each',
                description:
                    'The floating point registers. Each one holds a single precision value, which is what the `.s` instructions read and write. By convention `$f12` and `$f14` pass the first two floating point arguments to a subroutine and `$f0` returns the result, and the syscalls that read and print floats use the same registers.'
            },
            {
                name: 'Double precision pairs',
                detail: '$f0, $f2, $f4 … $f30',
                description:
                    'A double precision value is 64 bits, so it occupies a **pair** of registers: the even one holds the low word and the odd one above it holds the high word. Only the even register is ever named, so `l.d $f4, value` fills both `$f4` and `$f5`, and `add.d $f0, $f2, $f4` reads and writes three pairs. Naming an odd register in a `.d` instruction is an error. This is also why the double format of the registers panel leaves the odd rows blank.'
            },
            {
                name: 'Condition flags',
                detail: '0 - 7',
                description:
                    'A floating point comparison writes no register. It writes one of eight condition flags, and `bc1t` and `bc1f` branch on one of them, which is how a float comparison reaches a branch. The two operand form `c.lt.s $f0, $f2` writes flag **0**, the flag that `bc1t label` reads when it is given no number; the three operand form `c.lt.s 3, $f0, $f2` writes flag 3, and `bc1t 3, label` is the branch that reads it. Eight flags mean eight comparisons can be kept apart at once. The registers panel shows them in the row above the registers of the file.'
            }
        ]
    },
    {
        id: 'cp0',
        title: 'CP0 (coprocessor 0)',
        intro: 'Coprocessor 0 is the part of the processor that deals with exceptions: a bad memory address, an overflow on `add`, a `break`. The machine writes these registers itself, at the moment it stops what the program was doing and jumps to the handler, which is whatever the program assembled at the exception vector with `.ktext 0x80000180`. A program with no handler there stops instead, with the message the simulator prints. The handler reads these registers with `mfc0`, as in `mfc0 $k0, $13`, to find out what happened and where, and writes them back with `mtc0`, as in `mtc0 $k0, $14`, which is how it steps the return address past the instruction that faulted before `eret` returns to it.\n\nThis simulator implements the four registers below, and it raises exceptions only: nothing in it delivers an interrupt, so the interrupt bits are values to read and write rather than something that changes what runs.',
        registers: [
            {
                name: '$8 (vaddr)',
                description:
                    'The address that caused the exception, when it was a memory one: the address the `lw` or `sw` failed on. It keeps whatever it held after any other kind of exception, so it is only worth reading once the cause says the exception was an address error.'
            },
            {
                name: '$12 (status)',
                description:
                    'The interrupt mask and the enable bits. It starts at `0x0000FF11`: every one of the eight interrupt levels unmasked, user mode, and interrupts enabled. The bit this simulator writes itself is bit 1, the exception level, which taking an exception sets and `eret` clears on the way back, so the register reads `0x0000FF13` inside a handler. A handler is free to change the mask and the enable bit with `mtc0`, as it would on a real processor, but since nothing here delivers an interrupt the change is only visible in the register.'
            },
            {
                name: '$13 (cause)',
                description:
                    'Why the exception happened. Bits 2 to 6 hold the exception code, the number behind the message the simulator prints, so an address error on a load reads as `0x10`, which is code 4 shifted up by two. The bits above them report pending interrupts on a real processor and stay zero here, because nothing in this simulator raises one. A handler that serves several causes reads this register first and branches on the code.'
            },
            {
                name: '$14 (epc)',
                description:
                    'The address of the instruction that was interrupted. A handler that means to let the program continue returns to it, normally after adding 4 so that the instruction which trapped is not run a second time.'
            }
        ]
    }
]
