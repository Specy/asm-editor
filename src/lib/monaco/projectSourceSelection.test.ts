import { describe, expect, it } from 'vitest'
import {
    buildSource,
    canEditProjectBreakpoints,
    isCurrentBuildLocation,
    isSameProjectSourceSelection,
    liveSource,
    selectProjectFile
} from './projectSourceSelection'

describe('Project source selection', () => {
    it('changes Files without changing a live source view', () => {
        expect(selectProjectFile(liveSource('a.m68k'), 'b.m68k', 4, true)).toEqual(
            liveSource('b.m68k')
        )
    })

    it('changes Files without leaving the retained Build', () => {
        expect(selectProjectFile(buildSource('a.m68k', 4), 'b.m68k', 4, true)).toEqual(
            buildSource('b.m68k', 4)
        )
    })

    it('uses an explicit live fallback for a File absent from the Build', () => {
        expect(selectProjectFile(buildSource('a.m68k', 4), 'created.bin', 4, false)).toEqual(
            liveSource('created.bin')
        )
    })

    it('matches a current instruction only to its exact Build generation and File', () => {
        expect(isCurrentBuildLocation(buildSource('a.m68k', 4), 4, 'a.m68k')).toBe(true)
        expect(isCurrentBuildLocation(buildSource('b.m68k', 4), 4, 'a.m68k')).toBe(false)
        expect(isCurrentBuildLocation(buildSource('a.m68k', 3), 4, 'a.m68k')).toBe(false)
        expect(isCurrentBuildLocation(liveSource('a.m68k'), 4, 'a.m68k')).toBe(false)
    })

    it('keeps Build breakpoints editable while execution locks source text', () => {
        expect(
            canEditProjectBreakpoints(buildSource('b.m68k', 4), {
                readonly: false,
                building: false,
                fileSystemLocked: true
            })
        ).toBe(true)
        expect(
            canEditProjectBreakpoints(liveSource('b.m68k'), {
                readonly: false,
                building: false,
                fileSystemLocked: true
            })
        ).toBe(false)
    })

    it('identifies identical source selections', () => {
        expect(isSameProjectSourceSelection(undefined, undefined)).toBe(true)
        expect(isSameProjectSourceSelection(liveSource('a.s'), undefined)).toBe(false)
        expect(isSameProjectSourceSelection(undefined, liveSource('a.s'))).toBe(false)

        const live = liveSource('a.s')
        expect(isSameProjectSourceSelection(live, live)).toBe(true)
        expect(isSameProjectSourceSelection(liveSource('a.s'), liveSource('a.s'))).toBe(true)
        expect(isSameProjectSourceSelection(liveSource('a.s'), liveSource('b.s'))).toBe(false)

        expect(isSameProjectSourceSelection(buildSource('a.s', 1), buildSource('a.s', 1))).toBe(
            true
        )
        expect(isSameProjectSourceSelection(buildSource('a.s', 1), buildSource('a.s', 2))).toBe(
            false
        )
        expect(isSameProjectSourceSelection(buildSource('a.s', 1), buildSource('b.s', 1))).toBe(
            false
        )
        expect(isSameProjectSourceSelection(liveSource('a.s'), buildSource('a.s', 1))).toBe(false)
    })
})
