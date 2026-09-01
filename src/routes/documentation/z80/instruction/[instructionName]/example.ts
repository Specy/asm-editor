/**
 * Builds the little program that the interactive editor on an instruction page starts with.
 *
 * There are 1296 assemblable forms behind 68 mnemonics, so the examples are generated from the
 * instruction table instead of being written by hand: pick the form a programmer is most likely to
 * meet first, fill its operand placeholders with concrete values, and load the registers it reads
 * so that running the program actually shows something happening. Every generated program is
 * checked against the real assembler by a probe; keep it that way when changing the rules here.
 */

import type { Z80InstructionVariant } from '$lib/languages/Z80/Z80-documentation'

/** Where the examples assemble, matching the base code of a new Z80 project. */
const ORG = '0x8000'
/** Scratch memory, well above the few bytes of code the examples assemble to. */
const SCRATCH = '0x9000'

/**
 * The value each register is preloaded with. They are all different so that the effect of the
 * instruction is visible in the register panel instead of being a wall of zeroes, and the 16 bit
 * pairs point at (or below) the scratch area so that `(hl)` style operands stay out of the code.
 */
const REGISTER_SETUP_VALUES: Record<string, string> = {
    a: '5',
    b: '3',
    c: '2',
    d: '1',
    e: '4',
    h: '0x90',
    l: '0x00',
    ixh: '0x90',
    ixl: '0x00',
    iyh: '0x90',
    iyl: '0x00',
    bc: '0x0234',
    de: '0x1000',
    hl: SCRATCH,
    ix: SCRATCH,
    iy: SCRATCH
}

/** Operand placeholders of the instruction table, and what the examples put in their place. */
const OPERAND_VALUES: Record<string, string> = {
    nn: '5',
    nnnn: SCRATCH,
    dd: '2'
}

/**
 * Instructions that read or write A without naming it, so the example has to give A a value for
 * the result to be interesting.
 */
const IMPLICIT_ACCUMULATOR = new Set([
    'add',
    'adc',
    'sub',
    'sbc',
    'and',
    'or',
    'xor',
    'cp',
    'neg',
    'cpl',
    'daa',
    'rla',
    'rra',
    'rlca',
    'rrca',
    'rld',
    'rrd'
])

/** Mnemonics whose relative target is idiomatically backwards, i.e. the top of a loop. */
const LOOPING_MNEMONICS = new Set(['djnz'])

type ExampleFragments = {
    /** Lines inserted between the `.org` and the instruction. */
    setup: string[]
    /** Lines appended after the terminating `halt`, typically the data the instruction walks over. */
    trailer?: string[]
}

/**
 * The instructions whose operands live in registers the mnemonic never mentions: the block moves
 * walk HL/DE/BC, the block I/O instructions walk HL and count with B on the port in C, and `rld`
 * rotates a nibble through `(hl)`. Left to the generic rules they would run with every register at
 * zero, which for `ldir` means copying 64 KB over the program itself.
 */
const IMPLICIT_SETUP: Record<string, ExampleFragments> = {
    djnz: { setup: ['ld b, 3'] },
    exx: { setup: ['ld bc, 0x0234', 'ld de, 0x1000', `ld hl, ${SCRATCH}`] },
    ex: { setup: ['ld a, 5'] },
    pop: { setup: ['ld bc, 0x1234', 'push bc'] },
    ldi: { setup: ['ld hl, source', `ld de, ${SCRATCH}`, 'ld bc, 4'], trailer: ['DATA'] },
    ldir: { setup: ['ld hl, source', `ld de, ${SCRATCH}`, 'ld bc, 4'], trailer: ['DATA'] },
    ldd: { setup: ['ld hl, source + 3', `ld de, ${SCRATCH} + 3`, 'ld bc, 4'], trailer: ['DATA'] },
    lddr: { setup: ['ld hl, source + 3', `ld de, ${SCRATCH} + 3`, 'ld bc, 4'], trailer: ['DATA'] },
    cpi: { setup: ['ld a, 3', 'ld hl, source', 'ld bc, 4'], trailer: ['DATA'] },
    cpir: { setup: ['ld a, 3', 'ld hl, source', 'ld bc, 4'], trailer: ['DATA'] },
    cpd: { setup: ['ld a, 3', 'ld hl, source + 3', 'ld bc, 4'], trailer: ['DATA'] },
    cpdr: { setup: ['ld a, 3', 'ld hl, source + 3', 'ld bc, 4'], trailer: ['DATA'] },
    // Port 0x10 is not connected to anything, so the reads answer 0xFF instead of stopping the
    // program to ask the user for four bytes of input.
    ini: { setup: [`ld hl, ${SCRATCH}`, 'ld b, 2', 'ld c, 0x10'] },
    inir: { setup: [`ld hl, ${SCRATCH}`, 'ld b, 2', 'ld c, 0x10'] },
    ind: { setup: [`ld hl, ${SCRATCH}`, 'ld b, 2', 'ld c, 0x10'] },
    indr: { setup: [`ld hl, ${SCRATCH}`, 'ld b, 2', 'ld c, 0x10'] },
    // Port 1 is the console's unsigned number port, so these print "42" and "7".
    outi: { setup: ['ld hl, source', 'ld b, 2', 'ld c, 1'], trailer: ['OUT_DATA'] },
    otir: { setup: ['ld hl, source', 'ld b, 2', 'ld c, 1'], trailer: ['OUT_DATA'] },
    outd: { setup: ['ld hl, source + 1', 'ld b, 2', 'ld c, 1'], trailer: ['OUT_DATA'] },
    otdr: { setup: ['ld hl, source + 1', 'ld b, 2', 'ld c, 1'], trailer: ['OUT_DATA'] },
    rld: { setup: ['ld hl, source', 'ld a, 0x12'], trailer: ['NIBBLE_DATA'] },
    rrd: { setup: ['ld hl, source', 'ld a, 0x12'], trailer: ['NIBBLE_DATA'] }
}

/** The data blocks referenced by `IMPLICIT_SETUP`, kept out of it so the table stays readable. */
const TRAILER_DATA: Record<string, string> = {
    DATA: 'source: .byte 1, 2, 3, 4',
    OUT_DATA: 'source: .byte 42, 7',
    NIBBLE_DATA: 'source: .byte 0x34'
}

/**
 * `in` and `out` are the only instructions whose operand values carry the whole point of the
 * example: a port number picked by the generic rules would talk to an empty bus and print nothing.
 */
const FULL_OVERRIDES: Record<string, string> = {
    in: `        .org ${ORG}
        in a, (1)       ; ask the console for a number
        add a, a        ; double it
        out (1), a      ; print the result
        halt`,
    out: `        .org ${ORG}
        ld a, 'H'
        out (0), a      ; port 0 prints the byte as a character
        halt`,
    // `rst` is a one byte call to a fixed low address, so the example has to put something there:
    // generated from the table it would jump into empty memory and never come back.
    rst: `        .org 0x0000
        ret             ; the handler that \`rst 00\` jumps to
        .org ${ORG}
start:  rst 00          ; a one byte call to 0x0000
        halt
        end start       ; without this the program would start at the handler`
}

/** Puts a label in the first column with its instruction at the usual indentation. */
function labelled(label: string, code: string): string {
    return `${label}:`.padEnd(8, ' ') + code
}

function substituteOperand(operand: string, mnemonic: string, jumpLabel: string): string {
    if (operand === 'offset') return jumpLabel
    // Only `call` and `jp` take a full address the example can point at a label; `ld hl,nnnn` and
    // friends read better with a plain number.
    if (operand === 'nnnn' && (mnemonic === 'call' || mnemonic === 'jp')) return jumpLabel
    return operand.replace(
        /nnnn|nn|dd/g,
        (placeholder) => OPERAND_VALUES[placeholder] ?? placeholder
    )
}

/**
 * Picks the form to demonstrate: the first one that is neither undocumented nor an alias, because
 * the package lists the variants in the order the manual does, so the first documented form is the
 * plainest one. Falls back to the first variant for mnemonics that are undocumented as a whole
 * (`sll`).
 */
function pickVariant(variants: Z80InstructionVariant[]): Z80InstructionVariant {
    return variants.find((variant) => !variant.undocumented && !variant.isPseudo) ?? variants[0]
}

/**
 * The runnable example shown on the page of `mnemonic`.
 */
export function buildZ80Example(mnemonic: string, variants: Z80InstructionVariant[]): string {
    const override = FULL_OVERRIDES[mnemonic]
    if (override) return override

    const variant = pickVariant(variants)
    const isLoop = LOOPING_MNEMONICS.has(mnemonic)
    const jumpLabel = isLoop ? 'loop' : 'target'
    const operands = variant.params.map((param) => substituteOperand(param, mnemonic, jumpLabel))
    const instruction =
        operands.length > 0 ? `${mnemonic} ${operands.join(', ')}` : variant.instruction

    const fragments = IMPLICIT_SETUP[mnemonic]
    const setup = [...(fragments?.setup ?? [])]
    const configured = new Set(setup.map((line) => line.split(/[\s,]+/)[1]))
    if (IMPLICIT_ACCUMULATOR.has(mnemonic) && !configured.has('a')) {
        setup.unshift(`ld a, ${REGISTER_SETUP_VALUES.a}`)
        configured.add('a')
    }
    for (const [index, param] of variant.params.entries()) {
        // The first operand of a `ld` is the destination, presetting it would only be noise.
        if (mnemonic === 'ld' && index === 0) continue
        const value = REGISTER_SETUP_VALUES[param]
        if (value === undefined || configured.has(param)) continue
        configured.add(param)
        setup.push(`ld ${param}, ${value}`)
    }

    const lines = [`        .org ${ORG}`, ...setup.map((line) => `        ${line}`)]
    lines.push(isLoop ? labelled(jumpLabel, instruction) : `        ${instruction}`)
    // `halt` is already the terminator, and a jump forward needs something to land on.
    if (mnemonic !== 'halt') {
        const usesForwardLabel = !isLoop && operands.includes(jumpLabel)
        if (usesForwardLabel && mnemonic === 'call') {
            // A called subroutine has to return, otherwise the example falls into the halt twice.
            lines.push('        halt', labelled(jumpLabel, 'ret'))
        } else if (usesForwardLabel) {
            lines.push(labelled(jumpLabel, 'halt'))
        } else {
            lines.push('        halt')
        }
    }
    for (const key of fragments?.trailer ?? []) lines.push(TRAILER_DATA[key])
    return lines.join('\n')
}
