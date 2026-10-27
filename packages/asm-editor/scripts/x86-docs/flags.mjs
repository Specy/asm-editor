/**
 * What each documented x86 mnemonic does to the flags, joined from NASM's names onto XED's
 * instruction classes. The records come from `xed-flags.txt` (see `xed.mjs`); this module decides
 * which records a mnemonic stands for and how their marks combine into one strip.
 *
 * A mnemonic's records can disagree about a flag: `shl` defines OF after a shift by 1 and leaves it
 * undefined after any other count. The strip then shows the weakest mark that is still true
 * (undefined over changed, changed over a fixed value) and a note says when it is better than that.
 * Every disagreement needs its note in `XED_NOTES`, and every note has to be used, so a change in
 * XED's tables fails the run instead of quietly changing a page.
 */

import { parseXedFlagsField } from './xed.mjs'

/** RFLAGS in bit order, which is the order the registers panel shows them in. */
export const FLAG_ORDER = ['CF', 'PF', 'AF', 'ZF', 'SF', 'TF', 'IF', 'DF', 'OF']

/** On every strip. TF and IF join them only for an instruction that writes them. */
const ALWAYS = new Set(['CF', 'PF', 'AF', 'ZF', 'SF', 'DF', 'OF'])

/**
 * NASM names that are not XED's, beyond the condition spellings and the size suffixes, which are
 * resolved by rule. Every class named here is checked against XED, so a rename fails the run.
 */
export const XED_ICLASSES = {
    call: ['CALL_NEAR', 'CALL_FAR'],
    jmp: ['JMP', 'JMP_FAR'],
    ret: ['RET_NEAR'],
    retn: ['RET_NEAR'],
    retf: ['RET_FAR'],
    iretw: ['IRET'],
    popaw: ['POPA'],
    pushaw: ['PUSHA'],
    popfw: ['POPF'],
    pushfw: ['PUSHF'],
    // `loopz` and `loopnz` are the second spellings of `loope` and `loopne`.
    loopz: ['LOOPE'],
    loopnz: ['LOOPNE'],
    // NASM's `movabs` and `movzxd` are spellings of `mov` (`movzxd` is the plain `8b /r` move).
    mov: ['MOV', 'MOV_CR', 'MOV_DR'],
    movabs: ['MOV'],
    movzxd: ['MOV'],
    // `sal` is `shl`'s other name; XED files both encodings under SHL.
    sal: ['SHL'],
    brkpt: ['INT3'],
    icebp: ['INT1'],
    int01: ['INT1'],
    // `66 90`, which XED decodes as a NOP with an operand size prefix.
    nop2: ['NOP'],
    // The early 486 encoding of `cmpxchg`, which Intel moved before release.
    cmpxchg486: ['CMPXCHG'],
    // NASM's `cmpsd` is both the string compare and the SSE2 scalar double compare.
    cmpsd: ['CMPSD', 'CMPSD_XMM'],
    syscall: ['SYSCALL', 'SYSCALL_AMD'],
    sysret: ['SYSRET', 'SYSRET64', 'SYSRET_AMD']
}

/** The spellings of each condition. XED names a condition by one of them, NASM accepts all. */
const CONDITION_SPELLINGS = [
    ['e', 'z'],
    ['ne', 'nz'],
    ['a', 'nbe'],
    ['ae', 'nb', 'nc'],
    ['b', 'nae', 'c'],
    ['be', 'na'],
    ['g', 'nle'],
    ['ge', 'nl'],
    ['l', 'nge'],
    ['le', 'ng'],
    ['p', 'pe'],
    ['np', 'po'],
    ['s'],
    ['ns'],
    ['o'],
    ['no']
]

/**
 * The XED classes a NASM mnemonic stands for: the table above, then the name itself, then another
 * spelling of its condition (`cmovng` is CMOVLE), then the base of a size suffixed name through
 * `aliases`, the map the descriptions use (`retq` is `ret`). Empty when XED does not know it.
 */
export function resolveXedIclasses(name, available, aliases = {}) {
    if (XED_ICLASSES[name]) return XED_ICLASSES[name]
    if (available.has(name.toUpperCase())) return [name.toUpperCase()]
    const conditional = /^(j|set|cmov)([a-z]+)$/.exec(name)
    const spellings = conditional
        ? (CONDITION_SPELLINGS.find((group) => group.includes(conditional[2])) ?? [])
        : []
    for (const spelling of spellings) {
        const iclass = `${conditional[1]}${spelling}`.toUpperCase()
        if (available.has(iclass)) return [iclass]
    }
    if (aliases[name]) return resolveXedIclasses(aliases[name], available, aliases)
    return []
}

/**
 * Where XED's FLAGS field is wrong, by class, with the field that replaces it. Each was found by
 * `x86-docs-sdm-audit.mjs` and checked against Intel's manual, and `checkXedCorrections` fails
 * the run once XED agrees, so a fix upstream shows up as an entry to delete.
 */
export const XED_CORRECTIONS = {
    // XED has `af-u`; the manual sets AF from the result, as for `sub` and `adc`
    SBB: 'MUST [ of-mod sf-mod zf-mod af-mod pf-mod cf-tst cf-mod ]',
    // XED has no FLAGS field; INT1 is delivered like INT3, which clears TF and may clear IF
    INT1: 'MUST [ vif-mod ac-mod vm-tst vm-mod rf-0 nt-mod iopl-tst if-mod tf-0 ]'
}

/** Throws unless every class `XED_ICLASSES` and `XED_NOTES` name is one XED has. */
export function checkXedNames(available) {
    const named = [
        ...Object.values(XED_ICLASSES).flat(),
        ...Object.keys(XED_NOTES),
        ...Object.keys(XED_CORRECTIONS)
    ]
    const unknown = [...new Set(named)].filter((iclass) => !available.has(iclass))
    if (unknown.length) throw new Error(`XED has no instruction class ${unknown.join(', ')}`)
}

/** Throws when XED's own records of a class in `XED_CORRECTIONS` already say what it does. */
export function checkXedCorrections(records) {
    const fixed = Object.entries(XED_CORRECTIONS)
        .filter(([iclass, field]) =>
            (records.get(iclass) ?? []).every((record) => record.flags === field)
        )
        .map(([iclass]) => iclass)
    if (fixed.length)
        throw new Error(`XED now agrees about ${fixed.join(', ')}; drop the correction`)
}

/**
 * A shift or rotate by a count of 0 writes nothing (XED's `MAY` on the `cl` forms), and OF is only
 * defined for a count of 1 (`IMM1` and the `, 1` forms against `IMMx` and `cl`).
 */
const COUNTED = {
    note: 'A count of 0 leaves every flag unchanged.',
    flags: { OF: 'defined only for a count of 1' }
}

/**
 * What a mnemonic's records cannot say in one mark, per XED class: `note` for the instruction as
 * a whole, `flags` for one flag. A class here must be one some documented mnemonic uses.
 */
/**
 * A double shift is defined like a shift, except that a 16-bit operand can be shifted by more than
 * its width (the count is masked to five bits), and then every flag is undefined.
 */
const DOUBLE_COUNTED = {
    note: 'A count of 0 leaves every flag unchanged. A 16-bit operand shifted by more than 16 leaves every flag undefined.',
    flags: COUNTED.flags
}

/**
 * Popping RFLAGS loads IF only at a privilege level that allows it (CPL at most IOPL), which a
 * Linux program never has: there the bit keeps its value and nothing faults.
 */
const PRIVILEGED_IF = {
    flags: {
        IF: 'loaded from the stack only with the privilege to change it, which a Linux program lacks'
    }
}

export const XED_NOTES = {
    SHL: COUNTED,
    SHR: COUNTED,
    SAR: COUNTED,
    SHLD: DOUBLE_COUNTED,
    SHRD: DOUBLE_COUNTED,
    ROL: COUNTED,
    ROR: COUNTED,
    RCL: COUNTED,
    RCR: COUNTED,
    CMPSD_XMM: {
        note: 'The SSE2 form, which compares two floating-point values, writes no flags.'
    },
    POPF: PRIVILEGED_IF,
    POPFD: PRIVILEGED_IF,
    POPFQ: PRIVILEGED_IF,
    IRET: PRIVILEGED_IF,
    IRETD: PRIVILEGED_IF,
    IRETQ: PRIVILEGED_IF
}

/**
 * Where XED's marks are the processor's and not what a program here sees. XED describes RFLAGS as
 * the processor enters the kernel; a Linux program, which is what runs here, gets its flags back
 * when the call returns, and blink's `OpSyscall` does not touch them either.
 */
const OBSERVED = {
    syscall: {
        note: 'The processor masks the flags on its way into the kernel and Linux restores them on the way out, so after the call they are as the program left them; `r11` holds the copy saved on entry.'
    }
}

/** What one record's actions do to a flag, as the strip says it. */
function effectOf(actions) {
    if (actions.includes('u')) return 'undefined'
    if (actions.includes('0')) return 'cleared'
    if (actions.includes('1')) return 'set'
    if (actions.some((action) => action === 'mod' || action === 'pop' || action === 'ah')) {
        return 'changed'
    }
    return 'unchanged'
}

/** A flag that is loaded rather than computed says from where. */
const LOADED = { pop: 'loaded from the stack', ah: 'loaded from AH' }

/**
 * One mnemonic's strip: `{ xed, marks, reads, note? }`, or null when XED has no record of it.
 * `records` maps an XED class to its records from `xed-flags.txt`; `used` collects the notes
 * read, so the caller can tell which ones nothing needed.
 */
export function flagsOf(name, iclasses, records, used = new Set()) {
    const own = iclasses.flatMap((iclass) =>
        (records.get(iclass) ?? []).map((record) =>
            XED_CORRECTIONS[iclass] ? { ...record, flags: XED_CORRECTIONS[iclass] } : record
        )
    )
    if (own.length === 0) return null
    const observed = OBSERVED[name]
    if (observed) {
        used.add(`observed:${name}`)
        const marks = Object.fromEntries(
            FLAG_ORDER.filter((flag) => ALWAYS.has(flag)).map((flag) => [
                flag,
                { kind: 'unchanged' }
            ])
        )
        return { xed: iclasses, marks, reads: [], note: observed.note }
    }
    const variants = own.flatMap((record) =>
        parseXedFlagsField(record.flags).map((variant) => ({ ...variant, iclass: record.iclass }))
    )
    const notesOf = iclasses.map((iclass) => [iclass, XED_NOTES[iclass]]).filter(([, n]) => n)
    const flagNote = (flag) => {
        const found = notesOf.find(([, notes]) => notes.flags?.[flag])
        if (found) used.add(`${found[0]}.${flag}`)
        return found?.[1].flags[flag]
    }
    const instructionNote = () => {
        const found = notesOf.find(([, notes]) => notes.note)
        if (found) used.add(`${found[0]}.note`)
        return found?.[1].note
    }
    const marks = {}
    const reads = []
    let needsNote = false
    for (const flag of FLAG_ORDER) {
        const actions = variants.map((variant) => variant.actions.get(flag) ?? [])
        if (actions.some((list) => list.includes('tst'))) reads.push(flag)
        const effects = new Set(actions.map(effectOf))
        const kind =
            effects.size === 1
                ? [...effects][0]
                : effects.has('undefined')
                  ? 'undefined'
                  : 'changed'
        if (kind === 'unchanged' && !ALWAYS.has(flag)) continue
        const mark = { kind }
        const conditional = variants.some(
            (variant) =>
                variant.qualifier === 'MAY' &&
                effectOf(variant.actions.get(flag) ?? []) !== 'unchanged'
        )
        if (effects.size > 1 || conditional) {
            const note = flagNote(flag)
            if (note) mark.note = note
            else if (!instructionNote()) {
                throw new Error(
                    `${name}: XED's records (${iclasses.join(', ')}) disagree about ${flag} or write it only sometimes, and XED_NOTES does not say why`
                )
            } else needsNote = true
        } else {
            const loaded = new Set(actions.flat().filter((action) => LOADED[action]))
            const note = flagNote(flag)
            if (note) mark.note = note
            else if (kind === 'changed' && loaded.size === 1) mark.note = LOADED[[...loaded][0]]
        }
        marks[flag] = mark
    }
    // A form that writes only sometimes (a shift by `cl`) says so once for every flag.
    const note =
        needsNote || variants.some((variant) => variant.qualifier === 'MAY')
            ? instructionNote()
            : undefined
    if (variants.some((variant) => variant.qualifier === 'MAY') && !note) {
        throw new Error(`${name}: XED marks some of its flags MAY, and XED_NOTES does not say why`)
    }
    return { xed: iclasses, marks, reads, ...(note ? { note } : {}) }
}

/** Throws when a note in `XED_NOTES` or `OBSERVED` was not needed by any documented mnemonic. */
export function checkNotesUsed(used) {
    const declared = [
        ...Object.entries(XED_NOTES).flatMap(([iclass, notes]) => [
            ...(notes.note ? [`${iclass}.note`] : []),
            ...Object.keys(notes.flags ?? {}).map((flag) => `${iclass}.${flag}`)
        ]),
        ...Object.keys(OBSERVED).map((name) => `observed:${name}`)
    ]
    const unused = declared.filter((key) => !used.has(key))
    if (unused.length) throw new Error(`notes no documented mnemonic needs: ${unused.join(', ')}`)
}
