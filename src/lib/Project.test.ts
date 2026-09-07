import { describe, expect, it } from 'vitest'
import {
    cleanTestcases,
    isValidFilePath,
    makeProject,
    makeProjectFromExternal,
    normalizeProjectData,
    projectContentEquals,
    ProjectFormatError,
    type Testcase
} from '$lib/Project.svelte'
import { BASE_CODE, LANGUAGE_EXTENSIONS } from '$lib/Config'

/**
 * `cleanTestcases` runs on every project loaded from storage and on every embed URL, because a
 * testcase that has been through JSON has numbers where the checker wants bigints. It used to read
 * a `number` entry's address where the expected value belongs, so a memory expectation was checked
 * against its own address and a lecture's Exercise could not assert on one at all.
 */

function testcaseWith(part: Partial<Testcase>): Testcase {
    return {
        input: [],
        expectedOutput: '',
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: [],
        ...part
    }
}

describe('cleanTestcases', () => {
    it('keeps the expected value of a number memory entry, in both starting and expected memory', () => {
        const entry = { type: 'number' as const, address: 0x1000n, bytes: 4, expected: 42n }
        const [cleaned] = cleanTestcases([
            testcaseWith({ startingMemory: [entry], expectedMemory: [entry] })
        ])
        expect(cleaned.startingMemory[0]).toEqual(entry)
        expect(cleaned.expectedMemory[0]).toEqual(entry)
    })

    it('turns the numbers JSON gave back into bigints', () => {
        const fromJson = JSON.parse(
            '{"type":"number","address":4096,"bytes":2,"expected":7}'
        ) as never
        const [cleaned] = cleanTestcases([
            testcaseWith({
                expectedMemory: [fromJson],
                expectedRegisters: { d0: 3 as unknown as bigint }
            })
        ])
        expect(cleaned.expectedMemory[0]).toEqual({
            type: 'number',
            address: 4096n,
            bytes: 2,
            expected: 7n
        })
        expect(cleaned.expectedRegisters.d0).toBe(3n)
    })

    it('leaves the chunk entries alone apart from their numbers', () => {
        const [cleaned] = cleanTestcases([
            testcaseWith({
                expectedMemory: [
                    { type: 'string-chunk', address: 0x2000n, expected: 'hello' },
                    { type: 'number-chunk', address: 0x2010n, bytes: 1, expected: [1n, 2n, 3n] }
                ]
            })
        ])
        expect(cleaned.expectedMemory[0]).toEqual({
            type: 'string-chunk',
            address: 0x2000n,
            expected: 'hello'
        })
        expect(cleaned.expectedMemory[1]).toEqual({
            type: 'number-chunk',
            address: 0x2010n,
            bytes: 1,
            expected: [1n, 2n, 3n]
        })
    })
})

/**
 * The project format: a record whose program is a map of Files with an Entry file and whose
 * Settings are decisions ([ADR 0013](../../docs/adr/0013-project-is-a-record.md),
 * [ADR 0014](../../docs/adr/0014-settings-split-by-effect.md)). `normalizeProjectData` is the one
 * path every stored, exported and shared shape goes through, version 1 included, which is why it is
 * tested on the shapes rather than on the callers.
 */

describe('normalizeProjectData', () => {
    it('turns a version 1 project, one code string, into its default Entry file', () => {
        const project = normalizeProjectData({ code: 'li $v0, 10', language: 'MIPS' })
        expect(project.files).toEqual({ 'main.mips': { encoding: 'plain', content: 'li $v0, 10' } })
        expect(project.entry).toBe('main.mips')
        expect(project.settings).toEqual({})
    })

    it('gives a project without a program the empty one of its language', () => {
        const project = normalizeProjectData(undefined)
        expect(project.language).toBe('M68K')
        expect(project.files['main.m68k']?.content).toBe(BASE_CODE.M68K)
        expect(project.entry).toBe('main.m68k')
    })

    it('keeps an entry that names a File and falls back when it does not', () => {
        const files = {
            'lib/util.z80': { encoding: 'plain', content: '' },
            'main.z80': { encoding: 'plain', content: 'halt' }
        }
        expect(normalizeProjectData({ language: 'Z80', files, entry: 'lib/util.z80' }).entry).toBe(
            'lib/util.z80'
        )
        expect(normalizeProjectData({ language: 'Z80', files, entry: 'gone.z80' }).entry).toBe(
            'main.z80'
        )
        expect(
            normalizeProjectData({
                language: 'Z80',
                files: { 'only.z80': { encoding: 'plain', content: '' } }
            }).entry
        ).toBe('only.z80')
    })

    it('ignores a stray code string once the project has files', () => {
        const project = normalizeProjectData({
            language: 'Z80',
            code: 'old',
            files: { 'main.z80': { encoding: 'plain', content: 'new' } }
        })
        expect(project.files['main.z80']?.content).toBe('new')
    })

    it('refuses an encoding it does not know instead of reading it as text', () => {
        expect(() =>
            normalizeProjectData({
                files: { 'main.m68k': { encoding: 'base64', content: 'AAAA' } }
            })
        ).toThrow(ProjectFormatError)
    })

    it('refuses a path outside the rules', () => {
        for (const path of ['../main.m68k', '/main.m68k', 'main', 'dir//main.m68k', 'a/./b.s']) {
            expect(
                () =>
                    normalizeProjectData({ files: { [path]: { encoding: 'plain', content: '' } } }),
                path
            ).toThrow(ProjectFormatError)
        }
    })

    it('keeps only the Settings decisions it can use', () => {
        const project = normalizeProjectData({
            settings: { maxHistorySize: 30, nonsense: true, screenHistoryBudgetMb: -4 }
        })
        expect(project.settings).toEqual({ maxHistorySize: 30 })
    })
})

describe('isValidFilePath', () => {
    it('accepts relative paths with an extension, folders included', () => {
        for (const path of ['main.m68k', 'src/lib/util.s', 'a.b.c', 'data/sprites.bin']) {
            expect(isValidFilePath(path), path).toBe(true)
        }
    })

    it('rejects absolute, dotted, empty and extensionless paths', () => {
        for (const path of ['', '/x.s', 'x', '.x', 'x.', 'a/../x.s', 'a\\x.s', 'a//x.s']) {
            expect(isValidFilePath(path), path).toBe(false)
        }
    })
})

describe('makeProject', () => {
    it('reads and writes the Entry file through code', () => {
        const project = makeProject({ language: 'Z80', code: 'halt' })
        expect(project.code).toBe('halt')
        project.code = 'nop'
        expect(project.files['main.z80']?.content).toBe('nop')
    })

    it('rebuilds the files from a legacy code string for the merged language', () => {
        const project = makeProject()
        project.set({ code: 'li $v0, 10', language: 'MIPS', name: 'Shared' })
        expect(Object.keys(project.files)).toEqual(['main.mips'])
        expect(project.code).toBe('li $v0, 10')
        expect(project.name).toBe('Shared')
    })

    it('keeps its files when set is given a current shape', () => {
        const project = makeProject({ language: 'Z80', code: 'halt' })
        project.set({ settings: { maxHistorySize: 3 } })
        expect(project.code).toBe('halt')
        expect(project.settings).toEqual({ maxHistorySize: 3 })
    })

    it('only lets the entry point at a File', () => {
        const project = makeProject({ language: 'Z80', code: 'halt' })
        expect(() => (project.entry = 'other.z80')).toThrow(ProjectFormatError)
        expect(project.entry).toBe('main.z80')
    })
})

describe('the exported file', () => {
    it('round trips a project through metadata version 2', () => {
        const project = makeProject({
            name: 'Round trip',
            description: 'with a decision and a testcase',
            language: 'MIPS',
            code: 'li $v0, 10\nsyscall',
            settings: { maxHistorySize: 12 },
            testcases: [testcaseWith({ expectedRegisters: { v0: 10n } })]
        })
        const text = project.toExternal()
        expect(text.startsWith('li $v0, 10\nsyscall')).toBe(true)
        expect(text).toContain('# ---METADATA---')
        const { project: imported, notice } = makeProjectFromExternal(text)
        expect(notice).toBeUndefined()
        expect(imported.name).toBe('Round trip')
        expect(imported.language).toBe('MIPS')
        expect(imported.code).toBe('li $v0, 10\nsyscall')
        expect(imported.entry).toBe('main.mips')
        expect(imported.settings).toEqual({ maxHistorySize: 12 })
        expect(imported.testcases[0]?.expectedRegisters.v0).toBe(10n)
    })

    it('still imports a version 1 file, code first and metadata in comments', () => {
        const text = [
            '    move.l #1, d0',
            '',
            '; ---METADATA--- do not write below here',
            '; {',
            ';     "version": 1,',
            ';     "name": "From before",',
            ';     "language": "M68K",',
            ';     "description": "",',
            ';     "createdAt": 1,',
            ';     "updatedAt": 2,',
            ';     "id": "abcdefg",',
            ';     "testcases": []',
            '; }'
        ].join('\n')
        const { project, notice } = makeProjectFromExternal(text)
        expect(notice).toBeUndefined()
        expect(project.name).toBe('From before')
        expect(project.id).toBe('abcdefg')
        expect(project.code).toBe('    move.l #1, d0')
        expect(project.files['main.m68k']?.content).toBe('    move.l #1, d0')
    })

    it('imports the code only, and says so, from a newer version', () => {
        const text = [
            'halt',
            '',
            '; ---METADATA--- do not write below here',
            '; {"version": 3, "name": "Future", "language": "Z80", "entry": "main.z80"}'
        ].join('\n')
        const { project, notice } = makeProjectFromExternal(text)
        expect(notice).toMatch(/newer version/)
        expect(project.language).toBe('Z80')
        expect(project.code).toBe('halt')
        expect(project.name).toBe('Future')
    })

    it('imports a bare source file as a new project', () => {
        const { project, notice } = makeProjectFromExternal(
            '        .org 0x8000\nstart:\n        halt\n'
        )
        expect(notice).toBeUndefined()
        expect(project.code).toBe('        .org 0x8000\nstart:\n        halt')
        expect(project.entry).toBe(`main.${LANGUAGE_EXTENSIONS[project.language]}`)
    })
})

describe('projectContentEquals', () => {
    it('ignores the bookkeeping and notices every part the user owns', () => {
        const a = makeProject({ language: 'Z80', code: 'halt', id: 'a', updatedAt: 1 }).toObject()
        const b = makeProject({ language: 'Z80', code: 'halt', id: 'b', updatedAt: 2 }).toObject()
        expect(projectContentEquals(a, b)).toBe(true)
        expect(projectContentEquals(a, { ...b, settings: { maxHistorySize: 1 } })).toBe(false)
        expect(projectContentEquals(a, { ...b, description: 'changed' })).toBe(false)
    })
})
