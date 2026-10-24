/**
 * Navigation in a Listing (go to definition, references, hovers, symbols and folds) on crackme's
 * Listing, through the Monaco providers the x86 language registers.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'
import { demangledName } from '#lib/languages/demangle/demangledNames.ts'
import { loadDemangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { functionAtLine, LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import {
    demangledNameMarkdown,
    listingTokenAt,
    markdownCode
} from '#lib/listing/listingNavigation.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import {
    listingLineNumbers,
    listingLineNumberWidth,
    sharedAddressDigits,
    modelListing,
    setModelListing
} from './listingModels'
import { createListingProviders, withoutListings } from './listingProviders'
import { followableNameAt } from './followNames'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = {
    Range,
    languages: { SymbolKind: { Function: 11 }, FoldingRangeKind: { Region: 'region' } }
} as unknown as MonacoType

const URI = 'asm-editor://session/build-1/crackme'
const crackme = new Uint8Array(
    readFileSync(new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url))
)

let listing: Listing
let lines: string[]

beforeAll(async () => {
    listing = generateListing(await loadDecoder(), {
        bytes: crackme,
        name: 'crackme',
        base: PIE_LOAD_BASE,
        version: 'v1'
    })
    lines = listing.text.split('\n')
    setModelListing(URI, { listing, bytes: crackme, library: false })
})

function model(uri = URI) {
    return {
        uri: { toString: () => uri },
        getLineContent: (lineNumber: number) => lines[lineNumber - 1],
        getLineMaxColumn: (lineNumber: number) => lines[lineNumber - 1].length + 1
    } as unknown as monaco.editor.ITextModel
}

/** The 0-based line whose trimmed text is `text`, the first one at or after `from`. */
function lineOf(text: string, from = 0): number {
    const line = lines.findIndex((candidate, i) => i >= from && candidate.trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}

/** The position of `token` on a 0-based line. */
function at(line: number, token: string): monaco.Position {
    const column = lines[line].indexOf(token)
    expect(column, `${token} on line ${line}`).toBeGreaterThanOrEqual(0)
    return { lineNumber: line + 1, column: column + 2 } as monaco.Position
}

const providers = () => createListingProviders(monacoStub)
const token = {} as monaco.CancellationToken

function definitionLine(position: monaco.Position): number | undefined {
    const result = providers().definition.provideDefinition(
        model(),
        position,
        token
    ) as monaco.languages.Location | null
    return result ? result.range.startLineNumber - 1 : undefined
}

describe('go to definition in a Listing', () => {
    it('goes to a PLT stub, a string and a function from an operand', () => {
        const main = lineOf('main:')
        const call = lineOf('call strcmp@plt', main)
        expect(definitionLine(at(call, 'strcmp@plt'))).toBe(lineOf('strcmp@plt:'))
        const string = lineOf('lea rdx, [rel s_hunter2]            ; "hunter2"', main)
        expect(definitionLine(at(string, 's_hunter2'))).toBe(
            lines.findIndex((line) => line.startsWith('s_hunter2:'))
        )
        expect(definitionLine(at(lineOf('jmp register_tm_clones'), 'register_tm_clones'))).toBe(
            lineOf('register_tm_clones:')
        )
    })

    it("goes to a bare .LAB_n in the function it is written in, not another's", () => {
        const main = lineOf('main:')
        const jump = lineOf('jne .LAB_1', main)
        expect(definitionLine(at(jump, '.LAB_1'))).toBe(lineOf('.LAB_1:', main))
        const other = lineOf('je .LAB_1', lineOf('deregister_tm_clones:'))
        expect(definitionLine(at(other, '.LAB_1'))).toBe(
            lineOf('.LAB_1:', lineOf('deregister_tm_clones:'))
        )
    })

    it('reads FUN_x.LAB_n, label+0xN and a run-time address', () => {
        const registered = modelListing(URI)!
        const main = lineOf('main:')
        const block = registered.index.label('main.LAB_3', 0)
        expect(block?.line).toBe(lineOf('.LAB_3:', main))
        const offset = listingTokenAt('    lea rdi, [rel s_hunter2+0x2]', 22)
        expect(offset?.text).toBe('s_hunter2')
        const callLine = lineOf('call strcmp@plt', main)
        const address = `0x${(listing.lines.addresses[callLine] + PIE_LOAD_BASE).toString(16)}`
        expect(registered.index.addressLine(address)).toBe(callLine)
        // A word inside a string is text, not a name.
        expect(listingTokenAt('s_hunter2: db "hunter2", 0', 16)).toBeUndefined()
    })
})

describe('names a double-click follows in a Listing', () => {
    it('follows a label an operand names and an address, not a label where it is defined', () => {
        const main = lineOf('main:')
        const call = lineOf('call strcmp@plt', main)
        const column = lines[call].indexOf('strcmp@plt')
        //where Go to Definition goes, drawn as a link over the whole name
        expect(followableNameAt(monacoStub, model(), at(call, 'strcmp@plt'))).toMatchObject({
            range: {
                startLineNumber: call + 1,
                startColumn: column + 1,
                endLineNumber: call + 1,
                endColumn: column + 1 + 'strcmp@plt'.length
            },
            line: lineOf('strcmp@plt:') + 1
        })
        const jump = lineOf('jne .LAB_1', main)
        expect(followableNameAt(monacoStub, model(), at(jump, '.LAB_1'))?.line).toBe(
            lineOf('.LAB_1:', main) + 1
        )
        const address = `0x${(listing.lines.addresses[call] + PIE_LOAD_BASE).toString(16)}`
        const comment = `    nop ; ${address}`
        const withAddress = {
            ...model(),
            getLineContent: (lineNumber: number) =>
                lineNumber === main + 1 ? comment : lines[lineNumber - 1]
        } as unknown as monaco.editor.ITextModel
        expect(
            followableNameAt(monacoStub, withAddress, {
                lineNumber: main + 1,
                column: comment.indexOf(address) + 2
            })?.line
        ).toBe(call + 1)
        //a label's own definition goes nowhere, and a mnemonic or a register is no name
        expect(followableNameAt(monacoStub, model(), at(main, 'main'))).toBeUndefined()
        expect(followableNameAt(monacoStub, model(), at(call, 'call'))).toBeUndefined()
        expect(followableNameAt(monacoStub, model('elsewhere'), at(call, 'strcmp'))).toBeUndefined()
    })
})

describe('references in a Listing', () => {
    it('lists every line naming a label, and a block only inside its own function', () => {
        const main = lineOf('main:')
        const references = providers().references.provideReferences(
            model(),
            at(lineOf('call strcmp@plt', main), 'strcmp@plt'),
            { includeDeclaration: true },
            token
        ) as monaco.languages.Location[]
        expect(references.map((reference) => reference.range.startLineNumber - 1)).toEqual([
            lineOf('strcmp@plt:'),
            lineOf('call strcmp@plt', main)
        ])

        const blocks = providers().references.provideReferences(
            model(),
            at(lineOf('jne .LAB_1', main), '.LAB_1'),
            { includeDeclaration: false },
            token
        ) as monaco.languages.Location[]
        expect(blocks.map((reference) => reference.range.startLineNumber - 1)).toEqual([
            lineOf('jne .LAB_1', main)
        ])
    })
})

describe('hovers in a Listing', () => {
    it("shows an instruction's run-time address and bytes, and a label's origin", () => {
        const main = lineOf('main:')
        const call = lineOf('call strcmp@plt', main)
        const hover = providers().hover.provideHover(model(), at(call, 'strcmp@plt'), token)
        const text = (hover as monaco.languages.Hover).contents.map((part) => part.value).join('\n')
        const address = listing.lines.addresses[call] + PIE_LOAD_BASE
        expect(text).toContain(
            `**strcmp@plt** at \`0x${(listing.lines.addresses[lineOf('strcmp@plt:')] + PIE_LOAD_BASE).toString(16)}\``
        )
        expect(text).toContain('A PLT stub')
        expect(text).toContain(`Address \`0x${address.toString(16)}\` · Bytes \`e8 `)
        // A line with no bytes, a label's, shows only the label.
        const label = providers().hover.provideHover(model(), at(main, 'main'), token)
        expect((label as monaco.languages.Hover).contents).toHaveLength(1)
        expect(providers().hover.provideHover(model(), at(0, 'crackme'), token)).toBeNull()
    })

    it('says when a line was patched, and what the Executable has there', () => {
        const check = lineOf('jne .LAB_2', lineOf('call strcmp@plt'))
        const patchedUri = 'asm-editor://session/build-2/crackme'
        const offset = listing.lines.offsets[check]
        const original = crackme.slice(offset, offset + 2)
        const dispose = setModelListing(patchedUri, {
            listing,
            bytes: crackme,
            library: false,
            patches: new Map([
                [
                    check,
                    {
                        text: '    je .LAB_2',
                        instruction: 'je .LAB_2',
                        bytes: Uint8Array.of(0x74, original[1]),
                        original,
                        originalText: 'jne .LAB_2'
                    }
                ]
            ])
        })
        const hover = providers().hover.provideHover(model(patchedUri), at(check, 'jne'), token)
        const text = (hover as monaco.languages.Hover).contents.map((part) => part.value).join('\n')
        const hex = (byte: number) => byte.toString(16).padStart(2, '0')
        expect(text).toContain(`Bytes \`74 ${hex(original[1])}\``)
        expect(text).toContain(
            `Patched in this Debug session. The Executable has \`75 ${hex(original[1])}\` here, \`jne .LAB_2\`; Undo takes the patch back.`
        )
        dispose()
    })

    it('answers nothing for a model that is no Listing', () => {
        const other = model('asm-editor://session/live/main.asm')
        expect(providers().hover.provideHover(other, at(0, 'crackme'), token)).toBeNull()
        expect(providers().definition.provideDefinition(other, at(0, 'crackme'), token)).toBeNull()
    })
})

describe('a Listing whose comments say C++ names', () => {
    const CPP_URI = 'asm-editor://session/build-3/cpp'
    let cppLines: string[]
    let cpp: Listing

    beforeAll(async () => {
        const bytes = new Uint8Array(
            readFileSync(
                new URL('../../../../x86/blink-js/tests/fixtures/elf/cpp', import.meta.url)
            )
        )
        cpp = generateListing(await loadDecoder(), {
            bytes,
            name: 'cpp',
            base: PIE_LOAD_BASE,
            version: 'v1',
            demangler: await loadDemangler()
        })
        cppLines = cpp.text.split('\n')
        setModelListing(CPP_URI, { listing: cpp, bytes, library: false })
    })

    const cppModel = () =>
        ({
            uri: { toString: () => CPP_URI },
            getLineContent: (lineNumber: number) => cppLines[lineNumber - 1],
            getLineMaxColumn: (lineNumber: number) => cppLines[lineNumber - 1].length + 1
        }) as unknown as monaco.editor.ITextModel
    const cppAt = (line: number, text: string, from = 0) =>
        ({
            lineNumber: line + 1,
            column: cppLines[line].indexOf(text, from) + 2
        }) as monaco.Position

    it('goes, hovers and follows from the raw names, and not from the words of a comment', () => {
        const call = cppLines.findIndex((line) => line.startsWith('    call _Znwm@plt '))
        expect(cppLines[call]).toMatch(/ ; operator new\(unsigned long\)$/)
        const stub = cppLines.findIndex((line) => line.startsWith('_Znwm@plt:'))
        const definition = providers().definition.provideDefinition(
            cppModel(),
            cppAt(call, '_Znwm@plt'),
            token
        ) as monaco.languages.Location
        expect(definition.range.startLineNumber - 1).toBe(stub)
        expect(followableNameAt(monacoStub, cppModel(), cppAt(call, '_Znwm@plt'))?.line).toBe(
            stub + 1
        )
        const hover = (position: monaco.Position) =>
            (providers().hover.provideHover(cppModel(), position, token) as monaco.languages.Hover)
                .contents
        expect(hover(cppAt(call, '_Znwm@plt'))).toHaveLength(2)
        //the comment's words: the line's bytes only, no definition, no link
        const word = cppAt(call, 'new', cppLines[call].indexOf(';'))
        expect(hover(word)).toHaveLength(1)
        expect(providers().definition.provideDefinition(cppModel(), word, token)).toBeNull()
        expect(followableNameAt(monacoStub, cppModel(), word)).toBeUndefined()
        //a label line's comment as well; the label itself still hovers
        const comment = cppAt(stub, 'operator')
        expect(providers().hover.provideHover(cppModel(), comment, token)).toBeNull()
        expect(hover(cppAt(stub, '_Znwm@plt'))).toHaveLength(1)
        const references = providers().references.provideReferences(
            cppModel(),
            cppAt(call, '_Znwm@plt'),
            { includeDeclaration: true },
            token
        ) as monaco.languages.Location[]
        expect(references.map((reference) => reference.range.startLineNumber - 1)).toEqual(
            cppLines.flatMap((line, i) =>
                /^(?:_Znwm@plt:| {4}call _Znwm@plt\b)/.test(line) ? [i] : []
            )
        )
    })

    /** The hover's label part at the first `name` on the first line starting with `start`. */
    const labelHover = (start: string, name: string) => {
        const line = cppLines.findIndex((text) => text.startsWith(start))
        expect(line, start).toBeGreaterThanOrEqual(0)
        const hover = providers().hover.provideHover(
            cppModel(),
            cppAt(line, name),
            token
        ) as monaco.languages.Hover
        return hover.contents[0].value
    }
    const addressOf = (name: string) =>
        `0x${(cpp.labels.find((label) => label.name === name)!.address + PIE_LOAD_BASE).toString(16)}`

    it('hovers a C++ name with its signature, its other forms and its mangled name', () => {
        //the demangler's text spells out what the signature shortens; the variant is named
        const destructor = '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev'
        expect(labelHover(`    call ${destructor}`, destructor)).toBe(
            [
                `**\`std::string::~basic_string()\`** at \`${addressOf(destructor)}\``,
                'As the demangler writes it: `std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>::~basic_string()`',
                `Short name \`std::string::~basic_string\`; mangled name \`${destructor}\`, where \`D1\` marks the complete destructor.`,
                'Named by the symbol table.'
            ].join('\n\n')
        )
        //a PLT stub's: the demangler's text is the signature, which keeps the Listing's suffix
        expect(labelHover('    call _Znwm@plt ', '_Znwm@plt')).toBe(
            [
                `**\`operator new(unsigned long)@plt\`** at \`${addressOf('_Znwm@plt')}\``,
                'Short name `operator new@plt`; mangled name `_Znwm@plt`.',
                'A PLT stub: it jumps to `_Znwm`, in a shared library, through the address its GOT slot holds.'
            ].join('\n\n')
        )
        //data have one form
        const cout = '_ZSt4cout@GLIBCXX_3.4'
        expect(labelHover(`    lea rdx, [rel ${cout}]`, cout)).toBe(
            [
                `**\`std::cout@GLIBCXX_3.4\`** at \`${addressOf(cout)}\``,
                `Mangled name \`${cout}\`.`,
                'Named by the symbol table.'
            ].join('\n\n')
        )
        //a C name, and a block of a C function, as before
        expect(labelHover('main:', 'main')).toBe(
            `**main** at \`${addressOf('main')}\`\n\nNamed by the symbol table.`
        )
        expect(labelHover('    jns .LAB_1', '.LAB_1')).toContain(
            'A place a jump goes to inside `main`.'
        )
    })

    it('says which C++ function a block is in by its demangled name', () => {
        const block = cpp.labels.find(
            (label) => label.kind === 'block' && functionAtLine(cpp, label.line)?.list
        )!
        const owner = functionAtLine(cpp, block.line)!
        expect(owner.name).toMatch(/^_Z/)
        const hover = providers().hover.provideHover(
            cppModel(),
            cppAt(block.line, block.name),
            token
        ) as monaco.languages.Hover
        expect(hover.contents[0].value).toBe(
            [
                `**${block.fullName}** at \`0x${(block.address + PIE_LOAD_BASE).toString(16)}\``,
                '',
                `A place a jump goes to inside \`${owner.list}\`.`
            ].join('\n')
        )
    })

    it('outlines C++ functions by the names lists show, selected on the raw name', () => {
        const symbols = providers().documentSymbols.provideDocumentSymbols(
            cppModel(),
            token
        ) as monaco.languages.DocumentSymbol[]
        expect(symbols).toHaveLength(cpp.functions.length)
        const symbol = (name: string) => {
            const index = cpp.functions.findIndex((fn) => fn.name === name)
            return { fn: cpp.functions[index], symbol: symbols[index] }
        }
        const destructor = symbol('_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev')
        expect(destructor.symbol.name).toBe('std::string::~basic_string')
        expect(destructor.symbol.detail).toBe(addressOf(destructor.fn.name))
        expect(destructor.symbol.selectionRange).toEqual(
            new Range(
                destructor.fn.line + 1,
                1,
                destructor.fn.line + 1,
                destructor.fn.name.length + 1
            )
        )
        //overloads by their signatures, a stub with its suffix, C names raw
        expect(
            symbols
                .map((symbol) => symbol.name)
                .filter((name) => name.startsWith('std::string::_M_data'))
        ).toEqual(['std::string::_M_data() const', 'std::string::_M_data(char*)'])
        expect(symbol('_Znwm@plt').symbol.name).toBe('operator new@plt')
        expect(symbol('main').symbol.name).toBe('main')
        expect(symbol('strlen@plt').symbol.name).toBe('strlen@plt')
    })

    it('finds a C++ label by a short name or signature only one address has', () => {
        const index = modelListing(CPP_URI)!.index
        const label = (name: string) => cpp.labels.find((candidate) => candidate.name === name)!
        //a destructor's complete and base variants share an address: either is the place
        const destructor = '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev'
        expect(index.demangledLabel('std::string::~basic_string')?.address).toBe(
            label(destructor).address
        )
        expect(index.demangledLabel('std::string::~basic_string()')?.address).toBe(
            label(destructor).address
        )
        //overloads share their short name, not their signatures
        expect(index.demangledLabel('std::string::_M_data')).toBeUndefined()
        expect(index.demangledLabel('std::string::_M_data(char*)')).toBe(
            label('_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE7_M_dataEPc')
        )
        expect(index.demangledLabel('operator new')).toBe(label('_ZnwmPv'))
        expect(index.demangledLabel('operator new@plt')).toBe(label('_Znwm@plt'))
        expect(index.demangledLabel('std::cout@GLIBCXX_3.4')).toBe(label('_ZSt4cout@GLIBCXX_3.4'))
        //raw names are the other lookup's
        expect(index.demangledLabel('_ZnwmPv')).toBeUndefined()
        expect(index.demangledLabel('main')).toBeUndefined()
    })
})

describe('the hover of a demangled name', () => {
    it('names a constructor or destructor variant by its mangled mark', async () => {
        const { describe: read } = await loadDemangler()
        const said = (raw: string) => demangledNameMarkdown(demangledName(raw, read)!, raw)
        expect(said('_ZN4game6PlayerD0Ev')).toEqual([
            'Short name `game::Player::~Player`; mangled name `_ZN4game6PlayerD0Ev`, where `D0` marks the deleting destructor, which frees the object once it is destroyed.'
        ])
        expect(said('_ZN4game6PlayerC2Ev').at(-1)).toBe(
            'Short name `game::Player::Player`; mangled name `_ZN4game6PlayerC2Ev`, where `C2` marks the base constructor.'
        )
        expect(said('_ZThn16_N4game4BossD1Ev').at(-1)).toBe(
            'Short name `non-virtual thunk to game::Boss::~Boss`; mangled name `_ZThn16_N4game4BossD1Ev`, where `D1` marks the complete destructor.'
        )
        //a vtable is data, read as written
        expect(said('_ZTVN4game4BossE')).toEqual(['Mangled name `_ZTVN4game4BossE`.'])
        //a template function's return type and a clone's suffix are the demangler's own
        expect(said('_ZSt4endlIcSt11char_traitsIcEERSt13basic_ostreamIT_T0_ES6_.isra.0')[0]).toBe(
            'As the demangler writes it: `std::basic_ostream<char, std::char_traits<char>>& std::endl<char, std::char_traits<char>>(std::basic_ostream<char, std::char_traits<char>>&) (.isra.0)`'
        )
    })

    it('shows a name as Markdown code, whatever it holds', () => {
        expect(markdownCode('std::vector<int*>')).toBe('`std::vector<int*>`')
        expect(markdownCode('a`b')).toBe('``a`b``')
        expect(markdownCode('`quoted`')).toBe('`` `quoted` ``')
    })
})

describe('the Listing in the editor', () => {
    it("prints each line's run-time address in the gutter, and nothing on other lines", () => {
        const numbers = listingLineNumbers(listing)
        const call = lineOf('call strcmp@plt', lineOf('main:'))
        expect(numbers(call + 1)).toBe((listing.lines.addresses[call] + PIE_LOAD_BASE).toString(16))
        expect(numbers(1)).toBe('')
        expect(numbers(lines.length)).toBe('')
        expect(listingLineNumberWidth(listing)).toBe(12)
    })

    it('prints the low eight digits on a phone, which every address of the Listing shares the rest of', () => {
        const short = listingLineNumbers(listing, true)
        const call = lineOf('call strcmp@plt', lineOf('main:'))
        const full = (listing.lines.addresses[call] + PIE_LOAD_BASE).toString(16)
        expect(sharedAddressDigits(listing)).toBe(4)
        expect(short(call + 1)).toBe(full.slice(4))
        expect(short(1)).toBe('')
        expect(listingLineNumberWidth(listing, true)).toBe(8)
        //addresses that fit in eight digits, or that differ in the high ones, stay whole
        const fixed = { ...listing, base: 0 }
        expect(sharedAddressDigits(fixed)).toBe(0)
        expect(listingLineNumbers(fixed, true)(call + 1)).toBe(
            listing.lines.addresses[call].toString(16)
        )
        const spread = { ...listing, base: 0xfffff000 }
        expect(sharedAddressDigits(spread)).toBe(0)
    })

    it('outlines functions and folds functions and sections', () => {
        const symbols = providers().documentSymbols.provideDocumentSymbols(
            model(),
            token
        ) as monaco.languages.DocumentSymbol[]
        const main = symbols.find((symbol) => symbol.name === 'main')!
        expect(main.range.startLineNumber - 1).toBe(lineOf('main:'))
        const folds = providers().folding.provideFoldingRanges(
            model(),
            {},
            token
        ) as monaco.languages.FoldingRange[]
        expect(folds).toContainEqual({
            start: lineOf('main:') + 1,
            end: lineOf('ret', lineOf('main:')) + 1
        })
        expect(folds.filter((fold) => lines[fold.start - 1].startsWith('section'))).not.toEqual([])
        expect(listing.lines.kinds[lineOf('section .text')]).toBe(LINE_KIND.section)
    })

    it('keeps the providers that read Project Files away from a Listing', () => {
        const provideDefinition = vi.fn((_model: monaco.editor.ITextModel) => 'project')
        const wrapped = withoutListings(
            { provideDefinition, displayName: 'project' },
            'provideDefinition'
        )
        expect(wrapped.provideDefinition(model('asm-editor://session/live/main.asm'))).toBe(
            'project'
        )
        expect(wrapped.provideDefinition(model())).toBeNull()
        expect(provideDefinition).toHaveBeenCalledTimes(1)
        expect(wrapped.displayName).toBe('project')
    })
})

describe("a Listing with a person's renames and comments", () => {
    const ANNOTATED_URI = 'asm-editor://session/build-4/crackme'
    let annotated: Listing
    let annotatedLines: string[]

    beforeAll(async () => {
        const named = (name: string) => listing.labels.find((label) => label.name === name)!.address
        const instruction = (code: string) => listing.lines.addresses[lineOf(code, lineOf('main:'))]
        annotated = generateListing(await loadDecoder(), {
            bytes: crackme,
            name: 'crackme',
            base: PIE_LOAD_BASE,
            version: 'v1',
            annotations: {
                names: new Map([[named('frame_dummy'), 'setup_frames']]),
                comments: new Map([
                    [instruction('call printf@plt'), 'prompts; main reads the answer next'],
                    [
                        instruction('call strcmp@plt'),
                        `the same as strcmp@plt at 0x${(named('strcmp@plt') + PIE_LOAD_BASE).toString(16)}, which main calls once; it returns zero for equal strings`
                    ]
                ]),
                functionComments: new Map([[named('main'), 'main asks for the password']])
            }
        })
        annotatedLines = annotated.text.split('\n')
        setModelListing(ANNOTATED_URI, { listing: annotated, bytes: crackme, library: false })
    })

    const annotatedModel = () =>
        ({
            uri: { toString: () => ANNOTATED_URI },
            getLineContent: (lineNumber: number) => annotatedLines[lineNumber - 1],
            getLineMaxColumn: (lineNumber: number) => annotatedLines[lineNumber - 1].length + 1
        }) as unknown as monaco.editor.ITextModel
    const annotatedLine = (start: string) => {
        const line = annotatedLines.findIndex((candidate) => candidate.startsWith(start))
        expect(line, start).toBeGreaterThanOrEqual(0)
        return line
    }
    const annotatedAt = (line: number, text: string, from = 0) =>
        ({
            lineNumber: line + 1,
            column: annotatedLines[line].indexOf(text, from) + 2
        }) as monaco.Position
    const hoverText = (position: monaco.Position) => {
        const hover = providers().hover.provideHover(annotatedModel(), position, token)
        return hover && (hover as monaco.languages.Hover).contents.map((part) => part.value)
    }

    it("neither goes, follows nor hovers from a comment's words", () => {
        const printf = annotatedLine('    call printf@plt')
        const word = annotatedLines[printf].lastIndexOf('main')
        expect(word).toBeGreaterThan(annotatedLines[printf].indexOf(' ; '))
        const inComment = annotatedAt(printf, 'main', word)
        expect(
            providers().definition.provideDefinition(annotatedModel(), inComment, token)
        ).toBeNull()
        expect(followableNameAt(monacoStub, annotatedModel(), inComment)).toBeUndefined()
        // The line's address and bytes, and no label.
        expect(hoverText(inComment)).toEqual([expect.stringMatching(/^Address `0x/)])
        // The operand before it is a name as ever.
        const stub = providers().definition.provideDefinition(
            annotatedModel(),
            annotatedAt(printf, 'printf@plt'),
            token
        ) as monaco.languages.Location
        expect(stub.range.startLineNumber - 1).toBe(annotatedLine('printf@plt:'))

        // A comment's own lines: no name, no address, no hover.
        const above = annotatedLine('    ; the same as strcmp@plt')
        for (const text of ['strcmp@plt', '0x', 'main']) {
            const position = annotatedAt(above, text)
            expect(
                providers().definition.provideDefinition(annotatedModel(), position, token),
                text
            ).toBeNull()
            expect(followableNameAt(monacoStub, annotatedModel(), position), text).toBeUndefined()
            expect(hoverText(position), text).toBeNull()
        }
        const functionComment = annotatedLine('; main asks')
        expect(hoverText(annotatedAt(functionComment, 'main'))).toBeNull()

        // References to main: its operand and its label, not the comments naming it.
        const references = providers().references.provideReferences(
            annotatedModel(),
            annotatedAt(annotatedLine('main:'), 'main'),
            { includeDeclaration: true },
            token
        ) as monaco.languages.Location[]
        expect(
            references.map((reference) => annotatedLines[reference.range.startLineNumber - 1])
        ).toEqual(['    lea rdi, [rel main]', 'main:'])
    })

    it('leaves the gutter empty on comment lines, and hovers a renamed label with its old name', () => {
        const numbers = listingLineNumbers(annotated)
        const above = annotatedLine('    ; the same as strcmp@plt')
        const call = annotatedLine('    call strcmp@plt')
        expect(annotated.lines.addresses[above]).toBe(annotated.lines.addresses[call])
        expect(numbers(above + 1)).toBe('')
        expect(numbers(annotatedLine('; main asks') + 1)).toBe('')
        expect(numbers(call + 1)).toBe(
            (annotated.lines.addresses[call] + PIE_LOAD_BASE).toString(16)
        )
        expect(numbers(annotatedLine('main:') + 1)).not.toBe('')

        const pointer = annotatedLine('__frame_dummy_init_array_entry: dq setup_frames')
        expect(hoverText(annotatedAt(pointer, 'setup_frames'))?.[0]).toBe(
            [
                `**setup_frames** at \`0x${(annotated.labels.find((label) => label.name === 'setup_frames')!.address + PIE_LOAD_BASE).toString(16)}\``,
                'Renamed from `frame_dummy`.',
                'Named by the symbol table.'
            ].join('\n\n')
        )
        const symbols = providers().documentSymbols.provideDocumentSymbols(
            annotatedModel(),
            token
        ) as monaco.languages.DocumentSymbol[]
        expect(symbols.map((symbol) => symbol.name)).toContain('setup_frames')
        expect(symbols.map((symbol) => symbol.name)).not.toContain('frame_dummy')
    })
})
