/**
 * The Listing generator against the x86 Core's ELF fixtures and a hand-built ELF.
 *
 * Whole Listings are compared with the expected text committed in `snapshots/`. After a change
 * that is meant to alter them (the generator's format, or the Core's instruction text), regenerate
 * them from `packages/asm-editor` with
 *
 *     UPDATE_LISTING_SNAPSHOTS=1 node_modules/.bin/vp test run src/lib/listing
 *
 * and review the diff: invented names must not change within a names version.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { CLOSE, OPEN } from '#lib/languages/demangle/demangledNames.ts'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from './decoder'
import { generateListing, ListingError } from './generateListing'
import { findProgramStart } from './programStart'
import { pseudocodeMap } from '#lib/pseudocode/pseudocodeMap.ts'
import {
    functionAtLine,
    instructionAddressAt,
    LINE_KIND,
    lineOfAddress,
    lineOfFileOffset,
    lineOfPlace,
    PERSON_COMMENT,
    placeOfLine,
    type Listing,
    type ListingAnnotations
} from './listing'
import { breakpointLine } from './listingBreakpoints'
import type { ListingDocuments } from './listingDocuments.svelte'
import { labelHoverMarkdown, ListingIndex, listingTokenAt } from './listingNavigation'
import { withoutComment } from './patchResolver'

const UPDATE = !!process.env.UPDATE_LISTING_SNAPSHOTS
const PIE_BASE = 0x555555554000

const fixture = (name: string) =>
    new Uint8Array(
        readFileSync(
            new URL(`../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    )
const libc = () =>
    new Uint8Array(
        readFileSync(
            new URL('../../../../x86/blink-js/src/assets/linux/libc.so.6', import.meta.url)
        )
    )

function expectSnapshot(file: string, text: string) {
    const url = new URL(`./snapshots/${file}`, import.meta.url)
    if (UPDATE) {
        mkdirSync(new URL('./snapshots/', import.meta.url), { recursive: true })
        writeFileSync(url, text)
        return
    }
    let expected: string
    try {
        expected = readFileSync(url, 'utf8')
    } catch {
        throw new Error(`No snapshot ${file}: run the tests with UPDATE_LISTING_SNAPSHOTS=1`)
    }
    expect(text, file).toBe(expected)
}

type HandBuiltSymbol = { name: string; info: number; value: number; size: number }

/**
 * A static executable at 0x400000 of one `.text` section at 0x400080, its entry point, and the
 * `.rodata` given right after it, with the given symbols in `.symtab` (info is `st_info`: 0x12 a
 * global function, 0x02 a local one, 0x11 a global object, 0x01 a local one).
 */
function buildElf(text: number[], symbols: HandBuiltSymbol[], rodata: number[] = []): Uint8Array {
    const align = (value: number) => (value + 7) & ~7
    const shstrtab = `\0.text\0.symtab\0.strtab\0.shstrtab\0${rodata.length ? '.rodata\0' : ''}`
    const strtab = `\0${symbols.map((symbol) => `${symbol.name}\0`).join('')}`
    const loaded = 0x80 + text.length + rodata.length
    const symtabAt = align(loaded)
    const strtabAt = symtabAt + 24 * (symbols.length + 1)
    const shstrtabAt = strtabAt + strtab.length
    const sectionsAt = align(shstrtabAt + shstrtab.length)
    const sections = rodata.length ? 6 : 5
    const bytes = new Uint8Array(sectionsAt + sections * 64)
    const view = new DataView(bytes.buffer)
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])
    view.setUint16(16, 2, true) // ET_EXEC
    view.setUint16(18, 62, true) // x86-64
    view.setUint32(20, 1, true)
    view.setBigUint64(24, 0x400080n, true)
    view.setBigUint64(32, 0x40n, true)
    view.setBigUint64(40, BigInt(sectionsAt), true)
    view.setUint16(52, 64, true)
    view.setUint16(54, 56, true)
    view.setUint16(56, 1, true)
    view.setUint16(58, 64, true)
    view.setUint16(60, sections, true)
    view.setUint16(62, 4, true)
    // PT_LOAD r-x over the headers, .text and .rodata
    view.setUint32(0x40, 1, true)
    view.setUint32(0x44, 5, true)
    view.setBigUint64(0x50, 0x400000n, true)
    view.setBigUint64(0x58, 0x400000n, true)
    view.setBigUint64(0x60, BigInt(loaded), true)
    view.setBigUint64(0x68, BigInt(loaded), true)
    view.setBigUint64(0x70, 0x1000n, true)
    bytes.set(text, 0x80)
    bytes.set(rodata, 0x80 + text.length)
    let name = 1
    symbols.forEach((symbol, i) => {
        const at = symtabAt + 24 * (i + 1)
        view.setUint32(at, name, true)
        bytes[at + 4] = symbol.info
        view.setUint16(at + 6, 1, true)
        view.setBigUint64(at + 8, BigInt(symbol.value), true)
        view.setBigUint64(at + 16, BigInt(symbol.size), true)
        name += symbol.name.length + 1
    })
    bytes.set(
        Array.from(strtab, (c) => c.charCodeAt(0)),
        strtabAt
    )
    bytes.set(
        Array.from(shstrtab, (c) => c.charCodeAt(0)),
        shstrtabAt
    )
    const section = (index: number, fields: number[]) => {
        const at = sectionsAt + index * 64
        const [name, type, flags, address, offset, size, link, info, align, entrySize] = fields
        view.setUint32(at, name, true)
        view.setUint32(at + 4, type, true)
        view.setBigUint64(at + 8, BigInt(flags), true)
        view.setBigUint64(at + 16, BigInt(address), true)
        view.setBigUint64(at + 24, BigInt(offset), true)
        view.setBigUint64(at + 32, BigInt(size), true)
        view.setUint32(at + 40, link, true)
        view.setUint32(at + 44, info, true)
        view.setBigUint64(at + 48, BigInt(align), true)
        view.setBigUint64(at + 56, BigInt(entrySize), true)
    }
    const locals = symbols.filter((symbol) => !(symbol.info >> 4)).length
    section(1, [1, 1, 6, 0x400080, 0x80, text.length, 0, 0, 16, 0])
    section(2, [7, 2, 0, 0, symtabAt, 24 * (symbols.length + 1), 3, locals + 1, 8, 24])
    section(3, [15, 3, 0, 0, strtabAt, strtab.length, 0, 0, 1, 0])
    section(4, [23, 3, 0, 0, shstrtabAt, shstrtab.length, 0, 0, 1, 0])
    const rodataAt = 0x80 + text.length
    if (rodata.length)
        section(5, [33, 1, 2, 0x400000 + rodataAt, rodataAt, rodata.length, 0, 0, 1, 0])
    return bytes
}

/**
 * `.text` holding an object symbol (`table`), a byte no x86-64 instruction starts with, a jump
 * into the middle of an instruction, and a string without a symbol that linear decoding reads as
 * an `imul` running into the function after it.
 */
function handBuiltElf(): Uint8Array {
    // prettier-ignore
    const text = [
        0xe8, 0x1e, 0x00, 0x00, 0x00, // 0x400080 _start: call 0x4000a3
        0xeb, 0x08, //                   0x400085 jmp 0x40008f, over the table
        0x41, 0x42, 0x43, 0x44, 0x00, 0x00, 0x00, 0x00, // 0x400087 table
        0x06, //                         0x40008f invalid in 64-bit mode
        0x31, 0xc0, //                   0x400090 xor eax, eax
        0x74, 0x01, //                   0x400092 je 0x400095, inside the next instruction
        0xb8, 0x01, 0x00, 0x00, 0x00, // 0x400094 mov eax, 1
        0x75, 0xf5, //                   0x400099 jne 0x400090
        0xc3, //                         0x40009b ret
        0x48, 0x69, 0x21, 0x00, //       0x40009c "Hi!", unnamed
        0x55, 0x5d, 0xc3, //             0x4000a0 g: push rbp; pop rbp; ret
        0x31, 0xc0, 0xc3 //              0x4000a3 called, unnamed: xor eax, eax; ret
    ]
    return buildElf(text, [
        { name: 'table', info: 0x01, value: 0x400087, size: 8 },
        { name: 'g', info: 0x02, value: 0x4000a0, size: 3 },
        { name: '_start', info: 0x12, value: 0x400080, size: 0x1c }
    ])
}

/** A copy whose section header table is gone, a trick to keep tools from reading a binary. */
function withoutSectionHeaders(bytes: Uint8Array): Uint8Array {
    const copy = bytes.slice()
    const view = new DataView(copy.buffer)
    view.setBigUint64(40, 0n, true)
    view.setUint16(60, 0, true)
    view.setUint16(62, 0, true)
    return copy
}

/** A copy whose `.symtab` reads as an empty section, as `strip` would leave it. */
function withoutSymbolTable(bytes: Uint8Array): Uint8Array {
    const copy = bytes.slice()
    const view = new DataView(copy.buffer)
    const table = Number(view.getBigUint64(40, true))
    for (let i = 0; i < view.getUint16(60, true); ++i)
        if (view.getUint32(table + i * 64 + 4, true) === 2)
            view.setUint32(table + i * 64 + 4, 0, true)
    return copy
}

let decoder: ListingDecoder
let demangler: Demangler
beforeAll(async () => {
    decoder = await loadDecoder()
    demangler = await loadDemangler()
})

function listingOf(
    bytes: Uint8Array,
    name: string,
    base = decoder.analyze(bytes).pie ? PIE_BASE : 0,
    names?: Demangler
) {
    return generateListing(decoder, { bytes, name, base, version: 'v1', demangler: names })
}

function linesOf(listing: Listing) {
    return listing.text.split('\n')
}

function functionText(listing: Listing, name: string): string {
    const found = listing.functions.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`No function ${name}`)
    return linesOf(listing).slice(found.line, found.endLine).join('\n')
}

/**
 * What every Listing's tables must agree with in its text. Checked in plain code and asserted
 * once, since a static binary has a hundred thousand lines.
 */
function expectConsistent(listing: Listing, bytes: Uint8Array) {
    const problems: string[] = []
    const check = (ok: boolean, problem: () => string) => {
        if (!ok && problems.length < 20) problems.push(problem())
    }
    const lines = linesOf(listing)
    const { kinds, addresses, sizes, offsets, byAddress } = listing.lines
    check(lines.at(-1) === '', () => 'the text does not end with a line break')
    check(
        kinds.length === lines.length - 1,
        () => `${kinds.length} kinds, ${lines.length - 1} lines`
    )
    for (let i = 1; i < byAddress.length; ++i) {
        const [previous, line] = [byAddress[i - 1], byAddress[i]]
        check(
            addresses[line] >= addresses[previous] + sizes[previous],
            () => `line ${line} overlaps`
        )
    }
    for (const line of byAddress) {
        check(lineOfAddress(listing, addresses[line]) === line, () => `line ${line} not found`)
        check(
            lineOfAddress(listing, addresses[line] + sizes[line] - 1) === line,
            () => `line ${line}'s last byte not found`
        )
        check(offsets[line] + sizes[line] <= bytes.length, () => `line ${line} is past the file`)
    }
    for (let line = 0; line < kinds.length; ++line)
        if (kinds[line] === LINE_KIND.instruction)
            check(
                sizes[line] > 0 && offsets[line] >= 0,
                () => `instruction line ${line} has no bytes`
            )
    for (const label of listing.labels) {
        check(
            lines[label.line].startsWith(`${label.name}:`),
            () => `${label.name} at ${lines[label.line]}`
        )
        check(addresses[label.line] === label.address, () => `${label.name}'s address`)
    }
    const names = listing.labels.map((label) => label.fullName)
    check(new Set(names).size === names.length, () => 'two labels have one name')
    // Every name an operand or a pointer uses is defined, so going to its definition works.
    const defined = new Set(names)
    const register = /^(?:[re]?[a-d]x|[re]?[sd]il?|[re]?[sb]pl?|r\d+[dwb]?|[a-d][lh])$/
    lines.forEach((line, i) => {
        const used: string[] = []
        for (const [, name] of line.matchAll(/\[rel ([^\]+]+)(?:\+0x[\da-f]+)?\]/g)) used.push(name)
        const code = withoutComment(line)
        const branch =
            /^ {4}(?:bnd )?(?:j[a-z]+|call|loop[a-z]*) ([^\s[;,+]+)(?:\+0x[\da-f]+)?(?: |$)/.exec(
                code
            )
        if (branch && !code.includes('[') && !register.test(branch[1])) used.push(branch[1])
        const pointer = /^(?:\S+: | {4})dq ([^\s;]+)/.exec(line)
        if (pointer) used.push(pointer[1])
        for (const name of used) {
            if (name.startsWith('0x') || /^\d+$/.test(name)) continue
            const full = name.startsWith('.') ? `${functionAtLine(listing, i)?.name}${name}` : name
            check(
                defined.has(full),
                () => `line ${i} uses ${name}, which no label defines: ${line}`
            )
        }
    })
    listing.functions.forEach((current, i) => {
        check(
            withoutComment(lines[current.line]).trimEnd() === `${current.name}:`,
            () => `function ${current.name}'s line`
        )
        check(current.endLine > current.line, () => `function ${current.name} is empty`)
        check(functionAtLine(listing, current.line) === current, () => `${current.name} not found`)
        check(
            !i || current.address > listing.functions[i - 1].address,
            () => `function ${current.name} is out of order`
        )
    })
    expect(problems).toEqual([])
}

describe('Listings of dynamically linked programs', () => {
    it('lists crackme with its symbols, PLT stubs, GOT slots and strings', () => {
        const bytes = fixture('crackme')
        const listing = listingOf(bytes, 'crackme')
        expectConsistent(listing, bytes)
        expectSnapshot('crackme.asm', listing.text)
        expect(listing.main).toBe(0x11e9)
        expect(listing.entry).toBe(0x1100)
    })

    it("finds an instruction by its bytes' file offset and back, as Show in Listing does", () => {
        const bytes = fixture('crackme')
        const listing = listingOf(bytes, 'crackme')
        const { kinds, offsets, sizes, addresses } = listing.lines
        //main's first instruction, at offset 0x11e9 of the file (readelf: .text is at 0x1100
        //in both), and a byte inside it
        const line = lineOfFileOffset(listing, 0x11e9)
        expect(kinds[line]).toBe(LINE_KIND.instruction)
        expect(addresses[line]).toBe(0x11e9)
        expect(functionAtLine(listing, line)?.name).toBe('main')
        expect(lineOfFileOffset(listing, 0x11e9 + sizes[line] - 1)).toBe(line)
        //and back: the line's bytes are the file's, where Show in Hex selects them
        expect(offsets[line]).toBe(0x11e9)
        expect([...bytes.subarray(offsets[line], offsets[line] + sizes[line])]).toEqual([
            0xf3, 0x0f, 0x1e, 0xfa
        ])
        //the ELF header and the padding between sections are on no line
        expect(lineOfFileOffset(listing, 0x10)).toBe(-1)
        expect(lineOfFileOffset(listing, 0x800)).toBe(-1)
    })

    it('names an address just past a section, which alignment separates from the next', () => {
        //cpp's .data ends at 0x6020, where __TMC_END__ and _edata are, and .bss starts at 0x6040
        const bytes = fixture('cpp')
        const listing = listingOf(bytes, 'cpp')
        expectConsistent(listing, bytes)
        const lines = linesOf(listing)
        const end = lines.indexOf('__TMC_END__:')
        expect(lines.slice(end, end + 4)).toEqual(['__TMC_END__:', '_edata:', '', 'section .bss'])
        expect(listing.lines.addresses[end]).toBe(0x6020)
        expect(lines.filter((line) => line.trim() === 'lea rdi, [rel _edata]')).toHaveLength(2)
        expect(listing.text).not.toContain('0x55555555a020')
        expect(lines.at(-2)).toBe('_end:')
    })

    it('names what strip removed: functions, main, library calls and strings', () => {
        const bytes = fixture('crackme-stripped')
        const listing = listingOf(bytes, 'crackme-stripped')
        expectConsistent(listing, bytes)
        expectSnapshot('crackme-stripped.asm', listing.text)
        const text = listing.text
        expect(listing.main).toBe(0x11e9)
        expect(text).toContain('\nmain:\n')
        expect(text).toContain('\n_start:\n')
        expect(text).toMatch(/\n {4}call strcmp@plt\n/)
        expect(text).toMatch(/\n {4}lea rax, \[rel s_Enter_password\] +; "Enter password: "\n/)
        expect(text).toContain('\ns_Enter_password: db "Enter password: ", 0\n')
        expect(text).toMatch(/\n {4}call qword \[rel __libc_start_main@got\]\n/)
        // Every function the call targets and function pointers reveal has an invented name.
        expect(listing.functions.map((f) => f.name).filter((n) => n.startsWith('FUN_'))).toEqual([
            'FUN_bronze_barracuda',
            'FUN_winged_scarab',
            'FUN_moonlit_vole',
            'FUN_peachy_anteater',
            'FUN_sunny_moth',
            'FUN_gliding_yak'
        ])
        // The same bytes as crackme's, so the same instructions, minus the symbols.
        const named = listingOf(fixture('crackme'), 'crackme')
        const instructions = (l: Listing) =>
            Array.from(l.lines.kinds.keys())
                .filter((line) => l.lines.kinds[line] === LINE_KIND.instruction)
                .map((line) => l.lines.addresses[line])
        expect(instructions(listing)).toEqual(instructions(named))
    })

    it('decodes AVX instructions without losing its place', () => {
        const bytes = fixture('avx')
        const listing = listingOf(bytes, 'avx')
        expectConsistent(listing, bytes)
        expectSnapshot('avx.asm', listing.text)
        const vectorSum = functionText(listing, 'vector_sum')
        expect(vectorSum).toContain('    vpbroadcastd ymm0, xmm0')
        expect(vectorSum).toContain('    vpaddd ymm0, ymm0, ymm1')
        expect(vectorSum).toContain('    vzeroupper')
        // No byte of the program's code failed to decode.
        const lines = linesOf(listing)
        const undecoded = lines.filter(
            (line, i) =>
                listing.lines.kinds[i] === LINE_KIND.instruction && line.startsWith('    db ')
        )
        expect(undecoded).toEqual([])
    })

    it('names the bundled libc.so.6 PLT stubs after the slot each jumps through', () => {
        // libc's `.rela.plt` holds IRELATIVE relocations among its JUMP_SLOT ones, so a stub's
        // name cannot come from its position: each stub's name must agree with its own jump.
        const listing = listingOf(libc(), 'libc.so.6', 0x7ffff7c00000)
        const lines = linesOf(listing)
        let stubs = 0
        lines.forEach((line, i) => {
            const stub = /^(\S+)@plt:$/.exec(line)
            if (!stub) return
            const jump = lines.slice(i + 1, i + 4).find((next) => /\bjmp \w* ?\[/.test(next))
            if (!jump) return
            ++stubs
            expect(jump.trim()).toBe(`jmp qword [rel ${stub[1]}@got]`)
        })
        expect(stubs).toBeGreaterThan(30)
        expect(listing.text).toContain('\n_IO_puts:\nputs:\n')
        expect(listing.main).toBeUndefined()

        // Two versions of one function read as objdump writes them: the default version by its
        // plain name, the other with its version, and neither as a numbered duplicate.
        const names = new Map(listing.labels.map((label) => [label.name, label.address]))
        expect(names.get('memcpy')).toBe(0xb8c80)
        expect(names.get('memcpy@GLIBC_2.2.5')).toBe(0xc22f0)
        expect(names.get('realpath')).toBe(0x47200)
        expect(names.get('realpath@GLIBC_2.2.5')).toBe(0x1942d0)
        expect([...names.keys()].filter((name) => /^(?:memcpy|realpath)_\d+$/.test(name))).toEqual(
            []
        )
    })
})

describe('Listings of static programs', () => {
    it('lists hello-atexit at fixed addresses, with main from its symbol', () => {
        const bytes = fixture('hello-atexit-static')
        const listing = listingOf(bytes, 'hello-atexit-static')
        expectConsistent(listing, bytes)
        const lines = linesOf(listing)
        const hash = createHash('sha256').update(listing.text).digest('hex')
        const excerpt = [
            `; Excerpt of the Listing of hello-atexit-static, whose whole text has SHA-256 ${hash}`,
            ...lines.filter((_, line) => listing.lines.kinds[line] === LINE_KIND.comment),
            ...lines.filter((_, line) => listing.lines.kinds[line] === LINE_KIND.section),
            functionText(listing, '_start'),
            functionText(listing, 'main'),
            functionText(listing, 'farewell'),
            ...lines.filter((line) => /^s_(hello|atexit)/.test(line)),
            ''
        ].join('\n')
        expectSnapshot('hello-atexit-static.excerpt.asm', excerpt)
        expect(functionText(listing, '_start')).toMatch(/mov rdi, 0x4018bf +; main\n/)
        expect(functionText(listing, 'farewell')).toMatch(
            /lea rax, \[rel s_atexit_handler\] +; "atexit handler"/
        )
        // An IRELATIVE slot of a static binary names its stub after the ifunc it resolves.
        expect(listing.text).toContain('\nstrlen@plt:\n')
    })

    it('finds main in a stripped static binary from _start alone', () => {
        const bytes = withoutSymbolTable(fixture('hello-atexit-static'))
        expect(decoder.analyze(bytes).stripped).toBe(true)
        const listing = listingOf(bytes, 'hello-atexit-static')
        expectConsistent(listing, bytes)
        expect(listing.main).toBe(0x4018bf)
        const start = functionText(listing, '_start')
        expect(start).toMatch(/mov rdi, 0x4018bf +; main\n {4}call FUN_[a-z]+_[a-z]+\n {4}hlt/)
        expect(listing.text).toContain('\nmain:\n')
    })
})

describe('Listings of unusual files', () => {
    it('lists data inside .text as data and decodes again from the next symbol', () => {
        const bytes = handBuiltElf()
        expect(decoder.analyze(bytes).supported).toBe(true)
        const listing = listingOf(bytes, 'hand-built')
        expectConsistent(listing, bytes)
        expectSnapshot('hand-built.asm', listing.text)
        const start = functionText(listing, '_start')
        expect(start).toContain('table:\n    db 0x41, 0x42, 0x43, 0x44, 0x00, 0x00, 0x00, 0x00\n')
        expect(start).toContain('.LAB_1:\n    db 0x06\n.LAB_2:\n    xor eax, eax\n')
        // Into the middle of an instruction: no label can stand there.
        expect(start).toContain('    je _start+0x15\n')
        expect(start.endsWith('    ret\n    db 0x48, 0x69, 0x21, 0x00')).toBe(true)
        expect(functionText(listing, 'g')).toBe('g:\n    push rbp\n    pop rbp\n    ret')
        const called = listing.functions.at(-1)!
        expect(called.address).toBe(0x4000a3)
        expect(called.name).toMatch(/^FUN_[a-z]+_[a-z]+$/)
        expect(start).toContain(`    call ${called.name}\n`)
    })

    it('finds main passed in edi to a call that never returns', () => {
        // prettier-ignore
        const text = [
            0xbf, 0x90, 0x00, 0x40, 0x00, // 0x400080 mov edi, 0x400090
            0xe8, 0x01, 0x00, 0x00, 0x00, // 0x400085 call 0x40008b
            0xf4, //                         0x40008a hlt
            0xc3, //                         0x40008b ret
            0x90, 0x90, 0x90, 0x90, //       0x40008c padding
            0x31, 0xc0, 0xc3 //              0x400090 xor eax, eax; ret
        ]
        const listing = listingOf(buildElf(text, []), 'no-symbols')
        expect(listing.main).toBe(0x400090)
        expect(functionText(listing, '_start')).toMatch(/^_start:\n {4}mov edi, 0x400090 +; main\n/)
        expect(functionText(listing, 'main')).toBe('main:\n    xor eax, eax\n    ret')
    })

    it('names no main where the symbol main is data, as `const char main[]` makes it', () => {
        //a data object, and a bare label in the data, as an assembler leaves `main:` there
        for (const info of [0x11, 0x10]) {
            const bytes = buildElf(
                [0x31, 0xc0, 0xc3],
                [
                    { name: '_start', info: 0x12, value: 0x400080, size: 3 },
                    { name: 'main', info, value: 0x400083, size: 3 }
                ],
                [0x31, 0xc0, 0xc3]
            )
            const listing = listingOf(bytes, 'data-main')
            expectConsistent(listing, bytes)
            expect(listing.main).toBeUndefined()
            expect(listing.text).toContain('\nsection .rodata\nmain: db 0x31, 0xc0, 0xc3\n')
            expect(findProgramStart(decoder, bytes)).toEqual({ entry: 0x400080, main: undefined })
        }
    })

    it('lists the load segments of a program without section headers', () => {
        const bytes = withoutSectionHeaders(fixture('crackme'))
        const listing = listingOf(bytes, 'crackme')
        expectConsistent(listing, bytes)
        const text = listing.text
        expect(text).toContain('; No usable section headers')
        expect(text).toMatch(
            /\nsection load\.3 ; program header 3: PT_LOAD r-x, 0x555555555000 to 0x5555555552c9\n/
        )
        expect(text).toMatch(/\nsection load\.\d ; program header \d: PT_LOAD rw-/)
        expect(listing.main).toBe(0x11e9)
        expect(text).toContain('\n_start:\n')
        expect(text).toContain('\nmain:\n')
        expect(text).toMatch(/lea rax, \[rel s_Enter_password\] +; "Enter password: "/)
        // The Core reads the dynamic symbols, relocations and PLT stubs through PT_DYNAMIC.
        expect(text).toContain('\nstrcmp@plt:\n')
        expect(text).toContain('\n    call strcmp@plt\n')
        expect(text).toContain('\n    call qword [rel __libc_start_main@got]\n')
    })

    it('refuses what is not an x86-64 ELF', () => {
        expect(() => listingOf(Uint8Array.of(1, 2, 3, 4), 'nothing', 0)).toThrow(ListingError)
        const arm = fixture('crackme')
        new DataView(arm.buffer).setUint16(18, 40, true)
        expect(() => listingOf(arm, 'arm', 0)).toThrow(/ARM/)
    })
})

describe('every fixture', () => {
    it('gives a Listing whose tables agree with its text', () => {
        for (const name of [
            'argv-env',
            'cpp',
            'crackme-argv',
            'crackme-static-pie',
            'hello-atexit',
            'hello-atexit-static-pie',
            'math',
            'overflow',
            'ptrace',
            'self-write'
        ]) {
            const bytes = fixture(name)
            const listing = listingOf(bytes, name)
            expectConsistent(listing, bytes)
            expect(listing.main, name).toBeDefined()
        }
    })
})

describe("a Build's quick look for main", () => {
    it('finds the entry point and main the Listing names, from _start alone', () => {
        // prettier-ignore
        const passedInEdi = buildElf([
            0xbf, 0x90, 0x00, 0x40, 0x00, 0xe8, 0x01, 0x00, 0x00, 0x00, 0xf4, 0xc3,
            0x90, 0x90, 0x90, 0x90, 0x31, 0xc0, 0xc3
        ], [])
        const cases: [string, Uint8Array][] = [
            ...[
                'argv-env',
                'avx',
                'cpp',
                'crackme',
                'crackme-argv',
                'crackme-static',
                'crackme-static-pie',
                'crackme-stripped',
                'hello-atexit',
                'hello-atexit-static',
                'hello-atexit-static-pie',
                'math',
                'overflow'
            ].map((name): [string, Uint8Array] => [name, fixture(name)]),
            ['stripped static', withoutSymbolTable(fixture('hello-atexit-static'))],
            ['no section headers', withoutSectionHeaders(fixture('crackme'))],
            ['main in edi', passedInEdi],
            ['hand-built', handBuiltElf()],
            ['libc', libc()]
        ]
        for (const [name, bytes] of cases) {
            const listing = listingOf(bytes, name)
            expect(findProgramStart(decoder, bytes), name).toEqual({
                entry: listing.entry,
                main: listing.main
            })
        }
        expect(findProgramStart(decoder, new TextEncoder().encode('not an ELF'))).toBeUndefined()
        //nineteen whole Listings, libc's among them: about 3.5 s alone, past 5 s under load
    }, 30_000)
})

describe('determinism', () => {
    it('gives the same Listing, byte for byte, for the same input', () => {
        for (const name of ['crackme', 'crackme-stripped', 'cpp']) {
            const first = listingOf(fixture(name), name)
            const second = listingOf(fixture(name).slice(), name)
            expect(second.text).toBe(first.text)
            expect(second.labels).toEqual(first.labels)
            expect(second.functions).toEqual(first.functions)
            expect(second.lines).toEqual(first.lines)
        }
    })

    it('names nothing after the load base, which only moves the printed addresses', () => {
        const bytes = fixture('crackme-stripped')
        const planned = listingOf(bytes, 'crackme', PIE_BASE)
        const elsewhere = listingOf(bytes, 'crackme', 0x7fff55554000)
        expect(elsewhere.labels).toEqual(planned.labels)
        expect(elsewhere.lines).toEqual(planned.lines)
        expect(elsewhere.text).not.toBe(planned.text)
        expect(elsewhere.text.replaceAll('0x7fff', '0x5555')).toBe(planned.text)
    })
})

/**
 * A static C++ program at fixed addresses: `main` calls a lambda of its own and `g<"x">()`, and
 * takes the address of a vtable, an object inside `.text` whose two slots point to a deleting
 * destructor and a `const` member function. `g`'s name reads with quotes, as LLVM prints a
 * template argument made from a string, through a demangler that reads it so.
 */
function handBuiltCpp(): Uint8Array {
    // prettier-ignore
    const text = [
        0xe8, 0x0b, 0x00, 0x00, 0x00, // 0x400080 main: call 0x400090, the lambda
        0xbf, 0x98, 0x00, 0x40, 0x00, // 0x400085 mov edi, 0x400098, the vtable
        0xe8, 0x06, 0x00, 0x00, 0x00, // 0x40008a call 0x400095, g
        0xc3, //                         0x40008f ret
        0x31, 0xc0, 0xc3, //             0x400090 the lambda: xor eax, eax; ret
        0xc3, //                         0x400093 game::Boss::~Boss() [deleting]
        0xc3, //                         0x400094 game::Boss::bonus() const
        0xc3, //                         0x400095 g
        0x90, 0x90, //                   0x400096 padding
        0x93, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, // 0x400098 vtable for game::Boss
        0x94, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00
    ]
    return buildElf(text, [
        { name: '_ZZ4mainENKUliE_clEi', info: 0x02, value: 0x400090, size: 3 },
        { name: '_ZTVN4game4BossE', info: 0x01, value: 0x400098, size: 16 },
        { name: 'main', info: 0x12, value: 0x400080, size: 0x10 },
        { name: '_ZN4game4BossD0Ev', info: 0x12, value: 0x400093, size: 1 },
        { name: '_ZNK4game4Boss5bonusEv', info: 0x12, value: 0x400094, size: 1 },
        { name: '_Z1gv', info: 0x12, value: 0x400095, size: 1 }
    ])
}

describe('C++ names', () => {
    const C_PROGRAMS = ['crackme', 'crackme-stripped', 'hello-atexit-static', 'math', 'avx']

    it("leaves a C program's Listing byte for byte as it is, asking the demangler nothing", () => {
        for (const name of C_PROGRAMS) {
            const bytes = fixture(name)
            const asked: string[] = []
            const watched: Demangler = {
                describe: (mangled) => {
                    asked.push(mangled)
                    return demangler.describe(mangled)
                }
            }
            const plain = listingOf(bytes, name)
            const named = listingOf(bytes, name, undefined, watched)
            expect(named.text, name).toBe(plain.text)
            expect(named.lines, name).toEqual(plain.lines)
            expect(named.labels, name).toEqual(plain.labels)
            expect(named.functions, name).toEqual(plain.functions)
            expect(named.labels.some((label) => 'demangled' in label)).toBe(false)
            expect(named.functions.some((fn) => 'list' in fn)).toBe(false)
            expect(asked, name).toEqual([])
        }
    }, 30_000)

    it("says the cpp fixture's C++ names in comments, its text keeping the raw names", () => {
        const bytes = fixture('cpp')
        const plain = listingOf(bytes, 'cpp')
        const listing = listingOf(bytes, 'cpp', PIE_BASE, demangler)
        expectConsistent(listing, bytes)
        // Only comments are added: every line's code, the line table and the labels' names stay.
        const before = linesOf(plain)
        const after = linesOf(listing)
        expect(after.length).toBe(before.length)
        after.forEach((line, i) =>
            expect(withoutComment(line).trimEnd(), `line ${i}`).toBe(
                withoutComment(before[i]).trimEnd()
            )
        )
        expect(listing.lines).toEqual(plain.lines)
        expect(listing.labels.map(({ demangled: _, ...label }) => label)).toEqual(plain.labels)
        expect(listing.functions.map(({ list: _, ...fn }) => fn)).toEqual(plain.functions)

        const lines = linesOf(listing)
        const hash = createHash('sha256').update(listing.text).digest('hex')
        const excerpt = [
            `; Excerpt of the Listing of cpp with C++ names, whose whole text has SHA-256 ${hash}`,
            functionText(listing, 'main'),
            functionText(listing, '_Znwm@plt'),
            ...lines.filter(
                (line, i) => listing.lines.kinds[i] === LINE_KIND.data && line.includes(' ; ')
            ),
            ''
        ].join('\n')
        expectSnapshot('cpp.excerpt.asm', excerpt)

        const main = functionText(listing, 'main')
        // A call, its signature beside it; one over 100 characters as its short name and `(…)`.
        expect(main).toContain(
            '\n    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev ; std::string::~basic_string()\n'
        )
        expect(main).toContain(
            '\n    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EEC1ESt16initializer_listIS5_ERKS6_ ; std::vector<std::string>::vector(…)\n'
        )
        // A label line, a PLT stub's jump through its GOT slot, the slot, and data.
        expect(listing.text).toMatch(/\n_Znwm@plt: +; operator new\(unsigned long\)\n/)
        expect(listing.text).toMatch(
            /\n {4}jmp qword \[rel _Znwm@got\] +; operator new\(unsigned long\)\n/
        )
        // The slot's own name and the stub it points to say the same: once.
        expect(listing.text).toMatch(
            /\n_Znwm@got: dq _Znwm@plt_resolver +; operator new\(unsigned long\)\n/
        )
        expect(listing.text).toMatch(/\n_ZSt4cout@GLIBCXX_3\.4: resb 272 +; std::cout\n/)
        expect(listing.text).toMatch(
            /\n_ZTISt13runtime_error@GLIBCXX_3\.4: dq 0 +; typeinfo for std::runtime_error\n/
        )
    })

    it("gives the cpp fixture's labels their demangled forms and its functions their list forms", () => {
        const listing = listingOf(fixture('cpp'), 'cpp', PIE_BASE, demangler)
        const label = (name: string) => listing.labels.find((candidate) => candidate.name === name)!
        expect(label('_Znwm@plt')).toMatchObject({
            name: '_Znwm@plt',
            fullName: '_Znwm@plt',
            kind: 'function',
            origin: 'plt',
            demangled: {
                kind: 'function',
                mangled: '_Znwm',
                suffix: '@plt',
                short: 'operator new@plt',
                signature: 'operator new(unsigned long)@plt',
                comment: 'operator new(unsigned long)',
                text: 'operator new(unsigned long)',
                list: 'operator new@plt',
                pseudocode: { namespace: [], name: 'operator new', symbol: '_Znwm' }
            }
        })
        expect(label('_ZSt4cout@GLIBCXX_3.4').demangled).toMatchObject({
            kind: 'data',
            short: 'std::cout@GLIBCXX_3.4',
            comment: 'std::cout',
            pseudocode: { namespace: ['std'], name: 'cout', symbol: '_ZSt4cout' }
        })
        expect(label('main').demangled).toBeUndefined()
        expect(listing.labels.filter((each) => each.kind === 'block' && each.demangled)).toEqual([])

        const fn = (name: string) => listing.functions.find((candidate) => candidate.name === name)!
        expect(fn('main').list).toBeUndefined()
        expect(fn('_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev').list).toBe(
            'std::string::~basic_string'
        )
        // Two stubs of one name's overloads read alike as short names: their signatures tell them
        // apart.
        expect(fn('_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c@plt').list).toBe(
            'std::operator<<<std::char_traits<char>>(std::ostream&, char)@plt'
        )
        expect(fn('_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_PKc@plt').list).toBe(
            'std::operator<<<std::char_traits<char>>(std::ostream&, char const*)@plt'
        )
        for (const each of listing.functions) {
            const named = label(each.name).demangled
            expect(each.list, each.name).toBe(named?.list)
        }
    })

    it('comments calls, an absolute address, a vtable and label lines, and escapes quotes', () => {
        const bytes = handBuiltCpp()
        const quoted: Demangler = {
            describe: (mangled) => {
                const read = demangler.describe(mangled)
                return mangled === '_Z1gv' && read
                    ? { ...read, name: `g${OPEN}"x"${CLOSE}`, text: 'int g<"x">()' }
                    : read
            }
        }
        const listing = listingOf(bytes, 'hand-built C++', 0, quoted)
        expectConsistent(listing, bytes)
        expect(functionText(listing, 'main')).toBe(
            [
                'main:',
                "    call _ZZ4mainENKUliE_clEi           ; main::'lambda'(int)::operator()(int) const",
                '    mov edi, 0x400098                   ; _ZTVN4game4BossE vtable for game::Boss',
                '    call _Z1gv                          ; g<\\"x\\">()',
                '    ret'
            ].join('\n')
        )
        expect(functionText(listing, '_Z1gv')).toBe(
            [
                '_Z1gv:                                  ; g<\\"x\\">()',
                '    ret',
                '    nop',
                '    nop',
                '_ZTVN4game4BossE:                       ; vtable for game::Boss',
                '    dq _ZN4game4BossD0Ev                ; game::Boss::~Boss() [deleting]',
                '    dq _ZNK4game4Boss5bonusEv           ; game::Boss::bonus() const'
            ].join('\n')
        )
    })

    it('numbers a second local static of one name apart, as its label is numbered', () => {
        // Two translation units' `static const char *greeting() { static … text; }`. The demangler
        // reads `_ZZL8greetingvE4text_2` too, its `_2` a discriminator.
        // prettier-ignore
        const text = [
            0x48, 0x8b, 0x05, 0x09, 0x00, 0x00, 0x00, // 0x400080 mov rax, [rel 0x400090]
            0x48, 0x8b, 0x05, 0x0a, 0x00, 0x00, 0x00, // 0x400087 mov rax, [rel 0x400098]
            0xc3, 0x90, //                                0x40008e ret; nop
            ...Array<number>(16).fill(0) //               0x400090, 0x400098 the two `text`s
        ]
        const bytes = buildElf(text, [
            { name: '_ZZL8greetingvE4text', info: 0x01, value: 0x400090, size: 8 },
            { name: '_ZZL8greetingvE4text', info: 0x01, value: 0x400098, size: 8 },
            { name: '_start', info: 0x12, value: 0x400080, size: 0x10 }
        ])
        const listing = listingOf(bytes, 'statics', 0, demangler)
        expectConsistent(listing, bytes)
        const label = (name: string) => listing.labels.find((each) => each.name === name)
        expect(label('_ZZL8greetingvE4text')?.demangled).toMatchObject({
            mangled: '_ZZL8greetingvE4text',
            suffix: '',
            short: 'greeting()::text'
        })
        expect(label('_ZZL8greetingvE4text_2')?.demangled).toMatchObject({
            mangled: '_ZZL8greetingvE4text',
            suffix: '_2',
            short: 'greeting()::text_2',
            pseudocode: { namespace: ['greeting()'], name: 'text' }
        })
    })

    it("keeps the words of a comment's demangled name from reading as names", () => {
        const listing = listingOf(handBuiltCpp(), 'hand-built C++', 0, demangler)
        const index = ListingIndex.of(listing)
        const lines = linesOf(listing)
        const call = lines.findIndex((line) => line.startsWith('    call _ZZ4main'))
        const text = lines[call]
        // The operand is a name; `main` in the comment is a word of the lambda's name, though a
        // label has it.
        const operand = listingTokenAt(text, text.indexOf('_ZZ4main') + 2)!
        expect(index.inDemangledComment(text, call, operand.start)).toBe(false)
        expect(index.label(operand.text, call)?.address).toBe(0x400090)
        const word = listingTokenAt(text, text.indexOf('main::') + 1)!
        expect(word.text).toBe('main')
        expect(index.label(word.text, call)).toBeDefined()
        expect(index.inDemangledComment(text, call, word.start)).toBe(true)
        const main = index.label('main', call)!
        // The header's `(main)` and main's own label, not the lambda's name.
        expect(index.references(main).map((span) => span.line)).toEqual([
            lines.findIndex((line) => line.startsWith('; Entry point')),
            main.line
        ])
        // An absolute address's comment names its label raw, then says its demangled name.
        const move = lines.findIndex((line) => line.startsWith('    mov edi'))
        const moved = lines[move]
        const raw = moved.indexOf('_ZTVN4game4BossE')
        expect(index.inDemangledComment(moved, move, raw)).toBe(false)
        expect(index.inDemangledComment(moved, move, moved.indexOf('game::'))).toBe(true)
        expect(
            index.references(index.label('_ZTVN4game4BossE', move)!).map((span) => span.line)
        ).toEqual([move, lines.findIndex((line) => line.startsWith('_ZTVN4game4BossE:'))])
        // A label line's comment, and a Listing without demangled names, mask nothing.
        const lambda = lines.findIndex((line) => line.startsWith('_ZZ4main'))
        expect(
            index.inDemangledComment(lines[lambda], lambda, lines[lambda].indexOf('main::'))
        ).toBe(true)
        const plain = listingOf(handBuiltCpp(), 'hand-built C++', 0)
        expect(ListingIndex.of(plain).inDemangledComment('    call x ; main', 0, 12)).toBe(false)
    })
})

describe('Annotations', () => {
    function annotated(
        bytes: Uint8Array,
        name: string,
        annotations: ListingAnnotations,
        names?: Demangler
    ) {
        const base = decoder.analyze(bytes).pie ? PIE_BASE : 0
        return generateListing(decoder, {
            bytes,
            name,
            base,
            version: 'v1',
            demangler: names,
            annotations
        })
    }
    /** The first 0-based line at or after `from` whose code, without its comment, is `code`. */
    function lineWith(listing: Listing, code: string, from = 0): number {
        const line = linesOf(listing).findIndex(
            (candidate, i) => i >= from && withoutComment(candidate).trim() === code
        )
        expect(line, code).toBeGreaterThanOrEqual(0)
        return line
    }
    const labelNamed = (listing: Listing, fullName: string) =>
        listing.labels.find((label) => label.fullName === fullName)!

    it('leaves a Listing as it is without annotations, or with none that apply', () => {
        for (const name of ['crackme', 'crackme-stripped', 'hello-atexit-static', 'cpp']) {
            const bytes = fixture(name)
            const names = name === 'cpp' ? demangler : undefined
            const plain = listingOf(bytes, name, undefined, names)
            const [first] = plain.functions
            for (const annotations of [
                {},
                { names: new Map(), comments: new Map(), functionComments: new Map() },
                // Nothing at these addresses, a function's own name, empty comments.
                {
                    names: new Map([
                        [0, 'nowhere'],
                        [first.address, first.name]
                    ]),
                    comments: new Map([
                        [0x10, 'in the ELF header'],
                        [first.address, '']
                    ]),
                    functionComments: new Map([
                        [1, 'nothing'],
                        [first.address, '']
                    ])
                }
            ] satisfies ListingAnnotations[]) {
                const listing = annotated(bytes, name, annotations, names)
                expect(listing.text, name).toBe(plain.text)
                expect(listing.lines, name).toEqual(plain.lines)
                expect(listing.labels, name).toEqual(plain.labels)
                expect(listing.functions, name).toEqual(plain.functions)
                expect('comments' in listing, name).toBe(false)
            }
        }
    }, 60_000)

    it('renames a function, a string, a datum and a jump target wherever their names are written', () => {
        const bytes = fixture('crackme')
        const plain = listingOf(bytes, 'crackme')
        const at = (fullName: string) => labelNamed(plain, fullName).address
        const listing = annotated(bytes, 'crackme', {
            names: new Map([
                [at('main'), 'check_password'],
                [at('s_hunter2'), 'password'],
                [at('DAT_nimble_sandpiper'), 'newline'],
                [at('frame_dummy'), 'setup_frames'],
                // A jump target's name is kept without the dot it is written with.
                [at('main.LAB_2'), 'wrong']
            ])
        })
        expectConsistent(listing, bytes)
        // Only names change: the same lines, at the same addresses.
        expect(listing.lines).toEqual(plain.lines)
        expect(linesOf(listing).slice(0, 6)).toEqual(linesOf(plain).slice(0, 6))
        const text = listing.text
        expect(text).toContain('\n    lea rdi, [rel check_password]\n')
        expect(text).not.toContain('\nmain:\n')
        expect(text).toMatch(/\n {4}lea rdx, \[rel password\] +; "hunter2"\n/)
        expect(text).toMatch(/\n {4}lea rdx, \[rel newline\] +; "\\n"\n/)
        expect(text).toContain('\npassword: db "hunter2", 0\n')
        expect(text).toContain('\n__frame_dummy_init_array_entry: dq setup_frames\n')
        const check = functionText(listing, 'check_password')
        expect(check.startsWith('check_password:\n')).toBe(true)
        expect(check).toContain('\n    jne .wrong\n')
        expect(check).toContain('\n.wrong:\n')
        // Another function's `.LAB_2` is its own.
        expect(functionText(listing, '__do_global_dtors_aux')).toContain('\n.LAB_2:\n')

        expect(
            listing.labels
                .filter((label) => label.renamed)
                .map(({ name, fullName, origin, renamed }) => ({ name, fullName, origin, renamed }))
        ).toEqual([
            {
                name: 'setup_frames',
                fullName: 'setup_frames',
                origin: 'symbol',
                renamed: { from: 'frame_dummy' }
            },
            {
                name: 'check_password',
                fullName: 'check_password',
                origin: 'symbol',
                renamed: { from: 'main' }
            },
            {
                name: '.wrong',
                fullName: 'check_password.wrong',
                origin: 'block',
                renamed: { from: '.LAB_2' }
            },
            {
                name: 'newline',
                fullName: 'newline',
                origin: 'invented',
                renamed: { from: 'DAT_nimble_sandpiper' }
            },
            {
                name: 'password',
                fullName: 'password',
                origin: 'string',
                renamed: { from: 's_hunter2' }
            }
        ])
        // Every label is where it was, and the functions are named as their labels.
        expect(
            listing.labels.map((label) => [
                label.address,
                label.kind,
                label.renamed?.from ?? label.name
            ])
        ).toEqual(plain.labels.map((label) => [label.address, label.kind, label.name]))
        const renamedFunctions: Record<string, string> = {
            main: 'check_password',
            frame_dummy: 'setup_frames'
        }
        expect(listing.functions).toEqual(
            plain.functions.map((fn) => ({ ...fn, name: renamedFunctions[fn.name] ?? fn.name }))
        )
        const index = ListingIndex.of(listing)
        const block = labelNamed(listing, 'check_password.wrong')
        expect(index.label('.wrong', lineWith(listing, 'jne .wrong'))).toBe(block)
        expect(index.references(block).map((span) => span.line)).toEqual([
            lineWith(listing, 'jne .wrong'),
            block.line
        ])
        // The hover says what the name was, then where that came from.
        expect(labelHoverMarkdown(listing, labelNamed(listing, 'check_password'))).toBe(
            [
                '**check_password** at `0x5555555551e9`',
                'Renamed from `main`.',
                'Named by the symbol table.'
            ].join('\n\n')
        )
        expect(labelHoverMarkdown(listing, block)).toBe(
            [
                `**check_password.wrong** at \`0x${(block.address + PIE_BASE).toString(16)}\``,
                'Renamed from `.LAB_2`.',
                'A place a jump goes to inside `check_password`.'
            ].join('\n\n')
        )
    })

    it("keeps a stripped program's Invented names, renaming one of them or all", () => {
        const bytes = fixture('crackme-stripped')
        const plain = listingOf(bytes, 'crackme-stripped')
        const invented = plain.labels.filter((label) => label.origin === 'invented')
        const barracuda = labelNamed(plain, 'FUN_bronze_barracuda')
        const one = annotated(bytes, 'crackme-stripped', {
            names: new Map([[barracuda.address, 'first']])
        })
        expectConsistent(one, bytes)
        expect(one.labels.map((label) => label.name)).toEqual(
            plain.labels.map((label) => (label === barracuda ? 'first' : label.name))
        )
        expect(labelHoverMarkdown(one, labelNamed(one, 'first'))).toContain(
            'Renamed from `FUN_bronze_barracuda`.\n\nAn invented name: nothing in the file names this function'
        )
        const all = annotated(bytes, 'crackme-stripped', {
            names: new Map(invented.map((label, i) => [label.address, `named_${i}`]))
        })
        expectConsistent(all, bytes)
        expect(all.labels.map((label) => label.name)).toEqual(
            plain.labels.map((label) => {
                const i = invented.indexOf(label)
                return i < 0 ? label.name : `named_${i}`
            })
        )
    })

    it('writes a renamed C++ function as named, its demangled forms kept for the hover', () => {
        const bytes = fixture('cpp')
        const plain = listingOf(bytes, 'cpp', PIE_BASE, demangler)
        const raw = '_ZNSt15__new_allocatorIcED1Ev'
        const forms = labelNamed(plain, raw).demangled!
        expect(forms.short).toBe('std::__new_allocator<char>::~__new_allocator')
        const listing = annotated(
            bytes,
            'cpp',
            { names: new Map([[labelNamed(plain, raw).address, 'free_chars']]) },
            demangler
        )
        expectConsistent(listing, bytes)
        expect(listing.lines).toEqual(plain.lines)
        const lines = linesOf(listing)
        // No demangled comment: the person's name says what the function is.
        expect(lines).toContain('free_chars:')
        const calls = lines.filter((line) => line.includes('free_chars'))
        expect(calls.length).toBeGreaterThan(2)
        for (const line of calls) expect(line).toMatch(/^(?:free_chars:| {4}call free_chars)$/)
        expect(listing.text).not.toContain(raw)
        const label = labelNamed(listing, 'free_chars')
        expect(label.demangled).toBeUndefined()
        expect(label.renamed).toEqual({ from: raw, demangled: forms })
        expect(listing.functions.find((fn) => fn.name === 'free_chars')).not.toHaveProperty('list')
        // Every other function keeps its list form.
        expect(
            listing.functions.filter((fn) => fn.name !== 'free_chars').map((fn) => fn.list)
        ).toEqual(plain.functions.filter((fn) => fn.name !== raw).map((fn) => fn.list))
        const hover = labelHoverMarkdown(listing, label)
        expect(hover).toContain(`Renamed from \`${forms.signature}\`.`)
        expect(hover).toContain(`name \`${raw}\``)
        expect(hover.endsWith('Named by the symbol table.')).toBe(true)
    })

    it("keeps a PLT stub's and a GOT slot's library names", () => {
        const bytes = fixture('crackme')
        const plain = listingOf(bytes, 'crackme')
        const listing = annotated(bytes, 'crackme', {
            names: new Map(
                [
                    'puts@plt',
                    'puts@plt_resolver',
                    '__gmon_start__@got',
                    '__libc_start_main@got'
                ].map((name) => [labelNamed(plain, name).address, 'say'])
            )
        })
        expect(listing.text).toBe(plain.text)
        expect(listing.labels).toEqual(plain.labels)
    })

    it('refuses a name another label has, until one of the two changes', () => {
        const bytes = fixture('crackme')
        const plain = listingOf(bytes, 'crackme')
        const at = (fullName: string) => labelNamed(plain, fullName).address
        const renames = (names: [string, string][]) => {
            const listing = annotated(bytes, 'crackme', {
                names: new Map(names.map(([from, to]) => [at(from), to]))
            })
            expectConsistent(listing, bytes)
            return listing.labels
                .filter((label) => label.renamed || label.renameConflict)
                .map((label) => [
                    label.renamed?.from ?? label.name,
                    label.name,
                    label.renameConflict
                ])
        }
        expect(renames([['main', '_start']])).toEqual([['main', 'main', '_start']])
        // The Pseudocode would print `puts@plt` as `puts`.
        expect(renames([['main', 'puts']])).toEqual([['main', 'main', 'puts']])
        // The lower address takes a name two are given.
        expect(
            renames([
                ['_init', 'setup'],
                ['_fini', 'setup']
            ])
        ).toEqual([
            ['_init', 'setup', undefined],
            ['_fini', '_fini', 'setup']
        ])
        // A name a rename takes away is free.
        expect(
            renames([
                ['_init', '_fini'],
                ['_fini', '_init']
            ])
        ).toEqual([
            ['_init', '_fini', undefined],
            ['_fini', '_init', undefined]
        ])
        // A refused rename keeps its label's name, which another rename then cannot take.
        expect(
            renames([
                ['_init', '_fini'],
                ['_fini', 'puts']
            ])
        ).toEqual([
            ['_init', '_init', '_fini'],
            ['_fini', '_fini', 'puts']
        ])
        // An alias at the same address gives way, rather than defining the name twice.
        const aliased = renames([['data_start', '__data_start']])
        expect(aliased).toEqual([['data_start', '__data_start', undefined]])
        // A jump target's name is unique within its function only.
        expect(renames([['main.LAB_1', 'LAB_2']])).toEqual([['.LAB_1', '.LAB_1', '.LAB_2']])
        expect(
            renames([
                ['main.LAB_1', 'LAB_2'],
                ['main.LAB_2', 'LAB_1']
            ])
        ).toEqual([
            ['.LAB_1', '.LAB_2', undefined],
            ['.LAB_2', '.LAB_1', undefined]
        ])
        expect(
            renames([
                ['_init.LAB_1', 'retry'],
                ['main.LAB_1', 'retry']
            ])
        ).toEqual([
            ['.LAB_1', '.retry', undefined],
            ['.LAB_1', '.retry', undefined]
        ])
        const refused = annotated(bytes, 'crackme', { names: new Map([[at('main'), '_start']]) })
        expect(refused.text).toBe(plain.text)
        expect(labelHoverMarkdown(refused, labelNamed(refused, 'main'))).toBe(
            [
                '**main** at `0x5555555551e9`',
                'You renamed this to `_start`, but another label already has that name, so the original name is shown instead.',
                'Named by the symbol table.'
            ].join('\n\n')
        )
    })

    /** crackme's `main` with a comment of every form. */
    function commentedCrackme() {
        const bytes = fixture('crackme')
        const plain = listingOf(bytes, 'crackme')
        const main = labelNamed(plain, 'main')
        const address = (code: string, from = main.line) =>
            plain.lines.addresses[lineWith(plain, code, from)]
        const sixty = 'reads up to 127 characters of a line from stdin, and its NUL'
        const sixtyOne = 'compares the line with the password the program keeps in data'
        const comments = new Map([
            [address('push rbp'), 'saves the frame'],
            [address('lea rdx, [rel s_hunter2]'), 'the password'],
            [address('call printf@plt'), 'prompts; main reads the answer next'],
            [address('call fgets@plt'), sixty],
            [address('call strcmp@plt'), sixtyOne],
            [
                address('test eax, eax'),
                'compares what was typed with the password: zero in eax means they are equal, so the program prints Correct! and returns zero'
            ],
            [
                address('lea rdx, [rel DAT_nimble_sandpiper]'),
                'strips the line break\n\nfgets keeps it'
            ],
            // Inside an instruction: on its line.
            [address('mov eax, 0x00', lineWith(plain, '.LAB_3:')) + 2, 'inside'],
            // Two on one line: both above it.
            [address('call puts@plt') + 0, 'one'],
            [address('call puts@plt') + 1, 'two'],
            [labelNamed(plain, 's_hunter2').address, 'the secret'],
            [labelNamed(plain, 's_Wrong').address, `${sixtyOne}, again`]
        ])
        const functionComments = new Map([
            [
                main.address,
                'Asks for a password on stdin and says whether it is right.\nmain returns 1 when stdin ends.'
            ],
            // No function starts at `leave`: above its line.
            [address('leave'), 'restores the frame']
        ])
        const listing = annotated(bytes, 'crackme', { comments, functionComments })
        return { bytes, plain, listing, comments, functionComments, sixty, sixtyOne }
    }

    it('writes a short comment at the end of its line, a longer one above it and a function comment above its labels', () => {
        const { bytes, plain, listing, sixty, sixtyOne } = commentedCrackme()
        expectConsistent(listing, bytes)
        expect(sixty).toHaveLength(60)
        expect(sixtyOne).toHaveLength(61)
        const main = functionText(listing, 'main')
        const lines = linesOf(listing)
        const mainLabel = labelNamed(listing, 'main')
        // The function comment, between the blank line and the label.
        expect(lines.slice(mainLabel.line - 3, mainLabel.line + 3)).toEqual([
            '',
            '; Asks for a password on stdin and says whether it is right.',
            '; main returns 1 when stdin ends.',
            'main:',
            '    endbr64',
            '    push rbp                            ; saves the frame'
        ])
        expect(main).toContain(
            '\n    lea rdx, [rel s_hunter2]            ; "hunter2" ; the password\n'
        )
        expect(main).toContain(
            '\n    call printf@plt                     ; prompts; main reads the answer next\n'
        )
        expect(main).toContain(`\n    call fgets@plt                      ; ${sixty}\n`)
        expect(main).toContain(`\n    ; ${sixtyOne}\n    call strcmp@plt\n`)
        expect(main).toContain(
            [
                '',
                '    ; compares what was typed with the password: zero in eax means they are equal, so the program',
                '    ; prints Correct! and returns zero',
                '    test eax, eax',
                ''
            ].join('\n')
        )
        // After the jump target's label, its own line breaks and empty line kept.
        expect(main).toContain(
            [
                '',
                '.LAB_1:',
                '    ; strips the line break',
                '    ;',
                '    ; fgets keeps it',
                '    lea rdx, [rel DAT_nimble_sandpiper] ; "\\n"',
                ''
            ].join('\n')
        )
        expect(main).toContain('\n.LAB_3:\n    mov eax, 0x00                       ; inside\n')
        expect(main).toContain('\n    ; one\n    ; two\n    call puts@plt\n')
        expect(main).toContain('\n.LAB_5:\n; restores the frame\n    leave\n')
        // Data: at the end of an inline label's line, or above it, the label still on its line.
        expect(lines).toContain('s_hunter2: db "hunter2", 0              ; the secret')
        const wrong = labelNamed(listing, 's_Wrong')
        expect(lines.slice(wrong.line - 1, wrong.line + 1)).toEqual([
            `    ; ${sixtyOne}, again`,
            's_Wrong: db "Wrong!", 0'
        ])
        // Every other line is as it was.
        const code = (listing: Listing) =>
            linesOf(listing)
                .filter(
                    (_, line) =>
                        listing.lines.kinds[line] !== LINE_KIND.comment ||
                        listing.lines.addresses[line] < 0
                )
                .map((line) => withoutComment(line).trimEnd())
        expect(code(listing)).toEqual(code(plain))
    })

    it('notes the lines of a comment, which cover no bytes, and the line table passes over them', () => {
        const { listing, plain, comments, functionComments } = commentedCrackme()
        const { kinds, addresses, sizes, offsets, byAddress } = listing.lines
        const person = listing.comments!
        // The lines holding bytes are the plain Listing's, in the same order.
        const covering = (l: Listing) =>
            Array.from(l.lines.byAddress, (line) => [l.lines.addresses[line], l.lines.sizes[line]])
        expect(covering(listing)).toEqual(covering(plain))
        expect([...byAddress].some((line) => kinds[line] === LINE_KIND.comment)).toBe(false)
        const lines = linesOf(listing)
        const noted = Array.from(person.lines, (line, i) => ({
            line,
            address: person.addresses[i],
            kind: person.kinds[i],
            text: lines[line].slice(lines[line].length - person.lengths[i])
        }))
        // In line order, each line once, and every one's person's part a comment that is theirs.
        expect(noted.map((entry) => entry.line)).toEqual(
            [...new Set(person.lines)].sort((a, b) => a - b)
        )
        for (const { line, address, kind, text } of noted) {
            expect(text.startsWith(';'), lines[line]).toBe(true)
            const said = text.replace(/^; ?/, '')
            const source =
                kind === PERSON_COMMENT.function
                    ? functionComments.get(address)!
                    : comments.get(address)!
            expect(source, lines[line]).toBeDefined()
            if (kind === PERSON_COMMENT.end) {
                expect(said).toBe(source)
                expect(kinds[line]).not.toBe(LINE_KIND.comment)
            } else {
                // A line of its own: kind comment, the address it annotates, no bytes.
                expect(source.replace(/\s+/g, ' ')).toContain(said.replace(/\s+/g, ' '))
                expect(lines[line].length).toBeLessThanOrEqual(100)
                expect(kinds[line]).toBe(LINE_KIND.comment)
                expect(addresses[line]).toBe(address)
                expect([sizes[line], offsets[line]]).toEqual([0, -1])
                expect(instructionAddressAt(listing, line)).toBeUndefined()
            }
        }
        expect(noted.filter((entry) => entry.kind === PERSON_COMMENT.end)).toHaveLength(6)
        // A function comment is between functions; a comment above a line is in its function.
        const main = listing.functions.find((fn) => fn.name === 'main')!
        const first = noted.find((entry) => entry.kind === PERSON_COMMENT.function)!
        expect(first.line).toBe(main.line - 2)
        expect(functionAtLine(listing, first.line)).toBeUndefined()
        const previous = listing.functions[listing.functions.indexOf(main) - 1]
        expect(previous.endLine).toBe(main.line - 3)
        const above = noted.find((entry) => entry.kind === PERSON_COMMENT.above)!
        expect(functionAtLine(listing, above.line)).toBe(main)
        // Each commented address is still found on the line that holds it.
        for (const address of [...comments.keys(), ...functionComments.keys()]) {
            const line = lineOfAddress(listing, address)
            expect(kinds[line] === LINE_KIND.instruction || kinds[line] === LINE_KIND.data).toBe(
                true
            )
            expect(withoutComment(lines[line]).trimEnd()).toBe(
                withoutComment(linesOf(plain)[lineOfAddress(plain, address)]).trimEnd()
            )
        }
    })

    it('keeps Breakpoints, the Pseudocode and places on their lines across comment lines', () => {
        const { listing, plain, comments } = commentedCrackme()
        const session = (l: Listing) =>
            ({ session: new Map([['crackme', { listing: l }]]) }) as unknown as ListingDocuments
        const code = (l: Listing, line: number) => withoutComment(linesOf(l)[line]).trimEnd()
        for (const address of comments.keys()) {
            const line = breakpointLine({ file: 'crackme', address }, session(listing))
            const before = breakpointLine({ file: 'crackme', address }, session(plain))
            expect(line).toBeGreaterThan(before)
            expect(code(listing, line)).toBe(code(plain, before))
        }
        // A Pseudocode line of each of main's instructions maps to that instruction's line.
        const main = listing.functions.find((fn) => fn.name === 'main')!
        const instructions: number[] = []
        for (let line = main.line; line < main.endLine; ++line) {
            const address = instructionAddressAt(listing, line)
            if (address !== undefined) instructions.push(address)
        }
        const map = pseudocodeMap(
            listing,
            main,
            instructions.map((address) => ({ text: '', tokens: [], addresses: [address] })),
            0
        )
        map.listingLines.forEach((lines, row) => {
            expect(lines).toHaveLength(1)
            expect(instructionAddressAt(listing, lines[0])).toBe(instructions[row])
        })
        // Every line that stands for an address is found again by it, in either Listing.
        for (let line = 0; line < plain.lines.kinds.length; ++line) {
            const place = placeOfLine(plain, line)
            if (!place) continue
            const found = lineOfPlace(listing, place)
            expect(
                linesOf(listing)[found].startsWith(withoutComment(linesOf(plain)[line]).trimEnd()),
                `line ${line}`
            ).toBe(true)
        }
        const { kinds, addresses } = listing.lines
        for (let line = 0; line < kinds.length; ++line) {
            if (kinds[line] !== LINE_KIND.comment || addresses[line] < 0) continue
            const place = placeOfLine(listing, line)!
            expect(place.kind).toBe(LINE_KIND.comment)
            expect(lineOfPlace(listing, place), linesOf(listing)[line]).toBe(line)
            // Without the comment, the line holding its address.
            expect(lineOfPlace(plain, place)).toBe(lineOfAddress(plain, place.address))
        }
        const labelLine = labelNamed(listing, 'main').line
        expect(lineOfPlace(plain, placeOfLine(listing, labelLine)!)).toBe(
            labelNamed(plain, 'main').line
        )
    })

    it("reads a person's comment as text, never as names", () => {
        const { listing } = commentedCrackme()
        const index = ListingIndex.of(listing)
        const lines = linesOf(listing)
        const printf = lineWith(listing, 'call printf@plt')
        const text = lines[printf]
        const word = listingTokenAt(text, text.lastIndexOf('main') + 1)!
        expect(word.text).toBe('main')
        expect(index.label(word.text, printf)).toBeDefined()
        expect(index.inPersonComment(text, printf, word.start)).toBe(true)
        expect(index.inPersonComment(text, printf, text.indexOf('printf@plt'))).toBe(false)
        // The `;` the person typed is in their comment.
        expect(index.inPersonComment(text, printf, text.indexOf('prompts'))).toBe(true)
        // A line of its own, and the same line with other code before its comment.
        const functionLine = listing.comments!.lines[0]
        expect(index.inPersonComment(lines[functionLine], functionLine, 2)).toBe(true)
        const patched = `    call puts@plt${text.slice(text.indexOf(' ; '))}`
        expect(index.inPersonComment(patched, printf, patched.indexOf('puts@plt'))).toBe(false)
        expect(index.inPersonComment(patched, printf, patched.lastIndexOf('main'))).toBe(true)
        expect(index.endOfLineComment(printf)).toBe('prompts; main reads the answer next')
        expect(index.endOfLineComment(functionLine)).toBeUndefined()
        expect(index.endOfLineComment(lineWith(listing, 'ret'))).toBeUndefined()
        // References find main's label and the operand naming it, not the comments' words.
        const main = labelNamed(listing, 'main')
        expect(index.references(main).map((span) => lines[span.line])).toEqual([
            '    lea rdi, [rel main]',
            'main:'
        ])
    })

    it('renames and comments every function of a C++ program, its tables agreeing with its text', () => {
        const bytes = new Uint8Array(
            readFileSync(
                new URL('../../../../decompiler/js/tests/fixtures/elf/factcheck', import.meta.url)
            )
        )
        const plain = listingOf(bytes, 'factcheck', PIE_BASE, demangler)
        const names = new Map<number, string>()
        const functionComments = new Map<number, string>()
        for (const fn of plain.functions) {
            if (fn.name.includes('@')) continue
            names.set(fn.address, `renamed_${fn.address.toString(16)}`)
            functionComments.set(fn.address, `What ${fn.list ?? fn.name} does.`)
        }
        const comments = new Map<number, string>()
        const { kinds, addresses } = plain.lines
        for (let line = 0; line < kinds.length; line += 3)
            if (kinds[line] === LINE_KIND.instruction || kinds[line] === LINE_KIND.data)
                comments.set(
                    addresses[line],
                    comments.size % 2
                        ? `line ${line}`
                        : `line ${line}, with a comment long enough to be written above it rather than at its end`
                )
        const listing = annotated(
            bytes,
            'factcheck',
            { names, comments, functionComments },
            demangler
        )
        expectConsistent(listing, bytes)
        const covering = (l: Listing) =>
            Array.from(l.lines.byAddress, (line) => [l.lines.addresses[line], l.lines.sizes[line]])
        expect(covering(listing)).toEqual(covering(plain))
        expect(listing.functions.map((fn) => fn.address)).toEqual(
            plain.functions.map((fn) => fn.address)
        )
        // Every function but the PLT's has the person's name and no list form; no name clashed.
        for (const fn of listing.functions)
            expect(fn.name).toBe(
                names.get(fn.address) ?? plain.functions.find((p) => p.address === fn.address)!.name
            )
        expect(listing.functions.filter((fn) => names.has(fn.address) && fn.list)).toEqual([])
        expect(listing.labels.filter((label) => label.renameConflict)).toEqual([])
        // Each comment shows once, at its end or as lines above its line.
        const person = listing.comments!
        const shown = new Set(
            Array.from(person.addresses).filter(
                (_, i) => person.kinds[i] !== PERSON_COMMENT.function
            )
        )
        expect(shown).toEqual(new Set(comments.keys()))
        expect(
            new Set(
                Array.from(person.addresses).filter(
                    (_, i) => person.kinds[i] === PERSON_COMMENT.function
                )
            )
        ).toEqual(new Set(functionComments.keys()))
    }, 30_000)
})
