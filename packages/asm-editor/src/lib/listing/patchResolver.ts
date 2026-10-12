import { functionAtLine, type Listing } from './listing'
import { ListingIndex } from './listingNavigation'

/**
 * The names an instruction typed over a Listing line may use, replaced by the run-time addresses
 * they stand for before the instruction is assembled
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13). The assembler
 * takes numbers only: `je 0x555555555291`, `[rel 0x555555556004]`. A person retypes what the
 * Listing shows, `je .LAB_2`, `call strcmp@plt`, `lea rax, [rel s_Correct]`, so every name the
 * Listing prints is read here: a bare `.LAB_n` as a block of the line's own function,
 * `FUN_x.LAB_n`, a function, `name@plt`, `name@got`, a versioned `name@GLIBC_2.2.5`, a data label
 * or a string, each with a `+0xN` or `-0xN` offset folded in.
 */

/** A name the text used and the run-time address it was replaced by. */
export type ResolvedName = {
    /** As written, with its offset: `.LAB_2`, `s_hunter2+0x2`. */
    written: string
    /** The label's name alone: `.LAB_2`, `s_hunter2`. */
    name: string
    /** Run-time, the offset included, wrapped to 64 bits. */
    address: bigint
}

export type ResolvedInstruction = { text: string; names: ResolvedName[] } | { error: string }

/** The characters a Listing's names are made of, as `listingNavigation.ts` reads them. */
const NAME_CHARACTER = /[\w$#@~.?]/

/** Any register NASM names in 64-bit code; `st` alone is the top of the x87 stack. */
const REGISTER = new RegExp(
    '^(?:' +
        [
            '[re]?[abcd]x',
            '[abcd][lh]',
            '[re]?(?:si|di|sp|bp)',
            '(?:si|di|sp|bp)l',
            'r(?:[89]|1[0-5])[bwdl]?',
            '[c-gs]s',
            '[re]?ip',
            'cr(?:[0-9]|1[0-5])',
            'dr(?:[0-9]|1[0-5])',
            'tr[0-7]',
            'st[0-7]?',
            'mm[0-7]',
            '[xyz]mm(?:[0-9]|[12][0-9]|3[01])',
            'k[0-7]',
            'bnd[0-3]',
            'tmm[0-7]'
        ].join('|') +
        ')$',
    'i'
)

/** Words of NASM's operand syntax that are not names. */
const KEYWORDS = new Set([
    'byte',
    'word',
    'dword',
    'qword',
    'tword',
    'oword',
    'yword',
    'zword',
    'ptr',
    'far',
    'near',
    'short',
    'strict',
    'rel',
    'abs',
    'nosplit',
    'to',
    'seg',
    'wrt'
])

/** Words that may come before the mnemonic. */
const PREFIXES = new Set([
    'lock',
    'rep',
    'repe',
    'repz',
    'repne',
    'repnz',
    'xacquire',
    'xrelease',
    'bnd',
    'nobnd',
    'notrack',
    'o16',
    'o32',
    'o64',
    'a16',
    'a32',
    'a64'
])

/** A direct branch, whose one operand may be a name that is also one of NASM's words (`call abs`). */
const BRANCH = /^(?:jmp|call|j[a-z]{1,4}|loop(?:n?[ez])?|xbegin)$/i

/** The code of a line without its comment: everything before a `;` outside quotes. */
export function withoutComment(text: string): string {
    let quote = ''
    for (let i = 0; i < text.length; ++i) {
        const c = text[i]
        if (quote) {
            if (c === quote) quote = ''
        } else if (c === "'" || c === '"' || c === '`') quote = c
        else if (c === ';') return text.slice(0, i)
    }
    return text
}

type Token = { text: string; start: number; end: number }

/**
 * The words of an instruction's code, outside quotes and outside `{…}` decorators (`{k1}{z}`,
 * `{vex}`, `{rn-sae}`), which hold no names.
 */
function tokens(code: string): Token[] {
    const found: Token[] = []
    let quote = ''
    let brace = false
    for (let i = 0; i < code.length;) {
        const c = code[i]
        if (quote) {
            if (c === quote) quote = ''
            i++
        } else if (brace) {
            if (c === '}') brace = false
            i++
        } else if (c === "'" || c === '"' || c === '`') {
            quote = c
            i++
        } else if (c === '{') {
            brace = true
            i++
        } else if (NAME_CHARACTER.test(c)) {
            const start = i
            while (i < code.length && NAME_CHARACTER.test(code[i])) i++
            found.push({ text: code.slice(start, i), start, end: i })
        } else i++
    }
    return found
}

const hex = (value: bigint) => `0x${value.toString(16)}`

/**
 * A `+0xN` or `-0xN` (or decimal) right after a name, which is folded into its address when
 * nothing after it binds tighter (`label+8*2`) and nothing before the name subtracts or scales it.
 */
function foldedOffset(
    code: string,
    name: Token
): { offset: bigint; end: number; written: string } | undefined {
    const before = code.slice(0, name.start).trimEnd()
    if (before.endsWith('-') || before.endsWith('*')) return undefined
    const match = /^\s*([+-])\s*(0x[\da-f]+|\d+)(?![\w$#@~.?])/i.exec(code.slice(name.end))
    if (!match) return undefined
    const end = name.end + match[0].length
    if (/^\s*[*/]/.test(code.slice(end))) return undefined
    const value = BigInt(match[2])
    return {
        offset: match[1] === '-' ? -value : value,
        end,
        written: `${name.text}${match[1]}${match[2]}`
    }
}

/**
 * The instruction text with every name it uses replaced by its run-time address, the Listing's
 * line deciding which function a bare `.LAB_n` belongs to. Registers, NASM's own words, numbers,
 * `$` and `$$`, quoted characters and `{…}` decorators are left as they are; anything else is a
 * name, and one the Listing does not have is an error naming it. The mnemonic and the prefixes
 * before it are never names. A leading `$` marks a name as one even where it is also a register or
 * one of NASM's words, as NASM reads it (`call $abs`). Comments are dropped.
 */
export function resolveListingNames(
    text: string,
    listing: Listing,
    line: number
): ResolvedInstruction {
    const code = withoutComment(text)
    const words = tokens(code)
    const index = ListingIndex.of(listing)
    const base = BigInt(listing.base)
    const names: ResolvedName[] = []
    const edits: { start: number; end: number; text: string }[] = []
    let mnemonic: string | undefined
    for (let k = 0; k < words.length; k++) {
        const word = words[k]
        if (mnemonic === undefined) {
            //prefixes, then the mnemonic: `lock add`, `bnd jmp`, `rep movsb`
            if (!PREFIXES.has(word.text.toLowerCase()) || k === words.length - 1)
                mnemonic = word.text
            continue
        }
        if (/^\d/.test(word.text) || /^\$+$/.test(word.text) || /^\$\d/.test(word.text)) continue
        let name = word.text
        if (name.startsWith('$')) {
            //a label whose own name starts with `$`, as Go's constants do (`$f64.3ff0…`), is
            //looked up as written; otherwise `$` marks the word as a name, as NASM reads it
            if (index.label(name, line) === undefined) name = name.slice(1)
        } else {
            const lower = name.toLowerCase()
            const reserved = REGISTER.test(name) || KEYWORDS.has(lower)
            //a branch's target alone may be a name that is also one of NASM's words: `call abs`
            const target =
                reserved &&
                BRANCH.test(mnemonic) &&
                k === words.length - 1 &&
                !code.slice(word.end).trim() &&
                index.label(name, line) !== undefined
            if (reserved && !target) continue
        }
        const label = index.label(name, line)
        if (!label) return { error: unknownName(name, listing, line) }
        let address = BigInt(label.address) + base
        let end = word.end
        let written = word.text
        const offset = foldedOffset(code, word)
        if (offset) {
            address = BigInt.asUintN(64, address + offset.offset)
            end = offset.end
            written = offset.written
        }
        names.push({ written, name, address })
        edits.push({ start: word.start, end, text: hex(address) })
        //the offset's number is part of the name now
        while (k + 1 < words.length && words[k + 1].start < end) k++
    }
    let resolved = code
    for (const edit of edits.reverse())
        resolved = resolved.slice(0, edit.start) + edit.text + resolved.slice(edit.end)
    return { text: resolved.trim(), names }
}

/** Why a name is not one of the Listing's. */
function unknownName(name: string, listing: Listing, line: number): string {
    if (name.startsWith('.')) {
        const owner = functionAtLine(listing, line)
        return owner
            ? `There is no ${name} in ${owner.name}: a bare .LAB_n names a block of the function the line is in`
            : `${name} names a block of the function the line is in, and this line is in none: write the block's full name, such as FUN_name${name}`
    }
    return `There is no label named ${name} in this Listing`
}
