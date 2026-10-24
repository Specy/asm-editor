/**
 * What a hover says about a Pseudocode's numbers and Ghidra's own words
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decisions 5
 * and 6), and the Documentation sections the Workbench links to.
 */
import { describe, expect, it } from 'vite-plus/test'
import { documentationFor } from '#lib/documentation/documentation.ts'
import { resolveDocumentationLink } from '#lib/documentation/links.ts'
import {
    LISTING_DOCUMENTATION,
    PSEUDOCODE_DOCUMENTATION
} from '#lib/documentation/x86/executableSections.ts'
import { constantValue, ghidraWordMarkdown, PSEUDOCODE_LINK } from './pseudocodeHovers'

describe('a constant of the Pseudocode', () => {
    it('reads as the decompiler prints numbers and characters', () => {
        expect(constantValue('136')).toBe(136n)
        expect(constantValue('0x28')).toBe(0x28n)
        expect(constantValue('-1')).toBe(-1n)
        expect(constantValue('0xffffffffffffffff')).toBe(0xffffffffffffffffn)
        expect(constantValue('10UL')).toBe(10n)
        expect(constantValue("'A'")).toBe(65n)
        expect(constantValue("'\\0'")).toBe(0n)
        expect(constantValue("'\\n'")).toBe(10n)
        expect(constantValue("L'\\x7f'")).toBe(0x7fn)
    })

    it('is no number when it is a string or a floating-point number', () => {
        expect(constantValue('"hunter2"')).toBeUndefined()
        expect(constantValue('1.5')).toBeUndefined()
        expect(constantValue("'AB'")).toBeUndefined()
    })
})

describe("Ghidra's words", () => {
    const hover = (word: string, kind: 'type' | 'variable' = 'variable') =>
        ghidraWordMarkdown(word, kind) ?? ''

    it('explains its types for bytes of no known type', () => {
        expect(hover('undefined8', 'type')).toContain('8 bytes whose exact type the decompiler')
        expect(hover('undefined', 'type')).toContain('one byte whose exact type')
        expect(hover('undefined1', 'type')).toContain('one byte whose exact type')
        expect(hover('code', 'type')).toContain('pointer to a function')
        expect(ghidraWordMarkdown('int', 'type')).toBeUndefined()
        //a variable of that name is the program's
        expect(ghidraWordMarkdown('undefined8', 'variable')).toBeUndefined()
    })

    it('explains where a stack variable is and the type its letters stand for', () => {
        const stack = hover('uStack_48')
        expect(stack).toContain('**uStack_48**')
        expect(stack).toContain('0x48 bytes below where the stack pointer was')
        expect(stack).toContain('`u` stands for the type the decompiler gave it: undefined')
        expect(hover('acStack_98')).toContain('array of char')
        expect(hover('auStack_8')).toContain('array of undefined')
        expect(hover('uStackX_8')).toContain('0x8 bytes above where the stack pointer was')
        expect(hover('local_10')).toContain('0x10 bytes below')
        expect(hover('stack0x00000008')).toContain('0x8 bytes above')
        expect(hover('in_stack_ffffffe8')).toContain('0x18 bytes below')
    })

    it('explains its numbered variables and its parameters', () => {
        expect(hover('iVar1')).toContain('`i` stands for the type the decompiler gave it: int')
        expect(hover('pcVar2')).toContain('pointer to char, or to code')
        expect(hover('sVar4')).toContain('size_t')
        expect(hover('pFVar1')).toContain('pointer to a type whose name starts with F')
        expect(hover('param_1')).toContain("the function's first parameter")
        expect(hover('param_3')).toContain('third parameter')
        expect(hover('cRam0000000000004018')).toContain(
            'an unnamed global variable at address 0x4018'
        )
    })

    it('explains the values a function finds rather than is given', () => {
        expect(hover('in_FS_OFFSET')).toContain('stack canary')
        expect(hover('in_RAX')).toContain('reads from `RAX` before writing it')
        expect(hover('unaff_RBP')).toContain('the value `RBP` had when the function was called')
        expect(hover('unaff_retaddr')).toContain('return address')
        expect(hover('extraout_RAX')).toContain('a value a call left in `RAX`')
    })

    it("links each to the Pseudocode's section and leaves the program's own names alone", () => {
        for (const word of ['uStack_48', 'iVar1', 'param_1', 'in_FS_OFFSET', 'extraout_RAX'])
            expect(hover(word).endsWith(`\n\n${PSEUDOCODE_LINK}`)).toBe(true)
        for (const word of ['s', 'format', 'stdin', 'counter', 'main'])
            expect(ghidraWordMarkdown(word, 'variable')).toBeUndefined()
    })

    it('reads none into a C++ name, however its last part looks', () => {
        //qualified, or the part of one the printer broke onto two lines
        for (const word of ['game::param_1', 'std::in_place', 'io::local_10', 'std::', '::iVar1'])
            expect(ghidraWordMarkdown(word, 'variable')).toBeUndefined()
        expect(ghidraWordMarkdown('game::undefined8', 'type')).toBeUndefined()
    })
})

describe('the Documentation sections the Listing and the Pseudocode link to', () => {
    it('are entries of the x86 Executables Chapter', async () => {
        const chapters = await documentationFor('x86')
        expect(resolveDocumentationLink(LISTING_DOCUMENTATION, chapters)).toMatchObject({
            kind: 'entry',
            entry: { chapter: 'executables', anchor: 'listing', title: 'The Listing' }
        })
        expect(resolveDocumentationLink(PSEUDOCODE_DOCUMENTATION, chapters)).toMatchObject({
            kind: 'entry',
            entry: { chapter: 'executables', anchor: 'pseudocode', title: 'Reading the Pseudocode' }
        })
    })
})
