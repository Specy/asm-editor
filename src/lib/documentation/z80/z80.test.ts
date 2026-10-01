import { describe, expect, it } from 'vitest'
import {
    z80DirectiveNames,
    z80Directives,
    z80InstructionNames
} from '$lib/languages/Z80/Z80-documentation'
import { Z80_COLORS, Z80_PORT_DOCS, Z80_SCREEN_COMMAND_DOCS } from '$lib/languages/Z80/Z80-model'
import type { Chapter, DocumentationEntry } from '../entries'
import { chapters } from './z80'

/**
 * The Z80 Documentation as entries
 * ([ADR 0025](../../../../docs/adr/0025-documentation-is-a-list-of-entries.md)): nothing the pages
 * showed is lost, and every anchor they had is still there, since links out there may point at it.
 */

function chapter(id: string): Chapter {
    const found = chapters().find((chapter) => chapter.id === id)
    if (!found) throw new Error(`no Chapter ${id}`)
    return found
}

function ofKind(id: string, kind: DocumentationEntry['kind']): DocumentationEntry[] {
    return chapter(id).entries.filter((entry) => entry.kind === kind)
}

function anchorsOf(id: string): Set<string> {
    return new Set(chapter(id).entries.map((entry) => entry.anchor))
}

function markdownOf(entry: DocumentationEntry): string {
    return 'markdown' in entry.view ? (entry.view.markdown ?? '') : ''
}

describe('the Z80 Documentation', () => {
    it('has the four Chapters of the documentation site, in its order', () => {
        expect(chapters().map((chapter) => chapter.id)).toEqual([
            'instructions',
            'directives',
            'registers-and-flags',
            'input-output'
        ])
    })

    it('has an instruction entry for every mnemonic', () => {
        const instructions = ofKind('instructions', 'instruction')
        expect(instructions).toHaveLength(z80InstructionNames.length)
        const named = new Set(instructions.flatMap((entry) => entry.names))
        for (const name of z80InstructionNames) expect(named.has(name), name).toBe(true)
    })

    it('finds a directive by every spelling the assembler accepts', () => {
        const directives = ofKind('directives', 'directive')
        expect(directives).toHaveLength(z80Directives.length)
        const named = directives.flatMap((entry) => entry.names)
        expect(named).toHaveLength(z80DirectiveNames.length)
        for (const name of z80DirectiveNames) expect(named, name).toContain(name)
    })

    it('has every register, flag, condition code and operand placeholder', () => {
        expect(ofKind('registers-and-flags', 'register')).toHaveLength(26)
        expect(ofKind('registers-and-flags', 'flag')).toHaveLength(6)
        expect(ofKind('registers-and-flags', 'condition-code')).toHaveLength(10)
        expect(ofKind('registers-and-flags', 'addressing-mode')).toHaveLength(7)
        const undocumented = ofKind('registers-and-flags', 'register').filter((entry) =>
            entry.signature?.includes('undocumented')
        )
        expect(undocumented.map((entry) => entry.title)).toEqual(['ixh', 'ixl', 'iyh', 'iyl'])
    })

    it('keeps every port at the anchor the page has always given it', () => {
        const ports = ofKind('input-output', 'port')
        expect(ports).toHaveLength(27)
        expect(ports.map((entry) => entry.anchor)).toEqual(
            Z80_PORT_DOCS.map((port) => port.name.toLowerCase())
        )
        for (const entry of ports) expect(entry.href).toBe(`/documentation/z80/io#${entry.anchor}`)
    })

    it('has every screen command and every named color', () => {
        expect(ofKind('input-output', 'screen-command')).toHaveLength(
            Z80_SCREEN_COMMAND_DOCS.length
        )
        const colors = chapter('input-output').entries.find(
            (entry) => entry.view.type === 'swatches'
        )
        expect(colors?.view.type === 'swatches' && colors.view.swatches).toHaveLength(
            Object.keys(Z80_COLORS).length
        )
        expect(colors?.view.type === 'swatches' && colors.view.swatches[0]).toEqual({
            name: 'black',
            color: 'rgb(0, 0, 0)',
            value: '0x00'
        })
    })

    it('keeps the section anchors that exist today', () => {
        const registers = anchorsOf('registers-and-flags')
        for (const anchor of ['registers', 'flags', 'condition-codes', 'operands']) {
            expect(registers.has(anchor), anchor).toBe(true)
        }
        const io = anchorsOf('input-output')
        for (const anchor of ['console', 'screen', 'keyboard', 'mouse', 'time']) {
            expect(io.has(anchor), anchor).toBe(true)
        }
    })

    it('gives every entry a summary that is a whole sentence', () => {
        for (const entry of chapters().flatMap((chapter) => chapter.entries)) {
            expect(entry.summary.trim(), entry.id).not.toBe('')
            //summaryOf ends a sentence at a dot, which "e.g." and "i.e." are not
            expect(entry.summary, entry.id).not.toMatch(/\b(e\.g|i\.e)\.$/)
        }
    })

    it('fills in every table of the prose', () => {
        for (const entry of chapters().flatMap((chapter) => chapter.entries)) {
            expect(markdownOf(entry), entry.id).not.toMatch(/\{\w+\}/)
        }
        const trs80 = chapter('input-output').entries.find(
            (entry) => entry.anchor === 'the-trs-80-display'
        )
        expect(trs80 && markdownOf(trs80)).toContain('| `0x3C00 - 0x3FFF` | **Video RAM.**')
        expect(trs80 && markdownOf(trs80)).toContain('| 7 | Shift |')
    })
})
