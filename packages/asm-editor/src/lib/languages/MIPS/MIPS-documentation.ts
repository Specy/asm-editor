import { MIPS } from '@specy/mips'
import { groupMarsForms, marsVariantOperands } from '#lib/documentation/mars/forms.ts'

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
    /** One of MARS's extended instructions, which the assembler expands into real ones. */
    isPseudo: boolean
    /** The instructions a pseudo-instruction becomes, as MARS's templates write them; empty otherwise. */
    expansion: string[]
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
        }),
        isPseudo: ins.isPseudo,
        expansion: [...ins.expansion]
    } satisfies MIPSInstruction
})

export const {
    map: mipsInstructionMap,
    variants: mipsInstructionsVariants,
    entries: mipsInstructionEntries,
    names: mipsInstructionNames
} = groupMarsForms<MIPSInstruction>(mipsInstructionsWithDuplicates)

export function mipsVariantOperands(variant: MIPSInstruction): string[] {
    return marsVariantOperands(variant, MIPSAddressingModes)
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
export { mipsSyscalls as mipsSyscall } from '#lib/documentation/mars/mipsSyscalls.ts'

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
        intro: "Coprocessor 0 holds the state used for exceptions and interrupts: their cause, the saved program address, interrupt enables and the timer. The processor records this state before jumping to the handler at `0x80000180`. Place the handler there with `.ktext 0x80000180`. Without a handler, an exception or enabled interrupt stops the program with an error.\n\nUse `mfc0 $k0, $13` to read Cause, or `mtc0 $k0, $14` to write EPC. The processor executes the handler. CP0 records and controls its entry and return. Leave EPC unchanged after an interrupt, or when retrying an instruction after repairing an exception. Add 4 only when deliberately skipping the failed instruction.\n\nThis simulator implements the six registers below: MARS's four plus the MIPS32 Count and Compare timer. See [Interrupts and the timer](/documentation/mips/interrupts) for complete programs.",
        registers: [
            {
                name: '$8 (vaddr)',
                description:
                    'The memory address that caused an address-error exception, such as the address a `lw` or `sw` could not access. Other exceptions leave this register unchanged. Check the exception code in Cause before using it.'
            },
            {
                name: '$9 (count)',
                description:
                    'The timer counter. It increases by one every two instructions, starting at 0 before the first instruction. It measures executed instructions rather than elapsed time. The same instruction sequence produces the same Count values on each run. In C, startup code has already increased Count before `main`. Write it with `mtc0` to set a new value. Counting continues from there. This is a MIPS32 register, absent from MARS 4.5.'
            },
            {
                name: '$11 (compare)',
                description:
                    'Set this ahead of Count, for example to Count + 1000. When Count reaches it, the timer sets Cause bit 15 to request an interrupt. Writing Compare clears that request. The timer stays off until the first write.\n\nSetting Compare equal to the current Count is not a reliable immediate request: the match point occurs at the end of an even-numbered instruction. If that point has passed, the timer waits until Count wraps around.'
            },
            {
                name: '$12 (status)',
                description:
                    'The interrupt enable bits and source mask. Initially `0x0000FF11`: user mode, interrupts enabled by bit 0, and all eight source mask bits, 8 to 15, set. The processor sets bit 1, EXL, on entry to a handler, giving `0x0000FF13`. No further interrupt is taken while EXL is set. `eret` clears EXL. To block interrupts, use `mtc0` to clear bit 0 or the required source mask bit.'
            },
            {
                name: '$13 (cause)',
                description:
                    'The exception code is in bits 2 to 6. Code 0 means an interrupt. Code 4, an address error on a load, appears as `0x10` after shifting left by two. Pending interrupt sources appear in bits 8 to 15: bit 15 timer, bit 8 keyboard and bit 9 display. These bits follow the devices and ignore `mtc0` writes. A shared handler checks the exception code first, then the source bits for an interrupt.'
            },
            {
                name: '$14 (epc)',
                description:
                    'The return address used by `eret`. After an interrupt, it points to the next instruction, which has not run: leave EPC unchanged. After an exception, it points to the failed instruction. Leave it unchanged to retry after repairing the cause, or add 4 to deliberately skip that instruction.'
            }
        ]
    }
]
