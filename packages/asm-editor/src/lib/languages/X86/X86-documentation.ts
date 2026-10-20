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
import { X86_SIM_ARGUMENT_OVERRIDES } from '../../documentation/x86/syscallBinding'
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

const X86_SIGNED_IMMEDIATE_RULE = `An 8-bit immediate used with a wider operand is sign-extended from −128 through 127. For a 64-bit operation, the longer immediate field is only 32 bits and is also sign-extended; there is no full 64-bit immediate form. The encoded bits determine the value used by the operation. For example, a 32-bit field of \`0xffffffff\` becomes \`0xffffffffffffffff\` (−1), not positive 4294967295. An out-of-range constant can produce a warning and truncated bits; use a register for a value that cannot be represented by these sign extensions.

NASM normally chooses the short immediate encoding when it preserves the value; a \`byte\` qualifier is not required. \`strict\` with an immediate size can prevent that shortening.`

const X86_SHIFT_COUNT_RULE = `The count comes from an immediate or \`cl\`. A 64-bit operand uses the low six bits of the count; 8-, 16- and 32-bit operands use the low five. Thus \`shl rax, 32\` shifts by 32, while \`shl eax, 32\` has a masked count of zero.`

function instructionDescriptions(names: string[], description: string): Record<string, string> {
    return Object.fromEntries(names.map((name) => [name, description]))
}

/**
 * Descriptions written here, which outrank the generated ones. Three reasons to write one: the
 * appendix predates long mode and says something that is no longer the whole truth, the instruction
 * arrived after 2008 and no source we can ship describes it, or the instruction means something
 * particular in this editor, which runs a Linux program under blink rather than a bare machine.
 */
const X86_WRITTEN_DESCRIPTIONS: Record<string, string> = {
    ...Object.fromEntries(
        Object.entries({
            add: 'Adds the source to the destination and stores the sum in the destination. CF reports unsigned carry; OF reports signed overflow.',
            adc: 'Adds the source and the current carry flag to the destination. This allows a carry from a lower part to be included in a multiword sum.',
            sub: 'Subtracts the source from the destination and stores the difference there. CF reports unsigned borrow; OF reports signed overflow.',
            sbb: 'Subtracts the source and the current carry flag from the destination. This carries a borrow into the next part of a multiword subtraction.',
            cmp: 'Sets flags as if subtracting the source from the destination, without storing the difference. Use signed or unsigned conditional instructions according to how the values should be interpreted.',
            and: 'Combines corresponding bits with AND and stores the result in the destination. A bit is set only when both input bits are set. CF and OF are cleared.',
            or: 'Combines corresponding bits with OR and stores the result in the destination. A bit is set when either input bit is set. CF and OF are cleared.',
            xor: 'Combines corresponding bits with XOR and stores the result in the destination. A bit is set when the input bits differ. CF and OF are cleared.'
        }).map(([name, operation]) => [
            name,
            `${operation}

The destination is a register or memory operand; the source is a register, memory operand or immediate, with at most one memory operand. Register and memory operands have the same width. When the instruction writes a 32-bit register, that write clears the upper half of its 64-bit register.

${X86_SIGNED_IMMEDIATE_RULE}${name === 'and' ? '\n\nFor example, `and rax, 0xffffffff` does not clear the upper 32 bits: its immediate is sign-extended to all ones. `mov eax, eax` clears the upper half while preserving the low 32 bits.' : ''}`
        ])
    ),

    test: `Sets flags from a bitwise AND of the operands without storing the result. ZF reports whether all tested bits were zero; CF and OF are cleared.

For a 64-bit operand, an immediate uses a 32-bit field sign-extended to 64 bits. For example, \`test rax, -1\` tests all 64 bits. There is no full 64-bit immediate or sign-extended 8-bit immediate encoding for \`test\`; load a different 64-bit mask into a register if needed.`,

    ...instructionDescriptions(
        ['shl', 'sal', 'shr', 'sar'],
        `Shifts the destination by the given count. \`shl\` and its synonym \`sal\` shift left and fill low bits with zeros. \`shr\` shifts right and fills high bits with zeros; \`sar\` shifts right and repeats the original sign bit. When defined, CF receives the last bit shifted out. OF is defined only for a count of one; CF is undefined for a \`shl\` or \`shr\` count at least as large as the operand width.

${X86_SHIFT_COUNT_RULE}`
    ),

    ...instructionDescriptions(
        ['rol', 'ror'],
        `Rotates bits within the destination: \`rol\` moves bits leaving the high end back into the low end; \`ror\` moves bits leaving the low end back into the high end. CF receives the last bit rotated out, and OF is defined only for a count of one.

The count comes from an immediate or \`cl\`. It is first masked to six bits for a 64-bit operand or five bits for smaller operands, then reduced modulo the operand width for the rotation. A 64-bit rotation by 32 therefore exchanges the two 32-bit halves; a count of 64 masks to zero.`
    ),

    ...instructionDescriptions(
        ['rcl', 'rcr'],
        `Rotates the destination together with CF, treating the flag as an extra bit. The rotation ring has 9, 17, 33 or 65 bits for an 8-, 16-, 32- or 64-bit operand. For example, \`rcl al, 1\` moves the old high bit into CF and the old CF into bit 0. \`rcr\` rotates in the opposite direction. OF is defined only for a count of one.

The count comes from an immediate or \`cl\`. It is masked to six bits for a 64-bit operand, or five bits for smaller operands. For byte and word operands, the masked count is then reduced modulo 9 or 17. For 32- and 64-bit operands, the mask limits the count to 31 or 63; a written count of 32 or 64 respectively masks to zero.`
    ),

    ...instructionDescriptions(
        ['shld', 'shrd'],
        `Shifts the destination while supplying incoming bits from a second register of the same width. \`shld\` shifts left and fills the low end from the source's high end; \`shrd\` shifts right and fills the high end from the source's low end. Only the first operand changes. For example, with \`eax = 0x01234567\` and \`ebx = 0x89abcdef\`, \`shld eax, ebx, 4\` leaves \`eax = 0x12345678\`.

The third operand is an immediate or \`cl\`. Its low six bits are used for 64-bit operands and its low five for 16- and 32-bit operands. A masked count of zero leaves the destination and flags unchanged; a count greater than the operand width has an undefined result.`
    ),

    ...instructionDescriptions(
        ['bsf', 'bsr'],
        `Finds a set bit in the source and stores its index in the destination register. \`bsf\` finds the least significant set bit; \`bsr\` finds the most significant. The operands have matching 16-, 32- or 64-bit widths, with indices 0–15, 0–31 or 0–63 respectively.

If the source is zero, ZF is set and the destination is undefined. Otherwise ZF is cleared. A 32-bit destination write clears the upper half of its 64-bit register.`
    ),

    ...instructionDescriptions(
        ['bt', 'btc', 'btr', 'bts'],
        `Copies the selected bit of the first operand into CF. \`bt\` leaves the operand unchanged; \`btc\` complements that bit, \`btr\` clears it and \`bts\` sets it.

For a register operand, the index wraps modulo its width: 16, 32 or 64 bits, so \`bt rax, 63\` tests the top bit of \`rax\`. For a memory operand, a register index is a signed bit offset into a bit string and can select a bit outside the first word, doubleword or quadword. An immediate index is encoded in eight bits; the processor selects within the operand width, and NASM can fold constant high bits into the memory displacement. For a fixed memory bit, an explicit byte displacement and an index within the width make the selected location clear.`
    ),

    ...instructionDescriptions(
        [
            'ja',
            'jae',
            'jb',
            'jbe',
            'jc',
            'je',
            'jg',
            'jge',
            'jl',
            'jle',
            'jna',
            'jnae',
            'jnb',
            'jnbe',
            'jnc',
            'jne',
            'jng',
            'jnge',
            'jnl',
            'jnle',
            'jno',
            'jnp',
            'jns',
            'jnz',
            'jo',
            'jp',
            'jpe',
            'jpo',
            'js',
            'jz'
        ],
        `Jumps to the target when the condition in the mnemonic is satisfied; otherwise execution continues with the next instruction. The condition reads the current flags, commonly set by \`cmp\` or \`test\`. Signed comparisons use SF and OF; unsigned comparisons use CF. The [condition-code table](/documentation/x86/registers#condition-codes) lists the flag tests and synonymous mnemonics.

Write the target label or address, such as \`jne retry\`. NASM calculates a displacement from the end of the jump. The short form reaches −128 through 127 bytes from that point; the longer near form in 64-bit mode uses a signed 32-bit displacement (about ±2 GiB). NASM normally selects the short form when possible. \`short\` requires the short range, while \`strict near\` keeps the longer form.

Conditional jumps have no register or memory-indirect target form. To conditionally reach an arbitrary 64-bit address, branch around an indirect \`jmp\`.`
    ),

    ...instructionDescriptions(
        ['jcxz', 'jecxz', 'jrcxz'],
        `Jumps when the named counter register is zero, without decrementing it or reading or changing flags. \`jrcxz\` tests \`rcx\`; \`jecxz\` tests \`ecx\` and uses the 32-bit address size in 64-bit mode. \`jcxz target\` tests \`cx\` and is unavailable in 64-bit mode because 16-bit addressing is unavailable. NASM also accepts \`jcxz target, ecx\` and \`jcxz target, rcx\` as explicit-counter aliases for \`jecxz\` and \`jrcxz\`.

The operand is a target label or address. NASM encodes a signed 8-bit displacement from the end of the instruction, reaching −128 through 127 bytes. There is no longer near encoding for these instructions.`
    ),

    ...instructionDescriptions(
        ['loop', 'loope', 'loopz', 'loopne', 'loopnz'],
        `Decrements the counter and jumps if it is nonzero. \`loope\` / \`loopz\` additionally require ZF = 1; \`loopne\` / \`loopnz\` require ZF = 0. The instructions do not change flags.

In 64-bit mode, the default counter is \`rcx\`; \`a32\` selects \`ecx\`. A 16-bit \`cx\` counter is unavailable in this mode. A zero initial counter wraps to its maximum value when decremented.

Write a target label or address. NASM calculates a signed 8-bit displacement from the end of the instruction (−128 through 127 bytes). There is no longer near encoding.`
    ),

    ...Object.fromEntries(
        ['loop', 'loope', 'loopz', 'loopne', 'loopnz'].flatMap((family) =>
            ['w', 'd', 'q'].map((suffix) => {
                const counter = suffix === 'w' ? 'cx' : suffix === 'd' ? 'ecx' : 'rcx'
                const condition =
                    family === 'loope' || family === 'loopz'
                        ? ' and ZF = 1'
                        : family === 'loopne' || family === 'loopnz'
                          ? ' and ZF = 0'
                          : ''
                const mode =
                    suffix === 'w'
                        ? 'The w suffix selects the 16-bit counter and 16-bit address size. This form is unavailable in 64-bit mode.'
                        : suffix === 'd'
                          ? 'The d suffix explicitly selects the 32-bit counter and 32-bit address size, including in 64-bit mode.'
                          : 'The q suffix explicitly selects the 64-bit counter and address size. This form requires 64-bit mode.'
                return [
                    `${family}${suffix}`,
                    `Decrements \`${counter}\` and jumps if the counter is nonzero${condition}. It leaves flags unchanged. A zero initial counter wraps to its maximum value when decremented.

${mode} The suffix chooses the counter width, not the branch displacement width.

Write a target label or address. NASM calculates a signed 8-bit displacement from the end of the instruction (−128 through 127 bytes). There is no longer near encoding.`
                ]
            })
        )
    ),

    ...instructionDescriptions(
        ['enter', 'enterq'],
        `Creates a stack frame. The first immediate is an unsigned 16-bit byte count for local storage; the second is a nesting level whose low five bits are used (0–31). NASM also accepts a single operand, with nesting level zero.

In 64-bit code, \`enter 32, 0\` has the frame-building effect of:

\`\`\`x86
push rbp
mov rbp, rsp
sub rsp, 32
\`\`\`

Unlike the \`sub\` in that sequence, \`enter\` leaves flags unchanged. The saved frame pointer is at \`[rbp]\`, and local storage lies below \`rbp\`. Nonzero nesting levels also copy enclosing frame pointers in 8-byte slots and push the new frame pointer. \`enterq\` explicitly selects this 64-bit frame size; \`leave\` can dismantle the frame.`
    ),

    enterw: `Creates a frame using 16-bit frame pointers: it saves \`bp\`, establishes a new \`bp\` and reserves the unsigned 16-bit byte count given by the first operand. The second operand supplies a nesting level modulo 32; omitting it selects zero. Saved frame-pointer slots are two bytes. In 64-bit mode the stack is still addressed through \`rsp\`; this is not the normal \`rbp\` frame used by 64-bit functions.`,

    enterd: `Creates a frame using 32-bit frame pointers in 16- or 32-bit code. The first operand reserves an unsigned 16-bit byte count for local storage; the second supplies a nesting level modulo 32, with zero assumed if omitted. This 32-bit operand-size form is unavailable in 64-bit mode.`,

    ...instructionDescriptions(
        ['leave', 'leaveq'],
        `Dismantles a 64-bit frame by setting \`rsp\` to \`rbp\`, then popping the saved \`rbp\`. It has the effect of \`mov rsp, rbp\` followed by \`pop rbp\` and leaves flags unchanged. It can match an \`enter\` frame or the usual explicit frame setup. \`leaveq\` explicitly selects the 64-bit form.`
    ),

    leavew: `Dismantles a frame with a 16-bit saved frame pointer. In 64-bit mode it sets \`rsp\` from \`rbp\`, then pops two bytes into \`bp\`, advancing \`rsp\` by 2. It leaves flags unchanged. This is distinct from the normal 64-bit \`leave\` / \`leaveq\` form.`,

    leaved: `Dismantles a 32-bit frame, with the effect of \`mov esp, ebp\` followed by \`pop ebp\` in 32-bit code. This operand-size form is unavailable in 64-bit mode.`,

    ...instructionDescriptions(
        ['ret', 'retn', 'retq', 'retnq'],
        `Returns from a near call. In 64-bit mode it pops an 8-byte return address from \`[rsp]\` into \`rip\` and advances \`rsp\` by 8. \`ret\` and \`retn\` are synonyms; the \`q\` suffix explicitly requests the 64-bit form.

The optional sole operand is an unsigned 16-bit count of additional bytes to remove from the stack after popping the return address. For example, \`ret 16\` advances \`rsp\` by 24 in total. A negative spelling does not subtract stack space: encoded \`0xffff\` means cleanup of 65535 bytes.`
    ),

    ...instructionDescriptions(
        ['retw', 'retnw'],
        `Requests a 16-bit near return. NASM accepts this spelling in 64-bit source with an operand-size prefix; ordinary 64-bit calls use \`ret\` or \`retq\`. In 16-bit code it pops a 16-bit offset into \`ip\`. The optional sole immediate operand is an unsigned 16-bit additional cleanup count, not a signed stack adjustment.`
    ),

    ...instructionDescriptions(
        ['retd', 'retnd'],
        `Returns to a 32-bit near offset in 16- or 32-bit code. The optional sole immediate operand is an unsigned 16-bit additional stack-cleanup byte count. This form is unavailable in 64-bit mode.`
    ),

    ...instructionDescriptions(
        ['retf', 'retfd', 'retfq', 'retfw'],
        `Returns across a code-segment boundary by restoring an offset and \`cs\` from the stack. The \`w\`, \`d\` and \`q\` suffixes select 16-, 32- and 64-bit offsets; \`retf\` defaults to a 32-bit offset in 64-bit mode, so a 64-bit far return requires \`retfq\`. Stack slots follow the selected operand size, rather than the packed layout of a far pointer in memory.

The optional sole operand is an unsigned 16-bit additional stack-cleanup byte count. Segment and privilege checks apply, and a privilege-changing return can also restore the stack pointer and stack segment. This is not the return used for an ordinary Linux function call; use near \`ret\` for that.`
    ),

    ...instructionDescriptions(
        ['pushf', 'pushfq', 'pushfw', 'pushfd'],
        `Pushes an image of the flags register. In 64-bit mode, \`pushf\` / \`pushfq\` subtract 8 from \`rsp\` and store a 64-bit image; \`pushfw\` subtracts 2 and stores the low 16 bits. \`pushfd\` is unavailable in this mode. The pushed 64-bit image has RF and VM cleared; it is not an exact copy of every bit of \`rflags\`.`
    ),

    ...instructionDescriptions(
        ['popf', 'popfq', 'popfw', 'popfd'],
        `Restores writable flags from a value popped from the stack. In 64-bit mode, \`popf\` / \`popfq\` consume 8 bytes using \`rsp\`; \`popfw\` consumes 2 and supplies the low 16 bits. \`popfd\` is unavailable in this mode.

Privilege and architectural rules limit which flags can change. In particular, ordinary user code cannot use this instruction to freely change IOPL or IF, and some flags retain their old values. Do not treat the operation as an unrestricted assignment to \`rflags\`.`
    ),

    div: `Performs unsigned division by the explicit register or memory divisor. The divisor width selects the implicit dividend, quotient and remainder:

| Divisor width | Dividend | Quotient | Remainder |
| --- | --- | --- | --- |
| 8 bits | \`ax\` | \`al\` | \`ah\` |
| 16 bits | \`dx:ax\` | \`ax\` | \`dx\` |
| 32 bits | \`edx:eax\` | \`eax\` | \`edx\` |
| 64 bits | \`rdx:rax\` | \`rax\` | \`rdx\` |

The register before the colon is the high half. For a dividend that fits in the low half, clear the high half first; for example, \`xor edx, edx\` before \`div rcx\`. A zero divisor or a quotient too large for its destination causes a divide error. Flags are undefined. Use \`idiv\` for signed division.`,

    idiv: `Performs signed division by the explicit register or memory divisor. The divisor width selects the implicit dividend and outputs: 8 bits divides \`ax\` into quotient \`al\` and remainder \`ah\`; 16 bits divides \`dx:ax\` into \`ax\` and \`dx\`; 32 bits divides \`edx:eax\` into \`eax\` and \`edx\`; 64 bits divides \`rdx:rax\` into \`rax\` and \`rdx\`.

The high half is part of the signed dividend. To divide a signed value held only in the low half, extend it first with \`cbw\`, \`cwd\`, \`cdq\` or \`cqo\` respectively. For example, \`cqo\` then \`idiv rcx\` divides signed \`rax\`. The quotient rounds toward zero; a nonzero remainder has the dividend's sign. A zero divisor or a quotient outside the destination's signed range causes a divide error. Flags are undefined.`,

    mul: `The one-operand form performs unsigned multiplication. Its explicit source width selects the implicit other factor and full product: 8 bits uses \`al\` and produces \`ax\`; 16 bits uses \`ax\` and produces \`dx:ax\`; 32 bits uses \`eax\` and produces \`edx:eax\`; 64 bits uses \`rax\` and produces \`rdx:rax\`. The register before the colon holds the high half. CF and OF are set when that high half is nonzero.

NASM also accepts two- and three-operand \`mul\` spellings as aliases of the corresponding \`imul\` forms. These keep only the destination-width low product; their overflow flags follow signed \`imul\` rules. Use the one-operand form when you need the full unsigned product.`,

    imul: `Performs signed multiplication. With one explicit source, its width selects the implicit factor and full product: 8 bits multiplies \`al\` into \`ax\`; 16 bits multiplies \`ax\` into \`dx:ax\`; 32 bits multiplies \`eax\` into \`edx:eax\`; 64 bits multiplies \`rax\` into \`rdx:rax\`.

With two operands, the destination register is multiplied by the source and keeps only the low destination-width bits. With three, the last two operands are multiplied into the first. \`imul rax, 5\` is shorthand for \`imul rax, rax, 5\`. CF and OF report whether the full signed product fits the destination width; other arithmetic flags are undefined.

${X86_SIGNED_IMMEDIATE_RULE}`,

    syscall: `Asks the operating system to do something. \`rax\` holds the call number, the arguments go in \`rdi\`, \`rsi\`, \`rdx\`, \`r10\`, \`r8\` and \`r9\` in that order, and the result comes back in \`rax\`, with a small negative number meaning an error. \`rcx\` and \`r11\` are destroyed by the call itself, so anything kept in them has to be saved first.

Programs here run as Linux programs, so this is the only way a program reaches the console or the file system. The [syscall page](/documentation/x86/syscall) lists the calls this emulator implements.`,

    mov: `Copies the source (second operand) into the destination (first operand). Register and memory data normally have the same width, and at most one operand can be memory.

Writing a 32-bit register clears the upper 32 bits of its 64-bit register: \`mov eax, -1\` leaves \`rax = 0x00000000ffffffff\`. Writing \`ax\` or \`al\` preserves the remaining bits of \`rax\`.

A register-immediate move can load all 64 bits: \`mov rax, 0x123456789abcdef0\` needs no special mnemonic. NASM chooses a shorter encoding when the same value can be obtained by a 32-bit register write or a sign-extended 32-bit immediate. For example, \`mov rax, 1\` can use the former, while \`mov rax, -1\` can use the latter. \`mov rax, strict qword 1\` forces the full 64-bit immediate field.

A move of an immediate directly into 64-bit memory has only a 32-bit immediate field, sign-extended to 64 bits. Thus \`mov qword [rdi], -1\` stores eight bytes of ones. To store an arbitrary 64-bit constant, first load it into a register, then store that register. A memory size such as \`qword\` specifies the stored width, not an immediate field of that width.

The accumulator memory-offset forms use \`al\`, \`ax\`, \`eax\` or \`rax\` and an absolute memory address; the address width and the data width are separate. \`CS\` cannot be a destination.`,

    movabs: `An explicit spelling for the full register-immediate encoding, or an accumulator move using an absolute memory offset. For example, \`movabs rax, 1\` keeps the full 64-bit immediate and is 10 bytes, whereas NASM can shorten \`mov rax, 1\` to a 32-bit register write. Both \`mov rax, 0x123456789abcdef0\` and \`movabs rax, 0x123456789abcdef0\` load the complete constant.

The byte, word and doubleword register-immediate forms use their respective immediate widths. The memory forms transfer data between an absolute address and \`al\`, \`ax\`, \`eax\` or \`rax\`. Use an explicit 64-bit memory offset in 64-bit code, for example \`movabs rax, [abs qword 0x1000]\`. Their lengths depend on the address and data widths. The 10-byte length applies to \`movabs reg64, imm64\`.`,

    cdqe: `Sign-extends \`eax\` into \`rax\`, filling bits 63–32 with copies of bit 31. It takes no operands and changes no other register or flags. For example, \`eax = 0xffffffff\` becomes \`rax = -1\`. NASM can assemble \`movsxd rax, eax\` to the same instruction.`,

    cqo: `Sign-extends \`rax\` into \`rdx:rax\`, filling \`rdx\` with copies of the sign bit. Use \`cqo\` before \`idiv rbx\` when the intended dividend is the signed 64-bit value in \`rax\`. \`idiv\` actually divides the signed 128-bit pair, so an unintended high half can produce a wrong quotient or a divide error. A deliberately prepared 128-bit dividend does not need this extension.`,

    movsx: `Copies a signed source into a register, repeating its sign bit when the destination is wider. For example, \`movsx rax, byte [rdi]\` turns a stored \`0xff\` into \`rax = -1\`, and \`movsx rax, ecx\` extends a signed 32-bit value to 64 bits.

For widening moves, the source width is independent of the destination width: \`byte\`, \`word\` and \`dword\` memory sources read 8, 16 and 32 bits. NASM also accepts equal-width and narrowing spellings. \`movsx ax, bx\` copies 16 bits; \`movsx ax, ebx\` retains the low 16 bits. These do not create a wider signed value. A 32-bit destination still clears the upper half of its 64-bit register.`,

    movsxb: `The byte-source spelling of \`movsx\`. It reads an 8-bit register or memory value and sign-extends it into a 16-, 32- or 64-bit destination register. For example, \`movsxb rax, [rdi]\` reads one byte. A 32-bit destination clears the upper half of its 64-bit register after producing the 32-bit result.`,

    movsxw: `The word-source spelling of \`movsx\`. It reads 16 bits and sign-extends them into a 32- or 64-bit destination. For example, \`movsxw rax, [rdi]\` reads two bytes. NASM also accepts a 16-bit destination; that copies the word without widening it. A 32-bit destination clears the upper half of its 64-bit register.`,

    movsxd: `The doubleword-source spelling of \`movsx\`. Its usual use is \`movsxd rax, ecx\`: copy 32 bits and sign-extend them to 64 bits. Writing \`eax\` with an ordinary move would instead clear bits 63–32 of \`rax\`.

NASM also accepts 32- and 16-bit destinations: \`movsxd eax, ecx\` copies the 32-bit value and clears the upper half of \`rax\`; \`movsxd ax, ecx\` retains the low 16 bits. Neither widens the source. \`movsxd rax, eax\` can use the same encoding as \`cdqe\`.`,

    movzx: `Copies an unsigned source into a register, filling added high bits with zeros. For example, \`movzx rax, byte [rdi]\` turns \`0xff\` into 255. The source has its own width; it need not match the destination.

For a 32-bit source and 64-bit destination, NASM uses an ordinary 32-bit move: \`movzx rax, ebx\` has the effect of \`mov eax, ebx\`, whose write clears the upper half of \`rax\`. \`movzxd\` is another spelling for this case.

Some accepted aliases do not widen: \`movzx ax, bx\` copies a word, while \`movzx ax, ebx\` retains only the low 16 bits. These leave the rest of \`rax\` unchanged. The equal-width 32-bit alias is unavailable in 64-bit mode; use \`mov eax, ebx\` for that copy.`,

    movzxb: `The byte-source spelling of \`movzx\`. It reads an unsigned byte and fills the added bits of a 16-, 32- or 64-bit destination with zeros. For example, \`movzxb rax, [rdi]\` reads one byte and produces a value from 0 to 255.`,

    movzxw: `The word-source spelling of \`movzx\`. It reads 16 bits and zero-extends them into a 32- or 64-bit destination. NASM also accepts a 16-bit destination; that copies the word without widening and preserves the remaining bits of the 64-bit register.`,

    movzxd: `Copies a 32-bit source into a 64-bit destination with zeros in the upper half. NASM assembles \`movzxd rax, ebx\` as \`mov eax, ebx\`: every 32-bit register write already clears the high 32 bits.

NASM also accepts a 16-bit destination, such as \`movzxd ax, ebx\`, which retains the low 16 bits and leaves the rest of \`rax\` unchanged. The equal-width 32-bit alias is unavailable in 64-bit mode; use an ordinary \`mov\` for that copy.`,

    lea: `Calculates an effective address without reading memory or changing flags. For example, \`lea rax, [rbx + rcx*4 + 8]\` stores that address calculation in \`rax\`. The brackets describe the calculation; they do not cause a load. NASM also accepts an absolute constant without brackets, such as \`lea rax, 0x1000\`.

In 64-bit mode the address calculation uses 64-bit registers by default, or 32-bit registers with the 32-bit address size; 16-bit addressing is unavailable. The destination independently selects a 16-, 32- or 64-bit result. A narrower destination retains the low bits, and a 32-bit register write clears its upper 32 bits. A 32-bit address calculation stored in a 64-bit destination is zero-extended.`,

    call: `Calls a procedure and saves the address of the following instruction on the stack. An ordinary near call in 64-bit code pushes an 8-byte return address using \`rsp\`; \`ret\` returns to that address.

\`call routine\` names a target address or label. NASM calculates a signed 32-bit displacement from the end of the call, so the target must be within that range (about ±2 GiB). The source operand is the target, not a displacement to add yourself. There is no direct near call with an embedded absolute 64-bit target.

\`call rax\` takes the full target address from \`rax\`. \`call [pointer]\` reads an 8-byte target address from memory. These indirect near calls can reach targets beyond the relative displacement range.

A far call also changes \`cs\`. Its memory pointer stores an offset followed by a 16-bit segment selector: \`word\`, \`dword\` and \`qword\` far pointers have 16-, 32- and 64-bit offsets, for totals of 4, 6 and 10 bytes. Immediate \`segment:offset\` calls are unavailable in 64-bit mode. Far transfers depend on valid operating-system segment descriptors and are not ordinary Linux function calls.`,

    jmp: `Transfers control unconditionally. \`jmp target\` names a label or target address; NASM calculates a displacement from the end of the instruction. A short jump uses a signed 8-bit displacement (−128 through 127 bytes); the ordinary longer near form in 64-bit mode uses a signed 32-bit displacement (about ±2 GiB), not an absolute 64-bit address.

NASM normally chooses a short encoding when the target fits. \`short\` requires that range; \`strict near\` prevents shortening to the 8-bit form.

\`jmp rax\` takes the full target address from the register, and \`jmp [pointer]\` reads an 8-byte target address from memory. These indirect near jumps have no relative displacement limit.

A far jump also changes \`cs\`. A far memory pointer contains the offset first, then a 16-bit selector: 16-, 32- and 64-bit offsets occupy 4, 6 and 10 bytes in total. Immediate \`segment:offset\` jumps are unavailable in 64-bit mode. Far transfers require valid operating-system segment descriptors and are not ordinary branches in a Linux program.`,

    push: `Subtracts 8 from \`rsp\` and stores a 64-bit value at the new stack top by default. For example, \`push rax\` saves eight bytes. A 16-bit operand is also available: \`push ax\` subtracts 2 and stores two bytes. There is no 32-bit general-purpose push in 64-bit mode: \`push eax\` is invalid.

An immediate field can be smaller than the stack value. The default 64-bit push sign-extends an 8-bit or 32-bit immediate to 64 bits: \`push -1\` stores eight bytes of ones. NASM chooses the short encoding when possible; \`push strict qword 1\` keeps the 32-bit immediate field while still pushing eight bytes. \`push word 1\` instead pushes two bytes. No push encodes a full 64-bit immediate; load an arbitrary 64-bit constant into a register, then push it.

The stack pointer remains \`rsp\` in 64-bit mode. An address-size prefix changes how an explicit memory source is addressed, not which stack pointer the push uses. Only \`fs\` and \`gs\` segment pushes are available in this mode; \`push cs\`, \`push ds\`, \`push es\` and \`push ss\` are unavailable.`,

    pop: `Loads the 64-bit value at \`[rsp]\` into the destination, then adds 8 to \`rsp\` by default. A 16-bit operand pops two bytes instead: \`pop ax\` adds 2. There is no 32-bit general-purpose pop in 64-bit mode, so \`pop eax\` is invalid. Popping into \`rsp\` replaces it with the loaded value.

An address-size prefix changes an explicit memory destination's addressing, not the stack pointer used to read the value. For a memory destination based on \`rsp\`, the destination address is calculated after the stack increment. Only \`fs\` and \`gs\` segment pops are available in 64-bit mode; loading them is subject to segment-selector checks.`,

    ...Object.fromEntries(
        ['movs', 'cmps', 'lods', 'stos', 'scas'].flatMap((family) =>
            [
                ['b', 1, 'al'],
                ['w', 2, 'ax'],
                ['d', 4, 'eax'],
                ['q', 8, 'rax']
            ].map(([suffix, bytes, accumulator]) => {
                const operations: Record<string, string> = {
                    movs: 'Copies the element at `[rsi]` to `[rdi]` without changing flags.',
                    cmps: 'Sets flags as if subtracting the element at `[rdi]` from the element at `[rsi]`, without storing a result.',
                    lods: `Loads the element at \`[rsi]\` into \`${accumulator}\` without changing flags.`,
                    stos: `Stores \`${accumulator}\` at \`[rdi]\` without changing flags.`,
                    scas: `Sets flags as if subtracting the element at \`[rdi]\` from \`${accumulator}\`, without storing a result.`
                }
                const operation = operations[family]
                const registers =
                    family === 'movs' || family === 'cmps'
                        ? '`rsi` and `rdi`'
                        : family === 'lods'
                          ? '`rsi`'
                          : '`rdi`'
                const addressRegisters =
                    family === 'movs' || family === 'cmps'
                        ? '`esi` and `edi`'
                        : family === 'lods'
                          ? '`esi`'
                          : '`edi`'
                const repetition =
                    family === 'cmps' || family === 'scas'
                        ? '`repe` / `repz` repeats while ZF = 1, and `repne` / `repnz` repeats while ZF = 0. Each stops when the counter reaches zero; a nonzero initial counter permits the first comparison before testing its result.'
                        : '`rep` repeats until the counter reaches zero.'
                const distinction =
                    suffix === 'd' && (family === 'cmps' || family === 'movs')
                        ? ' This describes the no-operand string instruction; operand forms using XMM registers perform separate scalar floating-point operations.'
                        : ''
                return [
                    `${family}${suffix}`,
                    `${operation}${distinction}

The ${suffix} suffix selects an element of ${bytes} byte${bytes === 1 ? '' : 's'}. After each element, the instruction increases ${registers} by ${bytes} when DF = 0, or decreases ${registers} by ${bytes} when DF = 1. In 64-bit mode the default addresses use ${registers}. The \`a32\` address-size prefix instead uses ${addressRegisters}; 16-bit string addressing is unavailable.

${repetition} The counter is \`rcx\` by default or \`ecx\` with \`a32\`. If it starts at zero, a repeated instruction accesses no element. The data width is independent of this address and counter width.`
                ]
            })
        )
    ),

    ...Object.fromEntries(
        ['ins', 'outs'].flatMap((family) =>
            [
                ['b', 1],
                ['w', 2],
                ['d', 4]
            ].map(([suffix, bytes]) => {
                const input = family === 'ins'
                const operation = input
                    ? 'Reads an element from the I/O port numbered in `dx` into `[rdi]`.'
                    : 'Writes the element at `[rsi]` to the I/O port numbered in `dx`.'
                return [
                    `${family}${suffix}`,
                    `${operation} The ${suffix} suffix selects ${bytes} byte${bytes === 1 ? '' : 's'} per element; no quadword form exists. Flags are unchanged.

After the transfer, \`${input ? 'rdi' : 'rsi'}\` increases by ${bytes} when DF = 0 or decreases by ${bytes} when DF = 1. In 64-bit mode addresses use this 64-bit register by default; \`a32\` selects \`${input ? 'edi' : 'esi'}\`. The \`rep\` prefix repeats using \`rcx\`, or \`ecx\` with \`a32\`, as the counter. A zero initial repeat count performs no transfer. Access to I/O ports is subject to operating-system privilege checks.`
                ]
            })
        )
    ),

    bswap: `Reverses the byte order of a 32- or 64-bit register. For example, \`bswap rax\` exchanges byte 0 with byte 7, byte 1 with byte 6, and so on. A 32-bit result also clears the register's upper 32 bits. There is no defined 16-bit form; \`xchg al, ah\` swaps the bytes of \`ax\`.`
}

/** Corrected visible one-line summaries where the imported assembler text has obvious typos. */
export const X86_SUMMARY_OVERRIDES: Record<string, string> = {
    vcvtph2qq:
        'Convert packed half-precision floating-point values to packed signed quadword integers',
    vcvtps2qq:
        'Convert packed single-precision floating-point values to packed signed quadword integers',
    vcvttph2qq:
        'Convert packed half-precision floating-point values to packed signed quadword integers with truncation',
    vcvttps2qq:
        'Convert packed single-precision floating-point values to packed signed quadword integers with truncation',
    vbcstnebf162ps: 'Load and convert one BF16 value, broadcasting it across packed FP32 elements'
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
 * The condition suffixes of `jcc`, `setcc` and `cmovcc`. The appendix that supplies the prose
 * points at a table of these and does not contain it, so this one is written here.
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

export type X86RegisterFileEntry = {
    name: string
    /** The width the registers panel shows the register at, in bits. */
    bits: number
    description: string
}

/**
 * A register file beside the general purpose registers, in the order the registers panel offers its
 * tabs. The floating point state is not a set of extra general registers: it comes with its own
 * instructions and its own conventions, and the intro is where those are explained.
 */
export type X86RegisterFileDoc = {
    /**
     * The anchor of the section on the page, and the tab the registers panel shows the file
     * under.
     */
    id: string
    title: string
    /** Markdown, shown once above the registers of the file. */
    intro: string
    registers: X86RegisterFileEntry[]
}

export const X86_DOCUMENTED_REGISTER_FILES: X86RegisterFileDoc[] = [
    {
        id: 'sse',
        title: 'SSE registers',
        intro: 'Floating point arithmetic in a 64 bit program is SSE arithmetic. The `xmm` registers are wide enough to hold several numbers at once, and each instruction says how much of a register it means: the **scalar** forms work on the lowest lane alone, so `addsd xmm0, xmm1` adds one pair of doubles and `cvtsi2sd xmm0, rax` turns an integer into a double and writes it into that same lowest lane, both of them leaving the upper lane of the destination as they found it. The moves are the exception: `movsd xmm0, [x]` loads one double from memory and clears bits 127 to 64, while `movsd xmm0, xmm1` copies the low double and leaves the upper lane alone, so where the value came from decides what the rest of the register holds. The **packed** forms, `addpd` and `mulps` among them, apply the same operation to every lane of the register at once, which is the reason the registers are this wide.\n\nThe single precision instructions are spelled with `ss` and `ps` where the double precision ones use `sd` and `pd`, and the calling convention passes floating point arguments in `xmm0` to `xmm7` and returns them in `xmm0`.',
        registers: [
            {
                name: 'xmm0 to xmm15',
                bits: 128,
                description:
                    'Sixteen 128 bit registers. Read as doubles they are two lanes, read as singles four, and read as raw bits sixteen bytes; the registers panel shows all three, because nothing in the register itself records which one the program meant.'
            },
            {
                name: 'mxcsr',
                bits: 32,
                description:
                    'The control and status register of the unit. It holds the rounding mode, the masks that decide whether an invalid operation raises an exception or quietly produces a NaN, and the flags that record which of those conditions has happened since the flags were last cleared. `ldmxcsr` and `stmxcsr` move it to and from memory.'
            }
        ]
    },
    {
        id: 'x87',
        title: 'x87 registers',
        intro: 'The x87 unit is the floating point hardware x86 had before SSE, and it is still what the `f` instructions use. Its eight registers are a **stack** rather than a numbered file: `st0` is always the top, `fld` and `fld1` push a value onto it and rename everything below, and `faddp` adds the top two and pops, so the same register name means a different value after every push. Programs written today use SSE for arithmetic and reach for x87 mainly for the operations SSE has no instruction for, such as `fsin`, `fcos` or `fpatan`.\n\nThis emulator keeps the stack as ordinary 64 bit doubles rather than the 80 bit extended values real hardware computes with, so a long chain of x87 arithmetic can differ from a physical processor in the last bits of the result.\n\nA slot the stack has not filled, or has popped, keeps whatever bits it last held. The panel shows those rows blank rather than the stale value, the way `info float` prints Empty in gdb, and the bits are still a hover away; `ftag` is the register that says which slots are live.',
        registers: [
            {
                name: 'st0 to st7',
                bits: 64,
                description:
                    'The stack registers, listed top first: what the panel calls `st0` is whatever the last push left on top, and one more push moves that value to `st1`. An instruction that pops past the bottom of the stack, or pushes onto a full one, raises the stack fault the status word reports.'
            },
            {
                name: 'fctrl',
                bits: 16,
                description:
                    'The control word: the rounding mode, the precision the unit rounds results to, and the masks that say which exceptions the program wants to be told about. `fldcw` writes it, which is how code that needs truncation rather than the default round to nearest gets it. The precision field has nothing to decide here, because the stack already holds doubles.'
            },
            {
                name: 'fstat',
                bits: 16,
                description:
                    'The status word: the exception flags, the condition codes a comparison such as `fcom` writes, and the three bits that say which register is currently the top of the stack. `fstsw ax` copies it into `ax`, which is how an x87 comparison used to reach a conditional jump.'
            },
            {
                name: 'ftag',
                bits: 16,
                description:
                    'Two bits per register saying whether it holds a number, a zero, a special value such as an infinity, or nothing at all. It is what makes an empty stack slot distinguishable from one holding zero, and what the panel reads to decide which rows to leave blank.'
            }
        ]
    }
]

// --- the assembler ------------------------------------------------------------------------------

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

// --- syscalls -----------------------------------------------------------------------------------

export const x86SyscallMap = new Map<string, X86Syscall>(
    X86_SYSCALLS.map((syscall) => [syscall.name, syscall])
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
    stat: 'Reads file metadata for the path at `rdi` and writes it to the Linux `struct stat` buffer at `rsi`.',
    lstat: 'Like `stat`, but reports a symbolic link itself instead of the file it points to. Writes a Linux `struct stat` to the buffer at `rsi`.',
    fstat: 'Reads file metadata for the descriptor in `rdi` and writes it to the Linux `struct stat` buffer at `rsi`.',
    poll: 'Waits for the `pollfd` array at `rdi` to report requested events, checking `rsi` entries for up to `rdx` milliseconds. A negative timeout waits without a time limit.',
    select: 'Takes the descriptor limit in `rdi`, pointers to the read, write, and exception sets in `rsi`, `rdx`, and `r10`, and an optional timeout in `r8`. Waits until a descriptor is ready or the timeout expires, then updates the sets and timeout.',
    exit: 'Ends the program with the status in `rdi`. It never returns, and a program that reaches the end of its code without calling it runs into whatever bytes follow.',
    exit_group:
        'Ends every thread of the program with the status in `rdi`. For a program with one thread it is `exit`.',
    mmap: 'Maps memory: the length in `rsi`, the protection in `rdx`, the flags in `r10`. An anonymous private mapping is how a program asks for a block of memory it can write to. A `MAP_PRIVATE` mapping of a Project File copies its bytes into memory; writes to the mapping stay in memory. A `MAP_SHARED` mapping of a Project File returns `-ENODEV`.',
    mprotect:
        'Changes the read, write, or execute permissions of the `rsi` bytes starting at the page-aligned address in `rdi`.',
    munmap: 'Unmaps the mapping of `rsi` bytes at the address in `rdi`.',
    brk: 'Sets the end address of the heap area. Returns the current break; a request the emulator cannot satisfy leaves it unchanged.',
    pipe: 'Creates a pair of connected file descriptors and writes both integers to the two-element array at `rdi`; reads from one end receive bytes written to the other.',
    dup: 'Returns a new file descriptor that refers to the same open file description as the descriptor in `rdi`.',
    dup2: 'Makes descriptor `rsi` refer to the same open file description as `rdi`, closing the old `rsi` first if needed.',
    readv: 'Reads into the buffers listed by the `iovec` array at `rsi`, with `rdx` entries, from the descriptor in `rdi`; returns the total bytes read. An error in a later buffer can be returned after earlier buffers have already changed, rather than returning the earlier partial byte count. Check those buffers before retrying after an error.',
    writev: 'Writes the buffers listed by the `iovec` array at `rsi`, with `rdx` entries, to the descriptor in `rdi`; returns the total bytes written. The buffers are gathered into one payload before writing. If a capacity limit refuses the write, none of that payload is written.',
    pwritev:
        'Writes the buffers listed by the `iovec` array at `rsi`, with `rdx` entries, to the descriptor in `rdi` at the offset in `r10`; returns the total bytes written without changing the descriptor’s position. The buffers are gathered into one payload before writing. If a capacity limit refuses the write, none of that payload is written.',
    nanosleep: 'Sleeps for the interval at `rdi`, a pair of seconds and nanoseconds.',
    getpid: 'Returns the process id.',
    clock_gettime: `Writes the clock selected by \`rdi\` to the \`timespec\` structure at \`rsi\` (seconds and nanoseconds).

\`CLOCK_REALTIME\`, \`CLOCK_REALTIME_COARSE\` and \`CLOCK_TAI\` report Unix epoch time: host calendar time interactively, and 2000-01-01 UTC plus virtual elapsed time in Testcases. \`CLOCK_TAI\` shares realtime without a leap-second offset.

\`CLOCK_PROCESS_CPUTIME_ID\` and \`CLOCK_THREAD_CPUTIME_ID\` count executed instructions at nominal 100 MHz, exclude waiting time, and rewind with Undo. Monotonic clocks and \`CLOCK_BOOTTIME\` report elapsed time; virtual elapsed time advances only through waits.`,
    time: 'Returns calendar time in whole seconds since the Unix epoch, and also stores it at the address in `rdi` unless `rdi` is 0. Interactive runs use host calendar time; Testcases use 2000-01-01 UTC plus virtual elapsed time.',
    getitimer:
        'Writes the remaining delay and repeat interval of the timer selected by `rdi` to the `itimerval` structure at `rsi`. Only `ITIMER_REAL` is supported. `ITIMER_VIRTUAL` and `ITIMER_PROF` return `-EOPNOTSUPP`.',
    setitimer:
        'Sets the timer selected by `rdi` from the `itimerval` structure at `rsi`, and writes the previous settings at `rdx` when that pointer is nonzero. Only `ITIMER_REAL` is supported; it sends `SIGALRM` when its delay expires. `ITIMER_VIRTUAL` and `ITIMER_PROF` return `-EOPNOTSUPP`.',
    wait4: 'Returns `-ECHILD` immediately because this environment has no child processes.',
    ioctl: 'Asks a device the descriptor in `rdi` refers to for something outside the ordinary read and write interface, chosen by the request in `rsi`.',
    sendfile:
        'Copies up to `r10` bytes from the input descriptor in `rsi` to the output descriptor in `rdi`, optionally updating the input position through the pointer in `rdx`.',
    getcwd: 'Writes the current working directory as a NUL-terminated path to the buffer at `rdi`, up to `rsi` bytes.',
    chdir: 'Changes the program’s current working directory to the path at `rdi`.',
    fchdir: 'Changes the program’s current working directory to the directory referred to by descriptor `rdi`.',
    rename: 'Renames or moves the path at `rdi` to the path at `rsi`. Within `/project`, moving a directory returns `-EISDIR` and replacing an existing destination File returns `-EEXIST`.',
    renameat:
        'Renames or moves the path at `rsi`, relative to the directory descriptor in `rdi`, to the path at `r10`, relative to the directory descriptor in `rdx`. Within `/project`, moving a directory returns `-EISDIR` and replacing an existing destination File returns `-EEXIST`.',
    renameat2:
        'Renames or moves paths relative to the directory descriptors in `rdi` and `rdx`, using the flags in `r8`. `RENAME_NOREPLACE` refuses an existing destination; `RENAME_EXCHANGE` swaps two existing names. Within `/project`, directory moves return `-EISDIR` and an ordinary rename that would replace an existing File returns `-EEXIST`.',
    mkdir: 'Requests a directory at the path in `rdi`, with the mode in `rsi`. Creating an empty directory under `/project` is unsupported and returns `-EOPNOTSUPP`: Project directories exist only as prefixes of File paths.',
    mkdirat:
        'Requests a directory at the path in `rsi`, relative to the directory descriptor in `rdi`, with the mode in `rdx`. Creating an empty directory under `/project` is unsupported and returns `-EOPNOTSUPP`: Project directories exist only as prefixes of File paths.',
    rmdir: 'Requests removal of the empty directory named by the path at `rdi`. Project directories cannot be removed this way: they exist only as prefixes of File paths and disappear when their last File is removed.',
    unlink: 'Removes the directory entry named by the path at `rdi`; an open file remains available through its descriptor. Under `/project`, removing a directory’s last File also removes that implicit directory.',
    uname: 'Writes system name and version fields to the Linux `struct utsname` buffer at `rdi`.',
    gettimeofday:
        'Writes calendar time since the Unix epoch, in seconds and microseconds, to the `timeval` structure at `rdi`. Interactive runs use host calendar time; Testcases use 2000-01-01 UTC plus virtual elapsed time.',
    getrusage:
        'Writes resource-usage counters for the selected process or children to the `rusage` structure at `rsi`.',
    sysinfo:
        'Writes the emulator’s uptime, memory, and process-count values to a Linux `struct sysinfo` buffer at `rdi`.',
    getgroups:
        'Writes up to `rdi` supplementary group IDs to the array at `rsi`; with a zero size, returns how many IDs are needed.',
    setgroups:
        'Replaces the process’s supplementary group list with the `rdi` group IDs in the array at `rsi`.',
    rt_sigreturn:
        'Returns from a signal handler: restores the registers and the signal mask saved when the signal arrived, and carries on where the program was interrupted. A handler does not make this call itself: it returns into the restorer registered with `rt_sigaction`, and the restorer makes it.'
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
    clock_gettime: ['clock', 'timespec'],
    time: ['buffer (written by the kernel)']
}

/** What each argument of a call is, in register order: rdi, rsi, rdx, r10, r8, r9. */
export function x86SyscallArgs(syscall: X86Syscall): string[] {
    const written = X86_SYSCALL_ARGS[syscall.name]
    if (written) return written
    if (syscall.args.length > 0)
        return syscall.args.map((label, index) => {
            const override = X86_SIM_ARGUMENT_OVERRIDES[syscall.name]?.[index]
            return override
                ? override.type === 'long'
                    ? override.name
                    : `${override.name} (${override.type === 'const void *' ? 'read by' : 'written by'} the kernel)`
                : label
        })
    // Untraced and unwritten: say how many it takes rather than inventing names for them.
    return Array.from({ length: syscall.arity }, (_, index) => `arg${index + 1}`)
}
