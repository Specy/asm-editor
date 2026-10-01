import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    branchConditions,
    branchConditionsFlags,
    M68KDirectiveDocumentation,
    M68KUncompoundedInstructions
} from '$lib/languages/M68K/M68K-documentation'
import { M68K_COLORS, M68K_TRAP_DOCS } from '$lib/languages/M68K/M68K-traps'
import type { DocumentationEntry } from '../entries'
import { chapters } from './m68k'

function chapter(id: string) {
    const found = chapters().find((chapter) => chapter.id === id)
    if (!found) throw new Error(`no ${id} Chapter`)
    return found
}

function entry(chapterId: string, anchor: string): DocumentationEntry {
    const found = chapter(chapterId).entries.find((entry) => entry.anchor === anchor)
    if (!found) throw new Error(`no #${anchor} in ${chapterId}`)
    return found
}

/** Every piece of markdown an entry shows, its links included. */
function markdownOf(entry: DocumentationEntry): string[] {
    const view = entry.view
    switch (view.type) {
        case 'markdown':
            return [view.markdown]
        case 'fields':
            return [view.markdown ?? '', ...view.fields.map((field) => field.value)]
        case 'swatches':
            return [view.markdown ?? '']
        case 'm68k-instruction':
            return [view.instruction.description]
        default:
            return []
    }
}

describe('the M68K Documentation', () => {
    it('has its Chapters in order, at the pages they have always had', () => {
        expect(chapters().map((chapter) => [chapter.id, chapter.href])).toEqual([
            ['instructions', '/documentation/m68k/instruction'],
            ['addressing-modes', '/documentation/m68k/addressing-mode'],
            ['condition-codes', '/documentation/m68k/condition-codes'],
            ['shift-directions', '/documentation/m68k/shift-direction'],
            ['trap-tasks', '/documentation/m68k/traps'],
            ['exceptions', '/documentation/m68k/exceptions'],
            ['directives', '/documentation/m68k/directive'],
            ['assembler-features', '/documentation/m68k/assembler-features']
        ])
    })

    it('has the entries each Chapter was built with', () => {
        const counts = Object.fromEntries(
            chapters().map((chapter) => [chapter.id, chapter.entries.length])
        )
        expect(counts).toEqual({
            instructions: 69,
            'addressing-modes': 9,
            //the explanation's two sections, then the 16 codes
            'condition-codes': 18,
            'shift-directions': 1,
            //the introduction, 4 groups, the colors, the key codes, 39 tasks and the 2 closing sections
            'trap-tasks': 48,
            exceptions: 4,
            directives: 18,
            'assembler-features': 1
        })
    })

    it('names every mnemonic an instruction page exists for', () => {
        const named = new Set(chapter('instructions').entries.flatMap((entry) => entry.names))
        for (const name of M68KUncompoundedInstructions.keys()) {
            expect(named.has(name), name).toBe(true)
        }
    })

    it('finds a family by any of its members', () => {
        const owner = (name: string) =>
            chapter('instructions').entries.find((entry) => entry.names.includes(name))?.title
        expect(owner('beq')).toBe('bcc')
        expect(owner('dbf')).toBe('dbcc')
        expect(owner('st')).toBe('scc')
        expect(owner('asl')).toBe('asd')
        expect(owner('roxr')).toBe('roxd')
        expect(owner('move')).toBe('move')
    })

    it('has an entry for every directive', () => {
        const entries = chapter('directives').entries
        for (const name of Object.keys(M68KDirectiveDocumentation)) {
            expect(
                entries.some((entry) => entry.anchor === name && entry.names.includes(name)),
                name
            ).toBe(true)
        }
    })

    it('has every trap task at the anchor the page has always given it', () => {
        expect(M68K_TRAP_DOCS).toHaveLength(39)
        for (const task of M68K_TRAP_DOCS) {
            const found = entry('trap-tasks', `task-${task.task}`)
            expect(found.kind).toBe('trap-task')
            expect(found.names).toContain(`task ${task.task}`)
            expect(found.signature).toBe(`D0.B = ${task.task}`)
        }
    })

    it('keeps the trap page anchors of the groups and the closing sections', () => {
        for (const anchor of ['text', 'graphics', 'input', 'time', 'unsupported', 'differences']) {
            expect(entry('trap-tasks', anchor).kind).toBe('prose')
        }
    })

    it('shows the colors as swatches, channels in the order CSS wants', () => {
        const colors = entry('trap-tasks', 'colors')
        if (colors.view.type !== 'swatches') throw new Error('the colors are not swatches')
        expect(colors.view.swatches).toHaveLength(Object.keys(M68K_COLORS).length)
        expect(colors.view.swatches).toContainEqual({
            name: 'red',
            color: 'rgb(255, 0, 0)',
            value: '$000000FF'
        })
        expect(colors.view.swatches).toContainEqual({
            name: 'navy',
            color: 'rgb(0, 0, 128)',
            value: '$00800000'
        })
    })

    it('has the 16 condition codes with the flags each one tests', () => {
        for (const code of branchConditions) {
            const found = entry('condition-codes', code)
            expect(found.kind).toBe('condition-code')
            expect(found.names).toEqual([code])
            expect(found.signature).toBe(branchConditionsFlags.get(code))
        }
    })

    it('gives every addressing mode its spellings', () => {
        const modes = chapter('addressing-modes').entries
        for (const mode of modes) {
            expect(mode.kind).toBe('addressing-mode')
            expect(mode.names.length, mode.anchor).toBeGreaterThan(0)
            expect(mode.signature, mode.anchor).toBeTruthy()
        }
        const increments = entry('addressing-modes', 'indirect-post-pre-increment')
        expect(increments.names).toEqual(['(an)+', '-(an)'])
        expect(markdownOf(increments).join('\n')).toContain('`-(An)`: Pre decrement')
    })

    it('fills in every list and table it generates', () => {
        for (const chapter of chapters()) {
            if (chapter.id === 'instructions') continue
            for (const entry of chapter.entries) {
                for (const markdown of markdownOf(entry)) {
                    expect(markdown, entry.id).not.toMatch(/\{\w+\}/)
                }
            }
        }
    })

    it('opens no row on a quote mark', () => {
        for (const chapter of chapters()) {
            for (const entry of chapter.entries) expect(entry.summary, entry.id).not.toMatch(/^>/)
        }
    })

    it('links only to pages that exist', () => {
        for (const chapter of chapters()) {
            for (const entry of chapter.entries) {
                for (const markdown of markdownOf(entry)) {
                    for (const [, path] of markdown.matchAll(/\]\((\/documentation\/[^)#\s]*)/g)) {
                        const instruction = /^\/documentation\/m68k\/instruction\/([^/]+)$/.exec(
                            path
                        )
                        if (instruction) {
                            expect(M68KUncompoundedInstructions.has(instruction[1]), path).toBe(
                                true
                            )
                        } else {
                            expect(existsSync(`src/routes${path}/+page.svelte`), path).toBe(true)
                        }
                    }
                }
            }
        }
    })

    it('leaves an instruction without an example without one, so its page says so', () => {
        expect(M68KUncompoundedInstructions.get('roxl')?.interactiveExample).toBeUndefined()
        expect(M68KUncompoundedInstructions.get('chk')?.interactiveExample).toBeUndefined()
        expect(M68KUncompoundedInstructions.get('move')?.interactiveExample?.code).toContain(
            'move.b #$FF, d0'
        )
    })
})
