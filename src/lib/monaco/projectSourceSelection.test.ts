import { describe, expect, it } from 'vitest'
import {
    buildSource,
    canEditProjectBreakpoints,
    isCurrentBuildLocation,
    liveSource,
    selectProjectFile,
    sourceModelKey
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

    it('keeps live and Build model identities distinct', () => {
        expect(sourceModelKey(liveSource('a.m68k'), 'live:7:a.m68k')).toBe('live:7:a.m68k')
        expect(sourceModelKey(buildSource('a.m68k', 4), 'live:7:a.m68k')).toBe('snapshot:4:a.m68k')
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
})
