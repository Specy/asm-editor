import { describe, expect, it } from 'vitest'
import { assemblyLinesOf, sameLocations, sourceLocationsOf } from './mappingSelection'
import type { CompilationSourceMap } from './records'

const map: CompilationSourceMap = {
    sourcePath: 'main.c',
    outputFingerprint: '',
    lines: [
        { path: 'main.c', line: 4 },
        null,
        { path: 'main.c', line: 2 },
        { path: 'value.h', line: 4 },
        { path: 'main.c', line: 4 }
    ]
}

describe('mapping selection', () => {
    it('collects the distinct source locations behind assembly lines', () => {
        expect(sourceLocationsOf(map, [0, 1, 2, 3, 4])).toEqual([
            { path: 'main.c', line: 4 },
            { path: 'main.c', line: 2 },
            { path: 'value.h', line: 4 }
        ])
        expect(sourceLocationsOf(map, [1])).toEqual([])
    })
    it('finds every disjoint assembly section of the selected locations', () => {
        expect(assemblyLinesOf(map, [{ path: 'main.c', line: 4 }])).toEqual([0, 4])
        expect(
            assemblyLinesOf(map, [
                { path: 'main.c', line: 2 },
                { path: 'value.h', line: 4 }
            ])
        ).toEqual([2, 3])
    })
    it('compares selections by location', () => {
        expect(sameLocations([{ path: 'a.c', line: 1 }], [{ path: 'a.c', line: 1 }])).toBe(true)
        expect(sameLocations([{ path: 'a.c', line: 1 }], [{ path: 'b.c', line: 1 }])).toBe(false)
        expect(sameLocations(undefined, [])).toBe(false)
        expect(sameLocations(undefined, undefined)).toBe(true)
    })
})
