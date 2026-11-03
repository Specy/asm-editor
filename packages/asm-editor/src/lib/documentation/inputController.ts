import {
    INPUT_BASE,
    INPUT_KEY_TABLE,
    INPUT_KINDS,
    INPUT_QUEUE_DEPTH,
    INPUT_REGISTERS,
    inputKeyName,
    type InputKey
} from '#lib/languages/inputControllerRegisters.ts'
import { MARS_RECEIVER_CONTROL } from '#lib/languages/mars/MarsDevices.ts'
import { fillPlaceholders, proseEntries, type DocumentationEntry } from './entries'
import template from './inputController.md?raw'

/**
 * The **Input controller** chapter of MIPS and RISC-V, one text for both
 * ([the design record](../../../../../docs/design/input-controller.md)): the tables come from
 * `inputControllerRegisters.ts`, which the device itself reads, and only the examples, the
 * reference simulator and RISC-V 64's notes vary.
 */

type Variant = 'MIPS' | 'RISC-V'

function hex(value: number, digits = 2): string {
    return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`
}

function fence(language: string, code: string): string {
    return `\`\`\`${language}\n${code}\n\`\`\``
}

const asm = (variant: Variant, code: string) => fence(variant === 'MIPS' ? 'mips' : 'riscv', code)

const ACCESS: Record<(typeof INPUT_REGISTERS)[number]['access'], string> = {
    read: 'read',
    write: 'write',
    pop: 'read, takes an event'
}

function registerTable(): string {
    return [
        '| Offset | Register | In C | Access | What it holds |',
        '| --- | --- | --- | --- | --- |',
        ...INPUT_REGISTERS.map(
            (register) =>
                `| \`${hex(register.offset)}\` | ${register.name[0]}${register.name.slice(1).toLowerCase()} | \`SIM_INPUT_${register.name}\` | ${ACCESS[register.access]} | ${register.description} |`
        ),
        '| `0x14`–`0x1F` | Reserved | | | 0, kept for later |'
    ].join('\n')
}

function fieldTable(): string {
    return [
        '| Bits | Field | What it holds |',
        '| --- | --- | --- |',
        '| 31 | | always 0 |',
        '| 30–21 | y | the pointer’s row when the event happened, 0 to 1023 |',
        '| 20–11 | x | the pointer’s column, 0 to 1023 |',
        '| 10–8 | kind | what happened, from the table below |',
        '| 7–0 | code | which key or button, or how far the wheel turned |'
    ].join('\n')
}

function kindTable(): string {
    return [
        '| Kind | In C | Meaning |',
        '| --- | --- | --- |',
        ...INPUT_KINDS.map(
            (kind) =>
                `| ${kind.value} | ${kind.value === 0 ? '' : `\`SIM_INPUT_${kind.name}\``} | ${kind.description} |`
        )
    ].join('\n')
}

/** The keys in the groups the table shows them in, each in the order of its codes. */
const KEY_GROUPS: [title: string, test: (key: InputKey) => boolean][] = [
    ['Letters and digits', (key) => key.usage <= 0x27],
    ['Typing keys', (key) => key.usage >= 0x28 && key.usage <= 0x39],
    ['Function keys', (key) => /^F\d+$/.test(key.code)],
    [
        'Navigation',
        (key) =>
            (key.usage >= 0x46 && key.usage <= 0x52) ||
            key.code === 'ContextMenu' ||
            key.code === 'Help'
    ],
    ['Keypad', (key) => key.code.startsWith('Num')],
    ['Modifiers', (key) => key.usage >= 0xe0],
    ['International', () => true]
]

function keyTable(): string {
    const keys = INPUT_KEY_TABLE.filter((key) => !key.alias)
    const placed = new Set<InputKey>()
    return KEY_GROUPS.map(([title, test]) => {
        const group = keys.filter((key) => !placed.has(key) && test(key))
        for (const key of group) placed.add(key)
        return [
            `**${title}**`,
            '',
            '| Key | Code | In C |',
            '| --- | --- | --- |',
            ...group.map(
                (key) =>
                    `| \`${key.code}\` | \`${hex(key.usage)}\` | \`SIM_KEY_${inputKeyName(key.code)}\` |`
            )
        ].join('\n')
    }).join('\n\n')
}

/** Every key as an assembler constant, `.eqv KEY_A 0x04` on MARS and `.eqv KEY_A, 0x04` on RARS. */
function eqvLines(variant: Variant): string {
    const separator = variant === 'MIPS' ? ' ' : ', '
    const lines = INPUT_KEY_TABLE.filter((key) => !key.alias).map(
        (key) => `.eqv KEY_${inputKeyName(key.code)}${separator}${hex(key.usage)}`
    )
    return asm(variant, lines.join('\n'))
}

const FIRST_EXAMPLE: Record<Variant, string> = {
    MIPS: `        .text
main:   li      $s0, 0xffff0300 # the Input controller
        lw      $t0, 0($s0)     # ID: 0x494E5001 when it is there
        srl     $t0, $t0, 8
        li      $t1, 0x494E50   # "INP"
        bne     $t0, $t1, absent
poll:   lw      $t0, 8($s0)     # Status: how many events wait
        beqz    $t0, idle
        lw      $t2, 12($s0)    # Event: take the oldest one
        srl     $t3, $t2, 8
        andi    $t3, $t3, 7     # its kind
        andi    $t4, $t2, 0xff  # its code
        li      $t5, 1          # kind 1: a key went down
        bne     $t3, $t5, poll
        li      $t5, 0x29       # Escape
        beq     $t4, $t5, done
        addi    $t5, $t4, -0x4F # the arrows are 0x4F to 0x52
        sltiu   $t6, $t5, 4
        beqz    $t6, poll       # another key
        la      $t6, arrows
        add     $t6, $t6, $t5
        lb      $a0, 0($t6)     # R, L, D or U
        li      $v0, 11
        syscall
        j       poll
idle:   li      $a0, 16         # nothing waits: sleep a frame
        li      $v0, 32
        syscall
        j       poll
absent: la      $a0, missing
        li      $v0, 4
        syscall
done:   li      $v0, 10
        syscall
        .data
arrows: .ascii  "RLDU"
missing:.asciiz "This simulator has no Input controller.\\n"`,
    'RISC-V': `        .text
main:   li      s0, 0xffff0300  # the Input controller
        lw      t0, 0(s0)       # ID: 0x494E5001 when it is there
        srli    t0, t0, 8
        li      t1, 0x494E50    # "INP"
        bne     t0, t1, absent
poll:   lw      t0, 8(s0)       # Status: how many events wait
        beqz    t0, idle
        lw      t2, 12(s0)      # Event: take the oldest one
        srli    t3, t2, 8
        andi    t3, t3, 7       # its kind
        andi    t4, t2, 0xff    # its code
        li      t5, 1           # kind 1: a key went down
        bne     t3, t5, poll
        li      t5, 0x29        # Escape
        beq     t4, t5, done
        addi    t5, t4, -0x4F   # the arrows are 0x4F to 0x52
        sltiu   t6, t5, 4
        beqz    t6, poll        # another key
        la      t6, arrows
        add     t6, t6, t5
        lb      a0, 0(t6)       # R, L, D or U
        li      a7, 11
        ecall
        j       poll
idle:   li      a0, 16          # nothing waits: sleep a frame
        li      a7, 32
        ecall
        j       poll
absent: la      a0, missing
        li      a7, 4
        ecall
done:   li      a7, 10
        ecall
        .data
arrows: .ascii  "RLDU"
missing:.asciz  "This simulator has no Input controller.\\n"`
}

const DECODE_EXAMPLE: Record<Variant, string> = {
    MIPS: `        lw      $t0, 12($s0)    # one event
        srl     $t1, $t0, 8
        andi    $t1, $t1, 7     # kind, bits 10-8
        andi    $t2, $t0, 0xff  # code, bits 7-0
        srl     $t3, $t0, 11
        andi    $t3, $t3, 0x3ff # x, bits 20-11
        srl     $t4, $t0, 21    # y, bits 30-21: bit 31 is 0
        sll     $t5, $t0, 24
        sra     $t5, $t5, 24    # a wheel's code as a signed number of notches`,
    'RISC-V': `        lw      t0, 12(s0)      # one event
        srli    t1, t0, 8
        andi    t1, t1, 7       # kind, bits 10-8
        andi    t2, t0, 0xff    # code, bits 7-0
        srli    t3, t0, 11
        andi    t3, t3, 0x3ff   # x, bits 20-11
        srli    t4, t0, 21      # y, bits 30-21: bit 31 is 0
        slli    t5, t0, 24
        srai    t5, t5, 24      # a wheel's code as a signed number of notches`
}

const KEY_STATE_EXAMPLE: Record<Variant, string> = {
    MIPS: `        lbu     $t0, 0x2a($s0)  # keys 0x50 to 0x57
        andi    $t0, $t0, 1     # bit 0: the left arrow, 0x50
        bnez    $t0, left       # held: move left this frame`,
    'RISC-V': `        lbu     t0, 0x2a(s0)    # keys 0x50 to 0x57
        andi    t0, t0, 1       # bit 0: the left arrow, 0x50
        bnez    t0, left        # held: move left this frame`
}

const C_EXAMPLE = `#include <sim.h>

SIM_SCREEN(screen, 64, 64, 1);

int main(void) {
    if (!sim_input_present()) {
        sim_print_string("This simulator has no Input controller.\\n");
        return 1;
    }
    unsigned x = 32, y = 32;
    for (;;) {
        while (sim_input_pending()) {
            unsigned event = sim_input_event();
            unsigned kind = SIM_INPUT_KIND(event);
            if (kind == SIM_INPUT_KEY_DOWN && SIM_INPUT_CODE(event) == SIM_KEY_ESCAPE)
                return 0;
            /* a left click paints the word under the pointer */
            if (kind == SIM_INPUT_BUTTON_DOWN && SIM_INPUT_CODE(event) == SIM_INPUT_BUTTON_LEFT)
                screen[SIM_INPUT_Y(event) * 64 + SIM_INPUT_X(event)] = sim_rgb(255, 255, 0);
        }
        screen[y * 64 + x] = 0;
        if (sim_input_key_down(SIM_KEY_ARROW_LEFT) && x > 0) x--;
        if (sim_input_key_down(SIM_KEY_ARROW_RIGHT) && x < 63) x++;
        if (sim_input_key_down(SIM_KEY_ARROW_UP) && y > 0) y--;
        if (sim_input_key_down(SIM_KEY_ARROW_DOWN) && y < 63) y++;
        screen[y * 64 + x] = sim_rgb(0, 200, 255);
        sim_sleep(16);
    }
}`

const RISCV64_NOTES = `## On RISC-V 64 {#risc-v-64}

The same programs run on RISC-V 64, with the same addresses: \`li s0, 0xffff0300\` reaches the registers there too. \`lw\` fills the upper half of a 64-bit register with copies of bit 31, and bit 31 of every Input controller word is 0, so \`lw\` gives the same value as on RISC-V 32. Read Event with \`lw\`, not \`ld\`: an \`ld\` that covers the Event register takes an event too, and then its Status half already counts one event fewer. In C, \`unsigned\` is 32 bits on both, so the \`SIM_INPUT_\` macros give the same results.

`

const SIMULATOR: Record<Variant, string> = { MIPS: 'MARS', 'RISC-V': 'RARS' }

export function inputControllerEntries(
    variant: Variant,
    language: 'mips' | 'risc-v',
    chapterHref: string
): DocumentationEntry[] {
    const markdown = fillPlaceholders(template, {
        route: language,
        simulator: SIMULATOR[variant],
        base: `0x${INPUT_BASE.toString(16)}`,
        receiver: `0x${(MARS_RECEIVER_CONTROL >>> 0).toString(16)}`,
        depth: String(INPUT_QUEUE_DEPTH),
        firstExample: asm(variant, FIRST_EXAMPLE[variant]),
        registerTable: registerTable(),
        fieldTable: fieldTable(),
        kindTable: kindTable(),
        decodeExample: asm(variant, DECODE_EXAMPLE[variant]),
        keyStateExample: asm(variant, KEY_STATE_EXAMPLE[variant]),
        cExample: fence('c', C_EXAMPLE),
        riscv64: variant === 'RISC-V' ? RISCV64_NOTES : '',
        keyTable: keyTable(),
        eqvLines: eqvLines(variant)
    })
    return proseEntries({ language, chapter: 'input-controller', chapterHref, markdown })
}
