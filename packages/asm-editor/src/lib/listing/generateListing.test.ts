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
import { loadDecoder, type ListingDecoder } from './decoder'
import { generateListing, ListingError } from './generateListing'
import { findProgramStart } from './programStart'
import { functionAtLine, LINE_KIND, lineOfAddress, lineOfFileOffset, type Listing } from './listing'

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
 * A static executable at 0x400000 of one `.text` section at 0x400080, its entry point, with the
 * given symbols in `.symtab` (info is `st_info`: 0x12 a global function, 0x02 a local one, 0x01
 * a local object).
 */
function buildElf(text: number[], symbols: HandBuiltSymbol[]): Uint8Array {
    const align = (value: number) => (value + 7) & ~7
    const shstrtab = '\0.text\0.symtab\0.strtab\0.shstrtab\0'
    const strtab = `\0${symbols.map((symbol) => `${symbol.name}\0`).join('')}`
    const symtabAt = align(0x80 + text.length)
    const strtabAt = symtabAt + 24 * (symbols.length + 1)
    const shstrtabAt = strtabAt + strtab.length
    const sectionsAt = align(shstrtabAt + shstrtab.length)
    const bytes = new Uint8Array(sectionsAt + 5 * 64)
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
    view.setUint16(60, 5, true)
    view.setUint16(62, 4, true)
    // PT_LOAD r-x over the headers and .text
    view.setUint32(0x40, 1, true)
    view.setUint32(0x44, 5, true)
    view.setBigUint64(0x50, 0x400000n, true)
    view.setBigUint64(0x58, 0x400000n, true)
    view.setBigUint64(0x60, BigInt(0x80 + text.length), true)
    view.setBigUint64(0x68, BigInt(0x80 + text.length), true)
    view.setBigUint64(0x70, 0x1000n, true)
    bytes.set(text, 0x80)
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
beforeAll(async () => {
    decoder = await loadDecoder()
})

function listingOf(
    bytes: Uint8Array,
    name: string,
    base = decoder.analyze(bytes).pie ? PIE_BASE : 0
) {
    return generateListing(decoder, { bytes, name, base, version: 'v1' })
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
        const branch =
            /^ {4}(?:bnd )?(?:j[a-z]+|call|loop[a-z]*) ([^\s[;,+]+)(?:\+0x[\da-f]+)?(?: |$)/.exec(
                line
            )
        if (branch && !line.includes('[') && !register.test(branch[1])) used.push(branch[1])
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
        check(lines[current.line] === `${current.name}:`, () => `function ${current.name}'s line`)
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
    })
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
