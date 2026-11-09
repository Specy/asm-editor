/**
 * What the Workbench's Documentation panel favours, the instructions on the lines of the Problems'
 * errors ([documentation-search.md](../../../../../docs/design/documentation-search.md), The
 * Problems panel), follows the analysis, not the typing: the lines come from the sources the
 * Diagnostics are about. The fixture has no language worker, so a test hands the analysis over as
 * the language session does.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync } from 'svelte'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { WorkbenchSession } from './WorkbenchSession.svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function error(file: string, lineIndex: number): Diagnostic {
    const message = 'Unknown instruction'
    return { severity: 'error', file, lineIndex, column: 1, message, formatted: message }
}

function mipsSession(content: string) {
    const fixture = editorGroupsFixture('MIPS', {
        files: { 'main.s': { encoding: 'plain', content } },
        programs: { 'main.s': { settings: {}, testcases: [] } },
        selectedProgram: 'main.s'
    })
    disposers.push(fixture.dispose)
    flushSync()
    return fixture
}

/** An analysis of the sources as they are now, as the language session hands one over. */
function analyse(session: WorkbenchSession, diagnostics: Diagnostic[]) {
    session.analysedSources = session.sourceInput
    session.liveLanguageDiagnostics = diagnostics
    flushSync()
}

describe("the Documentation panel's favour", () => {
    it('reads the lines the last analysis read, not each keystroke', () => {
        const { session } = mipsSession('.text\nmain: adi $t0, $t0, 1\n')
        analyse(session, [error('main.s', 1)])
        const favoured = session.documentationFavour
        expect(favoured).toEqual(['adi'])
        //typing on the error's line, then a line above it, before the analysis catches up: the
        //same list, so the panel searches nothing again
        session.fileEdited('main.s', '.text\nmain: addi $t0, $t0, 1\n')
        flushSync()
        expect(session.documentationFavour).toBe(favoured)
        session.fileEdited('main.s', '.text\n\nmain: addi $t0, $t0, 1\n')
        flushSync()
        expect(session.documentationFavour).toBe(favoured)
        //the analysis of the text as it is now
        analyse(session, [error('main.s', 2)])
        expect(session.documentationFavour).toEqual(['addi'])
        analyse(session, [])
        expect(session.documentationFavour).toEqual([])
    })

    it('reads the live sources until a first analysis is in', () => {
        const { session } = mipsSession('.text\nmain: adi $t0, $t0, 1\n')
        session.liveLanguageDiagnostics = [error('main.s', 1)]
        flushSync()
        expect(session.documentationFavour).toEqual(['adi'])
    })
})
