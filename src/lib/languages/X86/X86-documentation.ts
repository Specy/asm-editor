/**
 * Editor and documentation data for x86-64.
 *
 * The other languages read this out of their Core: `MIPS.getInstructionSet()` and the Z80's
 * `mnemonicMap` carry a description per instruction. `@specy/x86` has no such table, because blink
 * decodes x86 rather than describing it, so the data is built from the assembler's own tables and
 * committed under `generated/`. `docs/design/x86-documentation.md` records where every field comes
 * from and what it is allowed to claim; the short version is that forms are always NASM 3.00's,
 * prose comes from the appendix NASM used to ship, and anything written here outranks both.
 *
 * This module is plain data: no Svelte, no app aliases, so the documentation routes can import it
 * from a `+page.server.ts` while prerendering and the Monaco providers can import it directly.
 */

import {
    X86_INSTRUCTIONS,
    type X86Instruction,
    type X86InstructionForm
} from './generated/x86Instructions'
import { X86_DESCRIPTIONS } from './generated/x86Descriptions'
import { X86_SYSCALLS, type X86Syscall } from './generated/x86Syscalls'
import {
    X86_ADDRESS_KEYWORDS,
    X86_DIRECTIVES,
    X86_FLAG_MEANINGS,
    X86_PREFIXES,
    X86_PREPROCESSOR_DIRECTIVES,
    X86_PSEUDO_OPS,
    X86_SIZE_SPECIFIERS
} from './generated/x86Tokens'

export {
    X86_ADDRESS_KEYWORDS,
    X86_DIRECTIVES,
    X86_FLAG_MEANINGS,
    X86_INSTRUCTIONS,
    X86_PREFIXES,
    X86_PREPROCESSOR_DIRECTIVES,
    X86_PSEUDO_OPS,
    X86_SIZE_SPECIFIERS,
    X86_SYSCALLS,
    type X86Instruction,
    type X86InstructionForm,
    type X86Syscall
}

/**
 * The headings, out of NASM's 102, whose instructions get a page of their own and appear in the
 * documentation sidebar. They are the integer instruction set a program in this editor is written
 * from; the vector and system extensions stay on the index page with their forms and their one line
 * summary, which is as much as any source we can ship says about them.
 */
export const X86_DOCUMENTED_SECTIONS = [
    'Integer data move instructions',
    'Load effective address',
    'The basic 8 arithmetic operations',
    'Bitwise testing',
    'The basic shift and rotate operations',
    'Other basic integer arithmetic',
    'Double width shift',
    'Sign and zero extension',
    'Bit operations',
    'Endianness handling',
    'Decimal arithmetic',
    'Atomic operations',
    'Stack operations',
    'Jumps',
    'Conditional instructions',
    'Call and return',
    'Interrupts, system calls, and returns',
    'Flag register instructions',
    'String instructions',
    'No operation'
]

const documentedSections = new Set(X86_DOCUMENTED_SECTIONS)

export const x86InstructionMap = new Map<string, X86Instruction>(
    X86_INSTRUCTIONS.map((instruction) => [instruction.name, instruction])
)

export const x86InstructionNames = X86_INSTRUCTIONS.map((instruction) => instruction.name)

/** Every instruction, grouped under the heading NASM files it under, in the table's own order. */
export const x86InstructionsBySection = X86_INSTRUCTIONS.reduce((sections, instruction) => {
    const section = instruction.section || 'Uncategorised'
    const existing = sections.get(section)
    if (existing) existing.push(instruction)
    else sections.set(section, [instruction])
    return sections
}, new Map<string, X86Instruction[]>())

/**
 * The instructions that get a page: the integer sections above, minus anything that needs an
 * instruction set extension in every one of its forms. That last rule is what keeps the 56 APX
 * conditional compares and faulting moves off the sidebar. They are real instructions filed under
 * `Conditional instructions`, they arrived in 2023, no source we can ship describes them, and no
 * program here can run one. They stay on the index page with their forms.
 */
export const x86DocumentedInstructions = X86_INSTRUCTIONS.filter(
    (instruction) =>
        documentedSections.has(instruction.section) && instruction.features.length === 0
)

export const x86DocumentedNames = x86DocumentedInstructions.map((instruction) => instruction.name)

const documentedNames = new Set(x86DocumentedNames)

/** True when `/documentation/x86/instruction/<name>` exists. */
export function hasX86InstructionPage(name: string): boolean {
    return documentedNames.has(name.toLowerCase())
}

/**
 * Descriptions written here, which outrank the generated ones. Three reasons to write one: the
 * appendix predates long mode and says something that is no longer the whole truth, the instruction
 * arrived after 2008 and no source we can ship describes it, or the instruction means something
 * particular in this editor, which runs a Linux program under blink rather than a bare machine.
 */
const X86_WRITTEN_DESCRIPTIONS: Record<string, string> = {
    syscall: `Asks the operating system to do something. \`rax\` holds the call number, the arguments go in \`rdi\`, \`rsi\`, \`rdx\`, \`r10\`, \`r8\` and \`r9\` in that order, and the result comes back in \`rax\`, with a small negative number meaning an error. \`rcx\` and \`r11\` are destroyed by the call itself, so anything kept in them has to be saved first.

Programs here run as Linux programs, so this is the only way a program reaches the console or the file system. The [syscall page](/documentation/x86/syscall) lists the calls this emulator implements.`,

    movabs: `Moves a full 64 bit immediate into a register. \`mov\` takes immediates up to 32 bits and sign extends them, which silently turns a large address into the wrong number, so NASM accepts \`movabs\` as the spelling that means "the whole 64 bits are here". It assembles to a 10 byte instruction, against 5 to 7 for the \`mov\` forms.`,

    cdqe: `Sign extends \`eax\` into \`rax\`, so that a 32 bit signed value read from memory or returned by a syscall can be used in 64 bit arithmetic. It takes no operands and touches no other register. \`movsxd rax, eax\` does the same thing in two more bytes.`,

    cqo: `Sign extends \`rax\` into \`rdx:rax\`, filling \`rdx\` with copies of the sign bit. \`idiv\` divides that 128 bit pair, so signed division is written as \`cqo\` then \`idiv\`; forgetting the \`cqo\` leaves whatever \`rdx\` happened to hold in the high half and the result is nonsense rather than an error.`,

    movsxd: `Copies a 32 bit source into a 64 bit register, sign extending it. This is the instruction to reach for when a signed 32 bit value has to become a 64 bit one, because the ordinary \`mov eax, ...\` zero extends instead: writing any 32 bit register clears the top half of its 64 bit name.`
}

/** The markdown shown for an instruction: written here, then the appendix, then the one liner. */
export function describeX86Instruction(name: string): string {
    const key = name.toLowerCase()
    const written = X86_WRITTEN_DESCRIPTIONS[key]
    if (written) return written
    const generated = X86_DESCRIPTIONS[key]
    if (generated) return generated.description
    const instruction = x86InstructionMap.get(key)
    return instruction?.summary ?? ''
}

/** The heading of an instruction page: the appendix's own, or the summary, or just the mnemonic. */
export function x86InstructionTitle(name: string): string {
    const key = name.toLowerCase()
    const instruction = x86InstructionMap.get(key)
    if (instruction?.summary) return instruction.summary
    const generated = X86_DESCRIPTIONS[key]
    if (!generated) return key
    // The appendix writes its headings as "`ADD`: Add Integers"; the mnemonic is already the title
    // of the page it is shown on.
    return generated.title.replace(/^`[^`]*`(,\s*`[^`]*`)*:\s*/, '')
}

/** True when the description came from a source rather than from the instruction's own summary. */
export function hasX86Description(name: string): boolean {
    const key = name.toLowerCase()
    return key in X86_WRITTEN_DESCRIPTIONS || key in X86_DESCRIPTIONS
}

export function formatX86Form(name: string, form: X86InstructionForm): string {
    return form.operands.length ? `${name} ${form.operands.join(', ')}` : name
}

/** One line for the top of an instruction page: the operand shapes, deduplicated and joined. */
export function formatX86InstructionSummary(instruction: X86Instruction): string {
    const shapes = [
        ...new Set(instruction.forms.map((form) => formatX86Form(instruction.name, form)))
    ]
    return shapes.join(' | ')
}

/**
 * How NASM's processor level flags read on a page. The table's own descriptions are terse to the
 * point of being a puzzle (`P6`, `WILLAMETTE`), and what a reader wants to know is how old the
 * instruction is.
 */
export const X86_CPU_LEVELS: Record<string, string> = {
    '8086': '8086',
    '186': '186',
    '286': '286',
    '386': '386',
    '486': '486',
    PENT: 'Pentium',
    P6: 'Pentium Pro',
    KATMAI: 'Pentium III',
    WILLAMETTE: 'Pentium 4',
    PRESCOTT: 'Pentium 4 (Prescott)',
    X86_64: 'x86-64',
    NEHALEM: 'Nehalem',
    WESTMERE: 'Westmere',
    SANDYBRIDGE: 'Sandy Bridge',
    FUTURE: 'recent',
    IA64: 'IA-64',
    ANY: 'any'
}

export function formatX86Cpu(cpu: string): string {
    return X86_CPU_LEVELS[cpu] ?? cpu
}

// --- registers ----------------------------------------------------------------------------------

export type X86Register = {
    name: string
    /** The 32, 16 and 8 bit names of the same register, widest first. */
    parts: string[]
    description: string
}

/**
 * The general purpose registers, written here because no table we read ships a description of what
 * a register is conventionally used for, and convention is most of what a reader needs: the machine
 * itself barely distinguishes them.
 */
export const X86_REGISTERS: X86Register[] = [
    {
        name: 'rax',
        parts: ['eax', 'ax', 'ah', 'al'],
        description:
            'The accumulator. `mul`, `div` and the string instructions use it without being told to, a syscall number goes in it, and a syscall result comes back in it.'
    },
    {
        name: 'rbx',
        parts: ['ebx', 'bx', 'bh', 'bl'],
        description:
            'A general register. Called on to survive a function call: a function that writes to it has to put it back before returning.'
    },
    {
        name: 'rcx',
        parts: ['ecx', 'cx', 'ch', 'cl'],
        description:
            'The counter. `loop` and the repeated string instructions count down with it, the shift instructions read a variable shift amount from `cl`, and it carries the fourth argument of a function call. `syscall` destroys it.'
    },
    {
        name: 'rdx',
        parts: ['edx', 'dx', 'dh', 'dl'],
        description:
            'The high half of the product `mul` writes and of the dividend `div` reads, and the third argument of a function call or a syscall.'
    },
    {
        name: 'rsi',
        parts: ['esi', 'si', 'sil'],
        description:
            'The source pointer of the string instructions, and the second argument of a function call or a syscall.'
    },
    {
        name: 'rdi',
        parts: ['edi', 'di', 'dil'],
        description:
            'The destination pointer of the string instructions, and the first argument of a function call or a syscall.'
    },
    {
        name: 'rbp',
        parts: ['ebp', 'bp', 'bpl'],
        description:
            'The frame pointer by convention, pointing at the base of the current function&apos;s stack frame. Nothing in the hardware requires it, and compilers routinely use it as one more general register.'
    },
    {
        name: 'rsp',
        parts: ['esp', 'sp', 'spl'],
        description:
            'The stack pointer. `push`, `pop`, `call` and `ret` move it without being told to, and it must point at usable memory whenever any of them runs.'
    },
    {
        name: 'r8 to r15',
        parts: ['r8d to r15d', 'r8w to r15w', 'r8b to r15b'],
        description:
            'The eight registers x86-64 added. `r8` and `r9` carry the fifth and sixth arguments of a function call; `r10` replaces `rcx` as the fourth argument of a syscall, because `syscall` destroys `rcx`. `r11` is destroyed too.'
    },
    {
        name: 'rip',
        parts: [],
        description:
            'The instruction pointer. It cannot be read or written directly, but it can be addressed: `[rel label]` assembles to an offset from `rip`, which is how position independent code reaches its own data.'
    },
    {
        name: 'rflags',
        parts: ['eflags', 'flags'],
        description:
            'The flags, listed below. Arithmetic and logic instructions write them, the conditional jumps and `setcc` read them, and `pushfq` and `popfq` move the whole register to and from the stack.'
    }
]

export type X86Flag = {
    name: string
    bit: number
    description: string
}

/** The flags of RFLAGS a program here can act on. */
export const X86_FLAGS: X86Flag[] = [
    {
        name: 'CF',
        bit: 0,
        description:
            'Carry. Set when an unsigned addition overflowed or an unsigned subtraction borrowed, and by the shift and rotate instructions, which shift the last bit out through it.'
    },
    {
        name: 'PF',
        bit: 2,
        description: 'Parity. Set when the low byte of the result has an even number of set bits.'
    },
    {
        name: 'AF',
        bit: 4,
        description:
            'Adjust. The carry out of bit 3, which only the decimal adjust instructions read.'
    },
    {
        name: 'ZF',
        bit: 6,
        description:
            'Zero. Set when the result was zero, which is what `je` and `jne` read after a `cmp`.'
    },
    {
        name: 'SF',
        bit: 7,
        description:
            'Sign. A copy of the top bit of the result, so it is set when the result is negative read as signed.'
    },
    {
        name: 'DF',
        bit: 10,
        description:
            'Direction. Clear means the string instructions count upwards, set means downwards. `cld` and `std` write it, and it is expected to be clear everywhere else.'
    },
    {
        name: 'OF',
        bit: 11,
        description:
            'Overflow. Set when a signed operation produced a result too large for its destination, which is a different question from the one the carry flag answers.'
    }
]

export type X86ConditionCode = {
    /** The suffix, e.g. `ne` in `jne` and `setne`. */
    code: string
    aliases: string[]
    meaning: string
    /** The flags the condition tests. */
    test: string
}

/**
 * The condition suffixes of `jcc`, `setcc` and `cmovcc`. The appendix that supplies the prose points
 * at a table of these and does not contain it, so this one is written here.
 */
export const X86_CONDITION_CODES: X86ConditionCode[] = [
    { code: 'e', aliases: ['z'], meaning: 'equal, zero', test: 'ZF = 1' },
    { code: 'ne', aliases: ['nz'], meaning: 'not equal, not zero', test: 'ZF = 0' },
    { code: 'a', aliases: ['nbe'], meaning: 'above (unsigned)', test: 'CF = 0 and ZF = 0' },
    { code: 'ae', aliases: ['nb', 'nc'], meaning: 'above or equal (unsigned)', test: 'CF = 0' },
    { code: 'b', aliases: ['nae', 'c'], meaning: 'below (unsigned)', test: 'CF = 1' },
    { code: 'be', aliases: ['na'], meaning: 'below or equal (unsigned)', test: 'CF = 1 or ZF = 1' },
    { code: 'g', aliases: ['nle'], meaning: 'greater (signed)', test: 'ZF = 0 and SF = OF' },
    { code: 'ge', aliases: ['nl'], meaning: 'greater or equal (signed)', test: 'SF = OF' },
    { code: 'l', aliases: ['nge'], meaning: 'less (signed)', test: 'SF is not OF' },
    {
        code: 'le',
        aliases: ['ng'],
        meaning: 'less or equal (signed)',
        test: 'ZF = 1 or SF is not OF'
    },
    { code: 's', aliases: [], meaning: 'sign set, negative', test: 'SF = 1' },
    { code: 'ns', aliases: [], meaning: 'sign clear, not negative', test: 'SF = 0' },
    { code: 'o', aliases: [], meaning: 'overflow', test: 'OF = 1' },
    { code: 'no', aliases: [], meaning: 'no overflow', test: 'OF = 0' },
    { code: 'p', aliases: ['pe'], meaning: 'parity even', test: 'PF = 1' },
    { code: 'np', aliases: ['po'], meaning: 'parity odd', test: 'PF = 0' }
]

// --- the assembler ---------------------------------------------------------------------------------

export type X86TokenDoc = {
    name: string
    description: string
}

/**
 * The directives a program in this editor uses. NASM has more, listed on the page from its own
 * table; these are the ones with something to say beyond their name.
 */
export const X86_DIRECTIVE_DOCS: X86TokenDoc[] = [
    {
        name: 'section',
        description:
            'Opens a section: `.text` for code, `.data` for initialised data, `.bss` for space that starts as zeroes, `.rodata` for constants. Everything after the line belongs to that section until the next one. `segment` is the same directive under its other name.'
    },
    {
        name: 'global',
        description:
            'Makes a label visible outside the file. The program has to declare `_start`, because that is the label the linker makes the entry point.'
    },
    {
        name: 'extern',
        description: 'Declares that a name is defined in another file, so this one may refer to it.'
    },
    {
        name: 'bits',
        description:
            'Assembles for 16, 32 or 64 bit mode. Programs here are 64 bit and the object format already says so, so a program needs this only to say something unusual.'
    },
    {
        name: 'default',
        description:
            'Chooses whether a bare memory reference is `rel` (an offset from `rip`) or `abs` (an absolute address). Long mode code is usually written `default rel`.'
    },
    {
        name: 'cpu',
        description:
            'Refuses to assemble instructions newer than the processor named, which is a way to keep a program inside the instruction set a course is teaching.'
    },
    {
        name: 'absolute',
        description:
            'Starts a block of labels that describe a layout without emitting anything, the way a structure declaration does.'
    }
]

/** The pseudo-ops, which live in the instruction table but are directives in every other sense. */
export const X86_PSEUDO_OP_DOCS: X86TokenDoc[] = [
    {
        name: 'db, dw, dd, dq',
        description:
            'Emit bytes, words (2 bytes), doublewords (4) and quadwords (8), in order, where the line is. They take numbers, characters, strings and label addresses: `msg: db "hi", 10`.'
    },
    {
        name: 'dt, do, dy, dz',
        description: 'Emit 10, 16, 32 and 64 byte values, for the x87 and vector types.'
    },
    {
        name: 'resb, resw, resd, resq',
        description:
            'Reserve room without writing anything: `buffer: resb 64`. They belong in `.bss`, which costs nothing in the file because it is all zeroes.'
    },
    {
        name: 'equ',
        description:
            'Gives a name to a value, evaluated once where it is written: `LEN equ 64`. Nothing is emitted and nothing can change it later.'
    },
    {
        name: 'incbin',
        description: 'Copies a file into the output at this point, byte for byte.'
    },
    {
        name: 'times',
        description:
            'Repeats the rest of the line: `times 64 db 0` emits 64 zero bytes, and `times 8 - ($ - start) db 0` pads to a fixed size.'
    }
]

/** The preprocessor. It runs before the assembler and knows nothing about instructions. */
export const X86_PREPROCESSOR_DOCS: X86TokenDoc[] = [
    {
        name: '%define',
        description:
            'A macro expanded wherever its name appears, with arguments if it was given any. Expanded late, so it sees the value a name has when it is used.'
    },
    {
        name: '%assign',
        description: 'A single line macro whose value is evaluated at once, and may be reassigned.'
    },
    {
        name: '%macro',
        description:
            'A multi line macro, ended by `%endmacro`. The number after the name says how many arguments it takes, and `%1`, `%2` stand for them.'
    },
    {
        name: '%include',
        description: 'Assembles another file here, the way a header is included.'
    },
    {
        name: '%ifdef, %ifndef, %if',
        description:
            'Assemble a block only under a condition, ending at `%endif`, with `%else` and `%elif` in between.'
    },
    {
        name: '%rep',
        description: 'Repeats a block a fixed number of times, ending at `%endrep`.'
    }
]

export const X86_PREFIX_DOCS: X86TokenDoc[] = [
    {
        name: 'lock',
        description:
            'Makes a read-modify-write instruction atomic against other processors. Only a handful of instructions accept it, and only when the destination is memory.'
    },
    {
        name: 'rep',
        description:
            'Repeats a string instruction `rcx` times, counting down. On `movs` and `stos` this is the whole loop, written in one instruction.'
    },
    {
        name: 'repe, repz, repne, repnz',
        description:
            'Repeat while the comparison keeps saying equal, or keeps saying not equal, and stop early when it changes. They are for `cmps` and `scas`, which set the flags on every step.'
    },
    {
        name: 'o16, o32, o64, a16, a32, a64',
        description:
            'Force the operand or address size of one instruction, overriding what the mode implies. NASM chooses these on its own; writing one by hand is for the rare case where the choice matters.'
    },
    {
        name: 'byte, word, dword, qword',
        description:
            'Say how wide a memory operand is, which the instruction cannot always work out on its own: `mov qword [rsp], 0` writes eight bytes, `mov byte [rsp], 0` writes one.'
    },
    {
        name: 'near, short, far',
        description:
            'Choose the reach of a jump or call. NASM picks the shortest form that works, so these are for forcing a longer one.'
    },
    {
        name: 'rel, abs',
        description:
            'Say whether a memory reference is an offset from `rip` or an absolute address, for one operand rather than for the file the way `default` does.'
    }
]

// --- syscalls ---------------------------------------------------------------------------------------

export const x86SyscallMap = new Map<string, X86Syscall>(
    X86_SYSCALLS.map((syscall) => [syscall.name, syscall])
)

export const x86SyscallsByNumber = new Map<number, X86Syscall>(
    X86_SYSCALLS.map((syscall) => [syscall.number, syscall])
)

/**
 * What a call does, for the ones a program here is likely to make. The generated table has the
 * number, the name and the shape of every call blink implements, and nothing about their meaning:
 * the argument types come from blink's strace signatures, which exist to print a trace rather than
 * to explain anything.
 */
export const X86_SYSCALL_DESCRIPTIONS: Record<string, string> = {
    read: 'Reads up to `rdx` bytes from the file descriptor in `rdi` into the buffer at `rsi`, and returns how many it read. Descriptor 0 is standard input, so this is how a program reads what was typed. A return of 0 means end of input.',
    write: 'Writes `rdx` bytes from the buffer at `rsi` to the file descriptor in `rdi`, and returns how many it wrote. Descriptor 1 is standard output and 2 is standard error, so this is how a program prints.',
    open: 'Opens the path at `rdi` with the flags in `rsi` and, when creating, the mode in `rdx`. Returns a file descriptor.',
    close: 'Closes the file descriptor in `rdi`.',
    lseek: 'Moves the read and write position of the descriptor in `rdi` to the offset in `rsi`, interpreted according to `rdx`, and returns the new position.',
    exit: 'Ends the program with the status in `rdi`. It never returns, and a program that reaches the end of its code without calling it runs into whatever bytes follow.',
    exit_group:
        'Ends every thread of the program with the status in `rdi`. For a program with one thread it is `exit`.',
    brk: 'Moves the end of the data segment to the address in `rdi`, which is the oldest way to ask for more memory. Called with 0 it returns where the segment currently ends.',
    mmap: 'Maps memory: the length in `rsi`, the protection in `rdx`, the flags in `r10`. An anonymous private mapping is how a program asks for a block of memory it can write to.',
    munmap: 'Unmaps the mapping of `rsi` bytes at the address in `rdi`.',
    nanosleep: 'Sleeps for the interval at `rdi`, a pair of seconds and nanoseconds.',
    getpid: 'Returns the process id.',
    fstat: 'Fills the structure at `rsi` with what is known about the descriptor in `rdi`, including its size.',
    clock_gettime: 'Writes the time of the clock named in `rdi` into the structure at `rsi`.',
    ioctl: 'Asks a device the descriptor in `rdi` refers to for something outside the ordinary read and write interface, chosen by the request in `rsi`.'
}

/** The calls the syscall page leads with, in the order a program meets them. */
export const X86_COMMON_SYSCALLS = [
    'write',
    'read',
    'exit',
    'exit_group',
    'open',
    'close',
    'lseek',
    'fstat',
    'brk',
    'mmap',
    'munmap',
    'nanosleep',
    'clock_gettime',
    'getpid'
]

export function describeX86Syscall(name: string): string {
    return X86_SYSCALL_DESCRIPTIONS[name] ?? ''
}

/**
 * Argument names for the calls blink answers without going through its traced dispatch table, which
 * is where every other call's argument types come from. `exit` is here because it is the one call
 * every program makes.
 */
const X86_SYSCALL_ARGS: Record<string, string[]> = {
    exit: ['status'],
    exit_group: ['status'],
    clock_gettime: ['clock', 'timespec']
}

/** What each argument of a call is, in register order: rdi, rsi, rdx, r10, r8, r9. */
export function x86SyscallArgs(syscall: X86Syscall): string[] {
    const written = X86_SYSCALL_ARGS[syscall.name]
    if (written) return written
    if (syscall.args.length > 0) return syscall.args
    // Untraced and unwritten: say how many it takes rather than inventing names for them.
    return Array.from({ length: syscall.arity }, (_, index) => `arg${index + 1}`)
}
