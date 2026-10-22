/**
 * What a Pseudocode's hover says about its numbers, Ghidra's own words and the Listing's invented
 * names, and the names a double-click follows there
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decisions 5
 * to 7), on crackme-stripped's real Listing and Pseudocode in Node; and a C++ program's names
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decisions 10, 15 and 16),
 * on the decompiler package's FactCheck-like fixture, its Listing's names demangled.
 */
import { readFileSync } from 'node:fs'
import {
    loadDecompiler,
    type DecompiledLine,
    type DecompiledVariable,
    type Decompiler,
    type DecompileOptions,
    type LocalName
} from '@specy/decompiler'
import glibc from '@specy/decompiler/prototypes/glibc'
import type monaco from 'monaco-editor'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDemangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import type { Listing, ListingAnnotations } from '#lib/listing/listing.ts'
import { plannedLoadBase } from '#lib/listing/listingPaths.ts'
import { programImage } from '#lib/pseudocode/programImage.ts'
import { PSEUDOCODE_LINK } from '#lib/pseudocode/pseudocodeHovers.ts'
import { numberMarkdown } from './assemblyInsights'
import { followableNameAt } from './followNames'
import type { MonacoType } from './Monaco'
import { setModelPseudocode } from './pseudocodeModels'
import { createPseudocodeProviders } from './pseudocodeProviders'

/** The document lines before the decompiler's: the header and a blank line. */
const FIRST = 2

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}
const monacoStub = { Range, Uri: { from: (parts: object) => parts } } as unknown as MonacoType

let decoder: ListingDecoder
let decompiler: Decompiler
let listing: Listing
/** factcheck's Listing, its C++ names demangled. */
let cppListing: Listing
/**
 * Each function's Pseudocode lines, by the function's name (crackme-stripped's, or factcheck's
 * after `factcheck:`), at link-time addresses, and the Listing it is of.
 */
const decompiled = new Map<string, { lines: DecompiledLine[]; listing: Listing }>()

/** The Listing of a fixture of the x86 Core's or the decompiler package's, and its functions' Pseudocode. */
async function decompileFixture(
    path: string,
    prefix: string,
    names: (listing: Listing) => string[],
    cpp = false
): Promise<Listing> {
    const bytes = new Uint8Array(readFileSync(new URL(path, import.meta.url)))
    const analysis = decoder.analyze(bytes)
    const fixtureListing = generateListing(decoder, {
        bytes,
        name: path.slice(path.lastIndexOf('/') + 1),
        base: plannedLoadBase(analysis.pie),
        version: 'v1',
        ...(cpp ? { analysis, demangler: await loadDemangler() } : {})
    })
    const { base } = fixtureListing
    const program = decompiler.openProgram(
        programImage({ bytes, listing: fixtureListing, analysis, prototypes: glibc }),
        { namespaces: 'minimal' }
    )
    for (const name of names(fixtureListing)) {
        const fn = fixtureListing.functions.find((candidate) => candidate.name === name)!
        const result = program.decompile(fn.address + base)
        if ('error' in result) throw new Error(result.error)
        decompiled.set(prefix + name, {
            listing: fixtureListing,
            lines: result.lines.map((line) => ({
                ...line,
                tokens: line.tokens.map((token) => ({
                    ...token,
                    ...(token.target === undefined ? {} : { target: token.target - base })
                }))
            }))
        })
    }
    program.dispose()
    return fixtureListing
}

/** factcheck's functions the tests read, by their Listing names. */
const STRING_APPEND = '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_'
const BOSS_DELETING_DESTRUCTOR = '_ZN4game4BossD0Ev'
const M_CHECK_LEN =
    '_ZNKSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE12_M_check_lenEmPKc'

beforeAll(async () => {
    decoder = await loadDecoder()
    decompiler = await loadDecompiler({ architecture: 'x86-64' })
    listing = await decompileFixture(
        '../../../../x86/blink-js/tests/fixtures/elf/crackme-stripped',
        '',
        () => ['main', 'FUN_peachy_anteater', 'FUN_winged_scarab', '_start']
    )
    cppListing = await decompileFixture(
        '../../../../decompiler/js/tests/fixtures/elf/factcheck',
        'factcheck:',
        (cpp) => {
            //a function whose declaration the printer breaks after its first namespace
            const broken = cpp.functions.find(
                (fn) => fn.name.startsWith('_ZNKSt8_Rb_tree') && fn.name.endsWith('6_M_endEv')
            )!
            return ['main', '_ZL8greetingv', BOSS_DELETING_DESTRUCTOR, M_CHECK_LEN, broken.name]
        },
        true
    )
})

afterAll(() => decompiler.dispose())

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

/** A model of a function's Pseudocode, as the editor registers one. */
function pseudocodeModel(name: string) {
    const uri = `pseudocode-${name}`
    const { lines, listing: of } = decompiled.get(name)!
    disposers.push(
        setModelPseudocode(uri, {
            lines,
            firstLine: FIRST,
            listing: of,
            listingIdentity: {
                sessionId: 'session',
                sourceKind: 'live',
                path: of === listing ? 'crackme-stripped' : 'factcheck',
                view: 'listing'
            }
        })
    )
    return { uri: { toString: () => uri } } as unknown as monaco.editor.ITextModel
}

/** The position `offset` characters into the first `text` of a function's Pseudocode. */
function at(name: string, text: string, offset = 1): monaco.Position {
    const { lines } = decompiled.get(name)!
    const line = lines.findIndex((candidate) => candidate.text.includes(text))
    expect(line, text).toBeGreaterThanOrEqual(0)
    const column = lines[line].text.indexOf(text) + offset
    return { lineNumber: line + FIRST + 1, column: column + 1 } as monaco.Position
}

/** What the hover says at the first `text` of a function's Pseudocode. */
function hover(name: string, text: string, offset = 1): string[] {
    const result = createPseudocodeProviders(monacoStub).hover.provideHover(
        pseudocodeModel(name),
        at(name, text, offset),
        {} as never
    ) as monaco.languages.Hover | null
    return result?.contents.map((content) => content.value) ?? []
}

describe('the hover of a Pseudocode', () => {
    it("gives a number the Listing's card", () => {
        expect(hover('main', '0x80')).toEqual([numberMarkdown(0x80n, 64)])
        expect(hover('main', '0x80')[0]).toContain('Decimal: `128`')
    })

    it("explains Ghidra's words, with the Pseudocode's section", () => {
        const [stack] = hover('main', 'acStack_98')
        expect(stack).toContain(
            '**acStack_98**: a variable the decompiler found in the stack frame'
        )
        expect(stack).toContain('array of char')
        expect(stack.endsWith(PSEUDOCODE_LINK)).toBe(true)
        expect(hover('main', 'in_FS_OFFSET')[0]).toContain('stack canary')
        expect(hover('main', 'undefined8')[0]).toContain('8 bytes whose type')
        expect(hover('_start', 'unaff_retaddr')[0]).toContain('return address')
        //punctuation has nothing to say
        expect(hover('main', 'acStack_98,0x80', 10)).toEqual([])
    })

    it('says a name is invented, as the Listing does', () => {
        const name = listing.labels.find(
            (label) => label.origin === 'invented' && label.kind === 'function'
        )
        expect(name).toBeDefined()
        const call = hover('FUN_peachy_anteater', 'FUN_moonlit_vole')
        expect(call[0]).toMatch(/^`FUN_moonlit_vole` at `0x[\da-f]+` in the Listing/)
        expect(call[1]).toBe(
            `An invented name: nothing in the file names this function, so the Listing made one up from its address.\n\n${PSEUDOCODE_LINK}`
        )
        //a name the decompiler reads more bytes of than its label covers is still the Listing's
        const [widened] = hover('FUN_winged_scarab', '_DAT_epic_cicada')
        expect(widened).toMatch(/^`DAT_epic_cicada` at `0x[\da-f]+` in the Listing, read here/)
        expect(widened).toContain('An invented name: nothing in the file names this data')
        expect(widened.endsWith(PSEUDOCODE_LINK)).toBe(true)
    })
})

describe('the names a double-click follows in a Pseudocode', () => {
    it('follows a function or data name to its line in the Listing, nothing else', () => {
        const model = pseudocodeModel('FUN_peachy_anteater')
        const rows = listing.text.split('\n')
        const call = followableNameAt(
            monacoStub,
            model,
            at('FUN_peachy_anteater', 'FUN_moonlit_vole')
        )
        expect(call?.resource).toMatchObject({
            path: '/live/crackme-stripped',
            fragment: 'listing'
        })
        expect(rows[call!.line - 1]).toBe('FUN_moonlit_vole:')
        const position = at('FUN_peachy_anteater', 'FUN_moonlit_vole', 0)
        expect(call?.range).toMatchObject({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column + 'FUN_moonlit_vole'.length
        })
        const data = followableNameAt(
            monacoStub,
            model,
            at('FUN_peachy_anteater', 'DAT_perky_tapir')
        )
        expect(rows[data!.line - 1]).toMatch(/^DAT_perky_tapir:/)
        //a constant or a local is no name of the Listing's
        expect(
            followableNameAt(monacoStub, pseudocodeModel('main'), at('main', 'iVar1'))
        ).toBeUndefined()
        expect(
            followableNameAt(monacoStub, pseudocodeModel('main'), at('main', '0x80'))
        ).toBeUndefined()
    })
})

describe("a C++ program's names in its Pseudocode", () => {
    /** The hover's range and what it says at a position of a function's Pseudocode. */
    function hoverAt(name: string, position: monaco.Position) {
        const result = createPseudocodeProviders(monacoStub).hover.provideHover(
            pseudocodeModel(name),
            position,
            {} as never
        ) as monaco.languages.Hover | null
        return {
            range: result?.range,
            contents: result?.contents.map((content) => content.value) ?? []
        }
    }
    const runTime = (address: number) => `0x${(address + cppListing.base).toString(16)}`
    const labelNamed = (name: string) => cppListing.labels.find((label) => label.name === name)!

    it('gives a function its signature, the demangler’s text and its mangled name, anywhere on its name', () => {
        const name = 'std::string::operator+='
        const call = `${name}(auStack_128,auStack_c8)`
        const append = labelNamed(STRING_APPEND)
        const expected = [
            `\`std::string::operator+=(std::string const&)\` at \`${runTime(append.address)}\` in the Listing: Go to Definition shows it there.`,
            [
                'As the demangler writes it: `std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>::operator+=(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>> const&)`',
                `Short name \`std::string::operator+=\`; mangled name \`${STRING_APPEND}\`.`,
                PSEUDOCODE_LINK
            ].join('\n\n')
        ]
        //on its namespace, its class and its own name: one token, which the hover covers
        const start = at('factcheck:main', call, 0)
        for (const offset of [0, 'std::'.length + 2, name.length - 1]) {
            const { range, contents } = hoverAt(
                'factcheck:main',
                at('factcheck:main', call, offset)
            )
            expect(contents).toEqual(expected)
            expect(range).toMatchObject({
                startColumn: start.column,
                endColumn: start.column + name.length
            })
        }
        //a PLT stub's, called from inside another member of std, by the name minimal
        //qualification leaves it
        const [stub] = hover(`factcheck:${M_CHECK_LEN}`, '__throw_length_error(param_3)')
        expect(stub).toBe(
            `\`std::__throw_length_error(char const*)@plt\` at \`${runTime(labelNamed('_ZSt20__throw_length_errorPKc@plt').address)}\` in the Listing: Go to Definition shows it there.`
        )
    })

    it('names a destructor’s variant, on its own declaration and on a call', () => {
        const deleting = BOSS_DELETING_DESTRUCTOR
        const own = hover(`factcheck:${deleting}`, 'game::Boss::~Boss(void *param_1)')
        expect(own[0]).toBe(
            `\`game::Boss::~Boss() [deleting]\` at \`${runTime(labelNamed(deleting).address)}\` in the Listing: Go to Definition shows it there.`
        )
        expect(own[1]).toContain(
            'Short name `game::Boss::~Boss`; mangled name `_ZN4game4BossD0Ev`, where `D0` marks the deleting destructor, which frees the object once it is destroyed.'
        )
        //the complete destructor it calls, in its own class, by its own name
        const call = hover(`factcheck:${deleting}`, '~Boss(param_1);')
        expect(call[0]).toMatch(/^`game::Boss::~Boss\(\)` at /)
        expect(call[1]).toContain('where `D1` marks the complete destructor.')
    })

    it('names special data in the Listing’s words, saying how the Pseudocode writes them', () => {
        const [typeinfo, details] = hover('factcheck:main', 'std::runtime_error::typeinfo')
        expect(typeinfo).toBe(
            `\`typeinfo for std::runtime_error@GLIBCXX_3.4\` at \`${runTime(labelNamed('_ZTISt13runtime_error@GLIBCXX_3.4').address)}\` in the Listing: Go to Definition shows it there.`
        )
        expect(details).toBe(
            [
                'Mangled name `_ZTISt13runtime_error@GLIBCXX_3.4`.',
                'The Pseudocode writes it `std::runtime_error::typeinfo`.',
                PSEUDOCODE_LINK
            ].join('\n\n')
        )
        const guard = hover('factcheck:_ZL8greetingv', 'greeting()::text::guard')
        expect(guard[0]).toMatch(/^`guard variable for greeting\(\)::text` at /)
        expect(guard[1]).toContain('The Pseudocode writes it `greeting()::text::guard`.')
    })

    it('still explains Ghidra’s words, and reads none into a name’s namespaces', () => {
        expect(hover('factcheck:main', 'auStack_128')[0]).toContain(
            '**auStack_128**: a variable the decompiler found in the stack frame'
        )
        //a declaration the printer broke after its namespace: its first part is no link, and
        //nothing Ghidra says
        const broken = [...decompiled.keys()].find((key) => key.endsWith('6_M_endEv'))!
        const { lines } = decompiled.get(broken)!
        const first = lines.find((line) => line.text.endsWith(' std::'))
        expect(first, 'a declaration broken after std::').toBeDefined()
        const position = at(broken, first!.text.slice(-'std::'.length), 1)
        expect(hoverAt(broken, position).contents).toEqual([])
        expect(followableNameAt(monacoStub, pseudocodeModel(broken), position)).toBeUndefined()
    })

    it('follows a qualified name to its line in the Listing, with Go to Definition and a double-click', () => {
        const model = pseudocodeModel('factcheck:main')
        const name = 'std::vector<std::string>::push_back'
        const start = at('factcheck:main', `${name}(`, 0)
        const rows = cppListing.text.split('\n')
        const label =
            '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_'
        for (const offset of [1, name.indexOf('push_back') + 1]) {
            const position = at('factcheck:main', `${name}(`, offset)
            const followed = followableNameAt(monacoStub, model, position)
            expect(followed?.resource).toMatchObject({
                path: '/live/factcheck',
                fragment: 'listing'
            })
            //the label's line, which says the name it stands for in a comment
            expect(rows[followed!.line - 1]).toMatch(
                new RegExp(`^${label}:\\s+; ${name.replace(/[<>]/g, '.')}\\(`)
            )
            expect(followed?.range).toMatchObject({
                startColumn: start.column,
                endColumn: start.column + name.length
            })
            const [definition] = createPseudocodeProviders(monacoStub).definition.provideDefinition(
                model,
                position,
                {} as never
            ) as { range: Range; originSelectionRange: Range }[]
            expect(definition.range.startLineNumber).toBe(followed!.line)
            expect(definition.originSelectionRange).toMatchObject({
                startColumn: start.column,
                endColumn: start.column + name.length
            })
        }
    })
})

describe('the hover of a name the person gave (annotations-and-search.md, decisions 8, 9 and 16)', () => {
    type Annotated = {
        lines: DecompiledLine[]
        listing: Listing
        variables: DecompiledVariable[]
        locals: LocalName[]
        address: number
    }
    const annotated = new Map<string, Annotated>()

    /** A fixture's function decompiled from a Listing with the person's renames and comments. */
    async function decompileAnnotated(
        path: string,
        name: string,
        annotations: ListingAnnotations | undefined,
        options: DecompileOptions = {},
        cpp = false
    ): Promise<Annotated> {
        const bytes = new Uint8Array(readFileSync(new URL(path, import.meta.url)))
        const analysis = decoder.analyze(bytes)
        const of = generateListing(decoder, {
            bytes,
            name: path.slice(path.lastIndexOf('/') + 1),
            base: plannedLoadBase(analysis.pie),
            version: 'v1',
            ...(cpp ? { analysis, demangler: await loadDemangler() } : {}),
            ...(annotations ? { annotations } : {})
        })
        const program = decompiler.openProgram(
            programImage({ bytes, listing: of, analysis, prototypes: glibc }),
            { namespaces: 'minimal' }
        )
        try {
            const fn = of.functions.find((candidate) => candidate.name === name)!
            const result = program.decompile(fn.address + of.base, {
                ...options,
                comments: options.comments?.map((comment) => ({
                    ...comment,
                    address: comment.address + of.base
                }))
            })
            if ('error' in result) throw new Error(result.error)
            const linkTime = (key: 'address' | 'target', value: number | undefined) =>
                value === undefined ? {} : { [key]: value - of.base }
            return {
                listing: of,
                variables: result.variables,
                locals: [...(options.locals ?? [])],
                address: fn.address,
                lines: result.lines.map((line) => ({
                    ...line,
                    tokens: line.tokens.map((token) => ({
                        ...token,
                        ...linkTime('address', token.address),
                        ...linkTime('target', token.target)
                    }))
                }))
            }
        } finally {
            program.dispose()
        }
    }

    const CRACKME = '../../../../x86/blink-js/tests/fixtures/elf/crackme'
    const CLAMP = '_ZN4game7clampToIiEET_S1_S1_S1_'
    let moonlit: number
    let clamp: number
    let strcmp: number

    beforeAll(async () => {
        moonlit = listing.labels.find((label) => label.name === 'FUN_moonlit_vole')!.address
        annotated.set(
            'stripped',
            await decompileAnnotated(
                '../../../../x86/blink-js/tests/fixtures/elf/crackme-stripped',
                'FUN_peachy_anteater',
                { names: new Map([[moonlit, 'helper']]) }
            )
        )
        clamp = cppListing.labels.find((label) => label.name === CLAMP)!.address
        annotated.set(
            'factcheck',
            await decompileAnnotated(
                '../../../../decompiler/js/tests/fixtures/elf/factcheck',
                'main',
                { names: new Map([[clamp, 'clamp_value']]) },
                {},
                true
            )
        )
        const plain = await decompileAnnotated(CRACKME, 'main', undefined)
        const rows = plain.listing.text.split('\n')
        const fn = plain.listing.functions.find((candidate) => candidate.name === 'main')!
        const call = rows.findIndex(
            (row, index) => index >= fn.line && /\bcall\s+strcmp@plt\b/.test(row)
        )
        strcmp = plain.listing.lines.addresses[call]
        annotated.set(
            'crackme',
            await decompileAnnotated(CRACKME, 'main', undefined, {
                locals: [
                    { id: 'stack:-0x98', name: 'password' },
                    { id: 'register:0x0:4@+0x8e', name: 'result' }
                ],
                comments: [
                    { address: strcmp, text: 'iVar1 0x80 FUN_moonlit_vole undefined8 main' }
                ],
                functionComment: 'Reads acStack_98',
                unplacedComments: true
            })
        )
    })

    /** A model of an annotated function, as the editor registers one. */
    function annotatedModel(name: string) {
        const uri = `annotated-${name}`
        const { lines, listing: of, variables, locals, address } = annotated.get(name)!
        disposers.push(
            setModelPseudocode(uri, {
                lines,
                firstLine: FIRST,
                listing: of,
                listingIdentity: {
                    sessionId: 'session',
                    sourceKind: 'live',
                    path: name,
                    view: 'listing'
                },
                variables,
                locals,
                functionAddress: address
            })
        )
        return { uri: { toString: () => uri } } as unknown as monaco.editor.ITextModel
    }

    /** The position `offset` characters into the first `text` of an annotated function. */
    function position(name: string, text: string, offset = 1) {
        const { lines } = annotated.get(name)!
        const line = lines.findIndex((candidate) => candidate.text.includes(text))
        expect(line, text).toBeGreaterThanOrEqual(0)
        return {
            lineNumber: line + FIRST + 1,
            column: lines[line].text.indexOf(text) + offset + 1
        } as monaco.Position
    }

    function hoverOf(name: string, text: string, offset = 1): string[] {
        const result = createPseudocodeProviders(monacoStub).hover.provideHover(
            annotatedModel(name),
            position(name, text, offset),
            {} as never
        ) as monaco.languages.Hover | null
        return result?.contents.map((content) => content.value) ?? []
    }

    it('says what a renamed global was renamed from, and where an invented name came from', () => {
        const { listing: of } = annotated.get('stripped')!
        const call = hoverOf('stripped', 'helper(')
        expect(call).toEqual([
            `\`helper\` at \`0x${(moonlit + of.base).toString(16)}\` in the Listing: Go to Definition shows it there.`,
            [
                'Renamed from `FUN_moonlit_vole`.',
                'An invented name: nothing in the file names this function, so the Listing made one up from its address.',
                PSEUDOCODE_LINK
            ].join('\n\n')
        ])
    })

    it('gives a renamed C++ function the forms of the name it had', () => {
        const { listing: of } = annotated.get('factcheck')!
        const [first, details] = hoverOf('factcheck', 'clamp_value(')
        expect(first).toBe(
            `\`clamp_value\` at \`0x${(clamp + of.base).toString(16)}\` in the Listing: Go to Definition shows it there.`
        )
        expect(details).toBe(
            [
                'Renamed from `game::clampTo<int>(int, int, int)`.',
                'As the demangler writes it: `int game::clampTo<int>(int, int, int)`',
                `Short name \`game::clampTo<int>\`; mangled name \`${CLAMP}\`.`,
                PSEUDOCODE_LINK
            ].join('\n\n')
        )
    })

    it('says a renamed local is the person’s and where the decompiler keeps it', () => {
        const { listing: of, address } = annotated.get('crackme')!
        const [stack] = hoverOf('crackme', 'password,0x80')
        expect(stack).toBe(
            [
                '**password**: a local variable renamed in this Project. The decompiler keeps it on the stack, 0x98 bytes below where the stack pointer was when the function was entered (`Stack[-0x98]`). Reset name gives back the name the decompiler gave it.',
                PSEUDOCODE_LINK
            ].join('\n\n')
        )
        const [register] = hoverOf('crackme', 'result = strcmp')
        expect(register).toContain(
            `**result**: a local variable renamed in this Project. The decompiler keeps it in \`EAX\`, first set at \`0x${(address + of.base + 0x8e).toString(16)}\` (\`EAX\`).`
        )
        //a name the decompiler gave is still explained as Ghidra's
        expect(hoverOf('crackme', 'pcVar2 = fgets')[0]).toContain(
            '**pcVar2**: a local variable the decompiler made'
        )
    })

    it("reads nothing into a comment's words: no name, number or Ghidra word", () => {
        const model = annotatedModel('crackme')
        const providers = createPseudocodeProviders(monacoStub)
        const { lines } = annotated.get('crackme')!
        const commentLine = lines.findIndex((line) => line.text.includes('iVar1 0x80'))
        expect(lines[commentLine].tokens.every((token) => token.kind === 'comment')).toBe(true)
        for (const word of ['iVar1', '0x80', 'FUN_moonlit_vole', 'undefined8', 'main']) {
            //on the comment's word, not the code's
            const at = {
                lineNumber: commentLine + FIRST + 1,
                column: lines[commentLine].text.indexOf(word) + 2
            } as monaco.Position
            expect(providers.hover.provideHover(model, at, {} as never), word).toBeNull()
            expect(providers.definition.provideDefinition(model, at, {} as never), word).toBeNull()
        }
        const comment = position('crackme', 'iVar1 0x80', 1)
        expect(providers.hover.provideHover(model, comment, {} as never)).toBeNull()
        const header = position('crackme', 'Reads acStack_98', 'Reads '.length + 1)
        expect(providers.hover.provideHover(model, header, {} as never)).toBeNull()
        expect(followableNameAt(monacoStub, model, comment)).toBeUndefined()
    })
})
