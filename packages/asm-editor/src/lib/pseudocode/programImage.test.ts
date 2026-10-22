/**
 * The decompiler's program image made from a Listing, through the real decompiler package in
 * Node: a Listing generated for the x86 Core's fixtures, its `programImage`, and the Pseudocode,
 * whose every function and data name must be one the Listing gives (the plan's whole loop, D3.4,
 * moved to E8.1), a C++ program's in their namespaces
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), P4).
 */
import { readFileSync } from 'node:fs'
import {
    loadDecompiler,
    type DecompiledFunction,
    type DecompiledProgram,
    type Decompiler
} from '@specy/decompiler'
import glibc from '@specy/decompiler/prototypes/glibc'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { pseudocodeText } from '#lib/languages/demangle/demangledNames.ts'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ElfAnalysis, type ListingDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import type { Listing } from '../listing/listing'
import { plannedLoadBase } from '../listing/listingPaths'
import { programImage, stubFunctionName, ZERO_FILL_LIMIT } from './programImage'

const PIE_BASE = 0x555555554000

const fixture = (name: string) =>
    new Uint8Array(
        readFileSync(
            new URL(`../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    )

let decoder: ListingDecoder
let decompiler: Decompiler
let demangler: Demangler

beforeAll(async () => {
    decoder = await loadDecoder()
    decompiler = await loadDecompiler({ architecture: 'x86-64' })
    demangler = await loadDemangler()
})

afterAll(() => decompiler.dispose())

type Opened = {
    bytes: Uint8Array
    analysis: ElfAnalysis
    listing: Listing
    program: DecompiledProgram
}

/**
 * A fixture's Listing at the address it runs at, its names demangled when a demangler is given,
 * and the program its image opens, as the Pseudocode worker opens it.
 */
function open(name: string, bytes = fixture(name), names?: Demangler): Opened {
    const analysis = decoder.analyze(bytes)
    const listing = generateListing(decoder, {
        bytes,
        name,
        base: plannedLoadBase(analysis.pie),
        version: 'v1',
        ...(names ? { analysis, demangler: names } : {})
    })
    const program = decompiler.openProgram(
        programImage({ bytes, listing, analysis, prototypes: glibc }),
        { namespaces: 'minimal' }
    )
    expect(program.warnings).toEqual([])
    return { bytes, analysis, listing, program }
}

function decompiled(result: DecompiledFunction) {
    if ('error' in result)
        throw new Error(`0x${result.address.toString(16)} did not decompile: ${result.error}`)
    return result
}

/** The Pseudocode of a function of the Listing, by its name there. */
function decompileNamed({ listing, program }: Opened, name: string) {
    const fn = listing.functions.find((candidate) => candidate.name === name)
    if (!fn) throw new Error(`the Listing has no function ${name}`)
    return decompiled(program.decompile(fn.address + listing.base))
}

/** Each name printed with a target, the token's text, and where it points at link time. */
function namedTokens(result: ReturnType<typeof decompiled>, base: number) {
    return result.lines.flatMap((line) =>
        line.tokens
            .filter((token) => token.target !== undefined)
            .filter((token) => token.kind === 'function' || token.kind === 'variable')
            .map((token) => ({
                kind: token.kind,
                text: line.text.slice(token.start, token.end),
                target: token.target! - base
            }))
    )
}

describe("crackme-stripped's image", () => {
    let opened: Opened
    beforeAll(() => {
        opened = open('crackme-stripped')
    })
    afterAll(() => opened.program.dispose())

    it('describes its load segments, names, strings and GOT slots at the Listing’s addresses', () => {
        const { bytes, analysis, listing } = opened
        expect(listing.base).toBe(PIE_BASE)
        const image = programImage({ bytes, listing, analysis, prototypes: glibc })
        // readelf -l: four PT_LOAD segments, R, R E, R and RW (.bss past the file's bytes).
        expect(
            image.regions.map((region) => [
                region.address - PIE_BASE,
                region.bytes.length,
                region.readOnly,
                region.executable
            ])
        ).toEqual([
            [0, 0x780, true, false],
            [0x1000, 0x2c9, true, true],
            [0x2000, 0x168, true, false],
            [0x3d90, 0x290, false, false]
        ])
        expect(image.regions[3].bytes.subarray(0x280)).toEqual(new Uint8Array(0x10))
        expect(image.regions[1].bytes.subarray(0, 4)).toEqual(bytes.subarray(0x1000, 0x1004))
        const at = (address: number) => address + PIE_BASE
        // A PLT stub as the function it jumps to, so glibc's prototype binds by name.
        expect(image.functions).toContainEqual({ address: at(0x10f0), name: 'strcmp' })
        expect(image.functions).toContainEqual({ address: at(0x1030), name: 'puts@plt_resolver' })
        expect(image.functions).toContainEqual({ address: at(0x11e9), name: 'main' })
        expect(image.functions).toContainEqual({ address: at(0x1130), name: 'FUN_moonlit_vole' })
        expect(image.data).toContainEqual({ address: at(0x2017), name: 's_hunter2', size: 8 })
        expect(image.data).toContainEqual({ address: at(0x4018), name: 'DAT_perky_tapir' })
        expect(image.data).toContainEqual({
            address: at(0x3fd8),
            name: '__libc_start_main@got',
            size: 8
        })
        expect(image.strings).toContainEqual({ address: at(0x201f), length: 9 })
        // Every GOT slot is a function's: the JUMP_SLOTs of the PLT and the GLOB_DATs of
        // __libc_start_main, the TM clone tables, __gmon_start__ and __cxa_finalize. stdin is
        // copied into .bss, so it has no slot.
        expect(image.pointers).toHaveLength(11)
        expect(image.pointers).toContainEqual({ address: at(0x3fd8), name: '__libc_start_main' })
        expect(image.pointers).toContainEqual({ address: at(0x3fa8), name: 'puts' })
        expect(image.prototypes).toBe(glibc)
    })

    it('prints only names the Listing gives, for every function', () => {
        const { listing, program } = opened
        const labels = new Map(listing.labels.map((label) => [label.name, label.address]))
        const printed = new Set<string>()
        for (const fn of listing.functions) {
            const result = decompiled(program.decompile(fn.address + listing.base))
            expect(result.name).toBe(fn.name.replace(/@plt$/, ''))
            expect(result.text).not.toMatch(/\bfunc_0x|\b[a-z]*Ram[0-9a-f]{16}\b|\bFUN_[0-9a-f]+\b/)
            for (const { kind, text, target } of namedTokens(result, listing.base)) {
                printed.add(text)
                // A function is named by its label, a PLT stub without `@plt`, and one called
                // through its GOT slot (`__libc_start_main`) by its slot's label without `@got`,
                // its name pointing at the slot; a library's object copied in at a version
                // other than its default (`stdin@GLIBC_2.2.5`) by its label without the version.
                const label = [
                    text,
                    `${text}@plt`,
                    ...(kind === 'function' ? [`${text}@got`] : [`${text}@GLIBC_2.2.5`])
                ]
                    .map((name) => labels.get(name))
                    .find((address) => address !== undefined)
                expect(label, `${text} in ${fn.name}`).toBe(target)
            }
        }
        for (const name of ['FUN_moonlit_vole', 'strcmp', '__libc_start_main', 'main', 'stdin'])
            expect(printed).toContain(name)
    })

    it('decompiles main by its invented-or-found name with the library calls named', () => {
        const main = decompileNamed(opened, 'main')
        expect(main.text).toContain('iVar1 = strcmp(acStack_98,"hunter2");')
        expect(main.text).toContain('puts("Correct!");')
    })
})

describe("crackme's image", () => {
    let opened: Opened
    beforeAll(() => {
        opened = open('crackme')
    })
    afterAll(() => opened.program.dispose())

    it('reads main as Ghidra does', () => {
        const main = decompileNamed(opened, 'main')
        expect(main.lines[0].text).toBe('undefined8 main(void)')
        expect(main.text).toContain('printf("Enter password: ");')
        expect(main.text).toContain('pcVar2 = fgets(acStack_98,0x80,stdin);')
        expect(main.text).toContain('puts("Correct!");')
    })

    it("names stdin as glibc.h declares it, so it is a FILE *, its Listing's label versioned", () => {
        const { bytes, analysis, listing } = opened
        const label = listing.labels.find((candidate) => candidate.name.startsWith('stdin'))!
        expect(label.name).toBe('stdin@GLIBC_2.2.5')
        const image = programImage({ bytes, listing, analysis, prototypes: glibc })
        const stdin = label.address + listing.base
        expect(image.data).toContainEqual({ address: stdin, name: 'stdin', size: 8 })
        // A function that returns stdin, past crackme's memory, takes its type: a FILE *, which
        // a name glibc.h does not declare (the label's) would leave undefined8.
        const at = listing.base + 0x100000
        const code = Uint8Array.of(0x48, 0x8b, 0x05, 0, 0, 0, 0, 0xc3) // mov rax, [rel stdin]; ret
        new DataView(code.buffer).setInt32(3, stdin - (at + 7), true)
        const probe = decompiler.openProgram({
            ...image,
            regions: [
                ...image.regions,
                { address: at, bytes: code, readOnly: true, executable: true }
            ],
            functions: [...image.functions, { address: at, name: 'probe' }]
        })
        try {
            const text = decompiled(probe.decompile(at)).text
            expect(text).toMatch(/^FILE \* probe\(void\)\n/)
            expect(text).toContain('return stdin;')
        } finally {
            probe.dispose()
        }
    })

    it("gives _start's call through __libc_start_main@got glibc's prototype", () => {
        const start = decompileNamed(opened, '_start')
        expect(start.text).toContain(
            '__libc_start_main(main,unaff_retaddr,(char **)&stack0x00000008,'
        )
        expect(start.text).toContain('/* WARNING: Subroutine does not return */')
        const slot = opened.listing.labels.find((label) => label.name === '__libc_start_main@got')!
        const main = opened.listing.labels.find((label) => label.name === 'main')!
        expect(namedTokens(start, opened.listing.base)).toEqual(
            expect.arrayContaining([
                { kind: 'function', text: '__libc_start_main', target: slot.address },
                { kind: 'variable', text: 'main', target: main.address }
            ])
        )
    })

    it('reads the bytes it is given, Byte edits included', () => {
        const bytes = fixture('crackme')
        // "Correct!" at 0x201f, in a segment whose file offset is its address.
        bytes.set(new TextEncoder().encode('Corrxct!'), 0x201f)
        const edited = open('crackme', bytes)
        try {
            expect(decompileNamed(edited, 'main').text).toContain('puts("Corrxct!");')
        } finally {
            edited.program.dispose()
        }
    })
})

describe("hello-atexit-static's image", () => {
    let opened: Opened
    beforeAll(() => {
        opened = open('hello-atexit-static')
    })
    afterAll(() => opened.program.dispose())

    it('calls the ifuncs’ IRELATIVE stubs by the names the Listing gives them', () => {
        const { listing, program } = opened
        expect(listing.base).toBe(0)
        // The functions that call a PLT stub, which a static binary has only for its ifuncs
        // (strlen@plt jumps through strlen@got, which an IRELATIVE relocation fills).
        const stubs = new Set(
            listing.labels.filter((label) => label.origin === 'plt').map((label) => label.address)
        )
        expect(stubs.size).toBe(22)
        const lines = listing.text.split('\n')
        const callers = listing.functions.filter(
            (fn) =>
                !stubs.has(fn.address) &&
                lines.slice(fn.line, fn.endLine).some((line) => /\bcall\s+\w+@plt\b/.test(line))
        )
        expect(callers.length).toBeGreaterThan(100)
        // The smallest of them, which decompile quickly.
        callers.sort((a, b) => a.end - a.address - (b.end - b.address))
        const called = new Set<string>()
        for (const fn of callers.slice(0, 30)) {
            const result = decompiled(program.decompile(fn.address))
            expect(result.text, fn.name).not.toMatch(/\bfunc_0x(?!0{8}\b)/)
            for (const { kind, text } of namedTokens(result, 0))
                if (kind === 'function') called.add(text)
        }
        for (const name of ['strlen', 'memcpy']) expect(called).toContain(name)
    }, 60_000)

    it('decompiles opendir, whose DIR is a structure glibc never defines', () => {
        const opendir = decompileNamed(opened, 'opendir')
        expect(opendir.lines[0].text).toBe('DIR * opendir(char *name)')
    })
})

describe("cpp's image, its C++ names demangled", () => {
    let opened: Opened
    beforeAll(() => {
        opened = open('cpp', fixture('cpp'), demangler)
    })
    afterAll(() => opened.program.dispose())

    /** The run-time address of the Listing's label of that name. */
    const addressOf = (name: string) => {
        const label = opened.listing.labels.find((candidate) => candidate.name === name)
        if (!label) throw new Error(`the Listing has no label ${name}`)
        return label.address + opened.listing.base
    }

    it('gives each C++ name its namespaces and the symbol it binds by, and C names as they were', () => {
        const { bytes, analysis, listing } = opened
        const image = programImage({ bytes, listing, analysis, prototypes: glibc })
        const at = (name: string) => ({ address: addressOf(name) })
        const THROW = '_ZSt20__throw_length_errorPKc'
        //a PLT stub by the function it jumps to, with the symbol glibc.h declares it by; its
        //resolver keeps its suffix in its name and its symbol, so binds no prototype
        expect(image.functions).toContainEqual({
            ...at(`${THROW}@plt`),
            name: '__throw_length_error',
            namespace: ['std'],
            symbol: THROW
        })
        expect(image.functions).toContainEqual({
            ...at(`${THROW}@plt_resolver`),
            name: '__throw_length_error@plt_resolver',
            namespace: ['std'],
            symbol: `${THROW}@plt_resolver`
        })
        //a class whose name holds a `::` is one namespace; a name in none has no path
        const BEGIN =
            '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE5beginEv'
        expect(image.functions).toContainEqual({
            ...at(BEGIN),
            name: 'begin',
            namespace: ['std', 'vector<std::string>'],
            symbol: BEGIN
        })
        expect(image.functions).toContainEqual({
            ...at('_ZnwmPv'),
            name: 'operator new',
            symbol: '_ZnwmPv'
        })
        expect(image.functions).toContainEqual({ ...at('main'), name: 'main' })
        expect(image.functions).toContainEqual({ ...at('__cxa_throw@plt'), name: '__cxa_throw' })
        //special data as identifiers filed under their class, an object of libstdc++'s without
        //its version, and a GOT slot as its function and `@got`
        expect(image.data).toContainEqual({
            ...at('_ZTISt13runtime_error@GLIBCXX_3.4'),
            name: 'typeinfo',
            namespace: ['std', 'runtime_error'],
            symbol: '_ZTISt13runtime_error',
            size: 24
        })
        expect(image.data).toContainEqual({
            ...at('_ZSt4cout@GLIBCXX_3.4'),
            name: 'cout',
            namespace: ['std'],
            symbol: '_ZSt4cout',
            size: 272
        })
        expect(image.data).toContainEqual({
            ...at(`${THROW}@got`),
            name: '__throw_length_error@got',
            namespace: ['std'],
            symbol: `${THROW}@got`,
            size: 8
        })
        expect(image.data).toContainEqual({
            ...at('__cxa_throw@got'),
            name: '__cxa_throw@got',
            size: 8
        })
        //a GOT slot's function by its symbol, which is the stub's
        expect(image.pointers).toContainEqual({
            ...at(`${THROW}@got`),
            name: '__throw_length_error',
            namespace: ['std'],
            symbol: THROW
        })
        expect(image.pointers).toContainEqual({ ...at('__cxa_throw@got'), name: '__cxa_throw' })
    })

    it('decompiles every function, printing only the names the Listing gives, in their namespaces', () => {
        const { listing, program } = opened
        //each name a label at an address may print as: raw, without a stub's, a slot's or a
        //version's suffix, or a C++ name in full or as far as minimal qualification keeps it
        const forms = new Map<number, string[]>()
        for (const label of listing.labels) {
            if (label.kind === 'block') continue
            const raw = label.name
            const names = [raw, stubFunctionName(raw), raw.replace(/@got$|@GLIBCXX?_[\d.]+$/, '')]
            if (label.demangled) {
                const full = pseudocodeText(label.demangled.pseudocode)
                names.push(full, full + label.demangled.suffix)
            }
            forms.set(label.address, [...(forms.get(label.address) ?? []), ...names])
        }
        const printed = new Set<string>()
        for (const fn of listing.functions) {
            const result = decompiled(program.decompile(fn.address + listing.base))
            expect(result.text, fn.name).not.toMatch(/\bfunc_0x|\b_Z[A-Za-z0-9_]+/)
            for (const { text, target } of namedTokens(result, listing.base)) {
                printed.add(text)
                expect(
                    forms.get(target)?.some((name) => name === text || name.endsWith(`::${text}`)),
                    `${text} in ${fn.name}`
                ).toBe(true)
            }
        }
        for (const name of [
            'std::vector<std::string>::begin',
            'std::operator<<<char, std::char_traits<char>, std::allocator<char>>',
            'std::cout',
            'std::runtime_error::typeinfo',
            'operator new',
            '__cxa_throw'
        ])
            expect(printed).toContain(name)
    })

    it("reads main by the C++ names, minimal qualification dropping what a class's member shares", () => {
        const { listing, program } = opened
        const main = decompileNamed(opened, 'main')
        expect(main.text).toContain('lStack_f0 = std::vector<std::string>::begin(puStack_e0);')
        expect(main.text).toContain(
            'std::operator<<<char, std::char_traits<char>, std::allocator<char>>(std::cout,lStack_f0)'
        )
        expect(main.text).toContain(
            'std::runtime_error::runtime_error(thrown_exception,"caught exception");'
        )
        expect(main.text).toContain('__cxa_throw(thrown_exception,std::runtime_error::typeinfo,')
        //a member of std::string calls another by its own name, and its declaration says its path
        const fn = listing.functions.find((candidate) =>
            candidate.name.startsWith(
                '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE9_M_createERmm'
            )
        )!
        const create = decompiled(program.decompile(fn.address + listing.base))
        expect(create.name).toBe('_M_create')
        expect(create.lines[0].text).toMatch(/^\w+ \*? ?std::string::_M_create\(/)
        expect(create.text).toMatch(/\bmax_size\(/)
        expect(create.text).not.toContain('std::string::max_size(')
    })

    it("keeps glibc.h's prototype of __throw_length_error, bound by its symbol: it does not return", () => {
        const { bytes, analysis, listing, program } = opened
        //the functions whose Listing calls its stub
        const lines = listing.text.split('\n')
        const callers = listing.functions.filter((fn) =>
            lines
                .slice(fn.line, fn.endLine)
                .some((line) => /\bcall\s+_ZSt20__throw_length_errorPKc@plt\b/.test(line))
        )
        expect(callers.length).toBeGreaterThan(0)
        const noReturn =
            /WARNING: Subroutine does not return \*\/\n\s*(?:std::)?__throw_length_error\(/
        for (const fn of callers)
            expect(decompiled(program.decompile(fn.address + listing.base)).text, fn.name).toMatch(
                noReturn
            )
        //named alike without its symbol, glibc.h's mangled declaration would not bind
        const image = programImage({ bytes, listing, analysis, prototypes: glibc })
        const unbound = decompiler.openProgram({
            ...image,
            functions: image.functions.map(({ symbol: _symbol, ...fn }) => fn),
            pointers: image.pointers?.map(({ symbol: _symbol, ...pointer }) => pointer)
        })
        try {
            expect(
                decompiled(unbound.decompile(callers[0].address + listing.base)).text
            ).not.toMatch(noReturn)
        } finally {
            unbound.dispose()
        }
    })
})

it("leaves a C program's image as it was when its Listing is made with the demangler", () => {
    for (const name of ['crackme', 'crackme-stripped']) {
        const bytes = fixture(name)
        const analysis = decoder.analyze(bytes)
        const base = plannedLoadBase(analysis.pie)
        const plain = generateListing(decoder, { bytes, name, base, version: 'v1' })
        const demangling = generateListing(decoder, {
            bytes,
            name,
            base,
            version: 'v1',
            analysis,
            demangler
        })
        const image = programImage({ bytes, listing: demangling, analysis, prototypes: glibc })
        expect(image).toEqual(programImage({ bytes, listing: plain, analysis, prototypes: glibc }))
        for (const entry of [...image.functions, ...image.data, ...(image.pointers ?? [])])
            expect(
                Object.keys(entry).filter((key) => key === 'namespace' || key === 'symbol')
            ).toEqual([])
    }
})

it('gives a segment at most ZERO_FILL_LIMIT zeros past its file bytes, and skips one overlapping', () => {
    const header = (address: number, offset: number, fileSize: number, memorySize: number) => ({
        type: 1,
        flags: 6,
        offset,
        address: BigInt(address),
        fileSize,
        memorySize: BigInt(memorySize),
        alignment: 0x1000n
    })
    const listing = { base: 0x1000, functions: [], labels: [] } as unknown as Listing
    const image = programImage({
        bytes: new Uint8Array(0x2000).fill(7),
        listing,
        analysis: {
            programHeaders: [
                header(0x400000, 0x1000, 0x100, 2 ** 32),
                header(0x400800, 0, 0x100, 0x100)
            ],
            relocations: [],
            dynamicSymbols: []
        },
        prototypes: ''
    })
    expect(image.regions).toHaveLength(1)
    expect(image.regions[0].address).toBe(0x401000)
    expect(image.regions[0].bytes.length).toBe(0x100 + ZERO_FILL_LIMIT)
    expect(image.regions[0].bytes[0xff]).toBe(7)
    expect(image.regions[0].bytes[0x100]).toBe(0)
})
