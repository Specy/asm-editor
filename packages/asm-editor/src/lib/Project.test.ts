import { describe, expect, it } from 'vite-plus/test'
import {
    cleanTestcases,
    entryFileContent,
    isValidFilePath,
    legacyProjectShape,
    makeProject,
    makeProjectFromExternal,
    normalizeProjectData,
    projectContentEquals,
    ProjectFormatError,
    type Testcase
} from '#lib/Project.svelte.ts'
import { BASE_CODE, LANGUAGE_EXTENSIONS } from '#lib/Config.ts'

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
    it('keeps the Arguments of a Testcase as text, and adds none to one without', () => {
        const [withArguments, without, broken] = cleanTestcases([
            testcaseWith({ arguments: 'hunter2 "two words"' }),
            testcaseWith({}),
            testcaseWith({ arguments: ['hunter2'] as unknown as string })
        ])
        expect(withArguments.arguments).toBe('hunter2 "two words"')
        expect('arguments' in without).toBe(false)
        expect('arguments' in broken).toBe(false)
    })

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
 * The project format: a record whose program is a map of Files, whose Programs each name an Entry
 * file and whose Settings are decisions ([ADR 0013](../../../../docs/adr/0013-project-is-a-record.md),
 * [ADR 0014](../../../../docs/adr/0014-settings-split-by-effect.md),
 * [ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md)).
 * `normalizeProjectData` is the one path every stored, exported and shared shape goes through,
 * version 1 and the shape before Programs included, which is why it is tested on the shapes rather
 * than on the callers.
 */

const nothingDecided = { settings: {}, testcases: [] }

describe('normalizeProjectData', () => {
    it('turns a version 1 project, one code string, into its default Entry file', () => {
        const project = normalizeProjectData({ code: 'li $v0, 10', language: 'MIPS' })
        expect(project.files).toEqual({ 'main.mips': { encoding: 'plain', content: 'li $v0, 10' } })
        expect(project.programs).toEqual({ 'main.mips': nothingDecided })
        expect(project.selectedProgram).toBe('main.mips')
    })

    it('gives a project without a program the empty one of its language', () => {
        const project = normalizeProjectData(undefined)
        expect(project.language).toBe('M68K')
        expect(project.files['main.m68k']?.content).toBe(BASE_CODE.M68K)
        expect(project.programs).toEqual({ 'main.m68k': nothingDecided })
        expect(project.selectedProgram).toBe('main.m68k')
    })

    it('keeps an entry path even when it temporarily names no File', () => {
        const files = {
            'lib/util.z80': { encoding: 'plain', content: '' },
            'main.z80': { encoding: 'plain', content: 'halt' }
        }
        const selected = (data: Parameters<typeof normalizeProjectData>[0]) =>
            normalizeProjectData(data).selectedProgram
        expect(selected({ language: 'Z80', files, entry: 'lib/util.z80' })).toBe('lib/util.z80')
        expect(selected({ language: 'Z80', files, entry: 'gone.z80' })).toBe('gone.z80')
        expect(
            selected({ language: 'Z80', files: { 'only.z80': { encoding: 'plain', content: '' } } })
        ).toBe('only.z80')
        expect(
            Object.keys(
                normalizeProjectData({ language: 'Z80', files, entry: 'gone.z80' }).programs
            )
        ).toEqual(['gone.z80'])
    })

    it('reads the shape before Programs as one selected Program with all its parts', () => {
        const project = normalizeProjectData({
            language: 'MIPS',
            files: { 'main.s': { encoding: 'plain', content: 'nop' } },
            entry: 'main.s',
            settings: { undoEnabled: false },
            testcases: [testcaseWith({ expectedOutput: 'done' })],
            display: { unitWidth: 4 }
        })
        expect(project.programs['main.s']).toMatchObject({
            settings: { undoEnabled: false },
            testcases: [{ expectedOutput: 'done' }],
            display: { unitWidth: 4, width: 512 }
        })
        expect(project.selectedProgram).toBe('main.s')
        for (const field of ['entry', 'settings', 'testcases', 'display'])
            expect(project).not.toHaveProperty(field)
    })

    it('reads programs alone when they are given, whatever earlier fields come with them', () => {
        const project = normalizeProjectData({
            language: 'MIPS',
            files: { 'a.s': { encoding: 'plain', content: 'nop' } },
            programs: { 'a.s': { settings: { programArguments: 'x' }, testcases: [] } },
            entry: 'b.s',
            settings: { undoEnabled: false },
            testcases: [testcaseWith({})]
        })
        expect(project.programs).toEqual({
            'a.s': { settings: { programArguments: 'x' }, testcases: [] }
        })
        expect(project.selectedProgram).toBe('a.s')
    })

    it('keeps a Project without a Program, and with no selection, when programs is empty', () => {
        const project = normalizeProjectData({
            language: 'MIPS',
            files: { 'notes.txt': { encoding: 'plain', content: '' } },
            programs: {},
            selectedProgram: 'notes.txt',
            entry: 'notes.txt'
        })
        expect(project.programs).toEqual({})
        expect(project).not.toHaveProperty('selectedProgram')
        expect(entryFileContent(project)).toBe('')
    })

    it('keeps a saved selection, and otherwise selects the first Program by label', () => {
        const fingerprint = 'a'.repeat(32)
        const data = {
            language: 'MIPS',
            files: {
                'z.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
                'a.c.mips': { encoding: 'plain', content: 'nop' },
                'm.s': { encoding: 'plain', content: 'nop' }
            },
            //`a.c.mips` is listed as `z.c`, the source it was compiled from, so after `m.s`
            programs: {
                'a.c.mips': nothingDecided,
                'm.s': nothingDecided,
                'gone.s': nothingDecided
            },
            compilations: [
                {
                    sourcePath: 'z.c',
                    outputPath: 'a.c.mips',
                    target: 'MIPS' as const,
                    language: 'c' as const,
                    compilerId: 'cmipsg1420',
                    optimization: '0' as const,
                    inputs: { 'z.c': fingerprint },
                    outputFingerprint: fingerprint
                }
            ]
        }
        expect(normalizeProjectData({ ...data, selectedProgram: 'a.c.mips' }).selectedProgram).toBe(
            'a.c.mips'
        )
        expect(normalizeProjectData({ ...data, selectedProgram: 'gone.c' }).selectedProgram).toBe(
            'gone.s'
        )
        const two = { 'a.c.mips': nothingDecided, 'm.s': nothingDecided }
        expect(
            normalizeProjectData({ ...data, programs: two, selectedProgram: 42 }).selectedProgram
        ).toBe('m.s')
    })

    it('reads each Program as tolerantly as its parts were read before Programs', () => {
        const project = normalizeProjectData({
            programs: {
                'main.m68k': {
                    settings: { fileSystemHistoryBudgetMb: 30, nonsense: true },
                    testcases: 'none',
                    display: { width: '256' }
                },
                'other.m68k': null
            }
        })
        expect(project.programs['main.m68k'].settings).toEqual({ fileSystemHistoryBudgetMb: 30 })
        expect(project.programs['main.m68k'].testcases).toEqual([])
        expect(project.programs['main.m68k'].display?.width).toBe(256)
        expect(project.programs['other.m68k']).toEqual(nothingDecided)
    })

    it('refuses an Entry path outside the rules, and programs that are no map', () => {
        for (const programs of [{ '../main.m68k': nothingDecided }, null, [], 'main.m68k'])
            expect(() => normalizeProjectData({ programs }), String(programs)).toThrow(
                ProjectFormatError
            )
    })

    it('ignores a stray code string once the project has files', () => {
        const project = normalizeProjectData({
            language: 'Z80',
            code: 'old',
            files: { 'main.z80': { encoding: 'plain', content: 'new' } }
        })
        expect(project.files['main.z80']?.content).toBe('new')
    })

    it('accepts canonical base64 and refuses an encoding it does not know', () => {
        expect(
            normalizeProjectData({
                files: { 'data.bin': { encoding: 'base64', content: 'AAAA' } }
            }).files['data.bin']
        ).toEqual({ encoding: 'base64', content: 'AAAA' })
        expect(() =>
            normalizeProjectData({
                files: { 'main.m68k': { encoding: 'rot13', content: 'AAAA' } }
            })
        ).toThrow(ProjectFormatError)
    })

    it('refuses a path outside the rules', () => {
        for (const path of ['../main.m68k', '/main.m68k', 'dir//main.m68k', 'a/./b.s']) {
            expect(
                () =>
                    normalizeProjectData({ files: { [path]: { encoding: 'plain', content: '' } } }),
                path
            ).toThrow(ProjectFormatError)
        }
    })

    it('keeps only the Settings decisions it can use', () => {
        const project = normalizeProjectData({
            settings: { fileSystemHistoryBudgetMb: 30, nonsense: true, screenHistoryBudgetMb: -4 }
        })
        expect(project.programs['main.m68k'].settings).toEqual({ fileSystemHistoryBudgetMb: 30 })
    })

    it('keeps tab metadata optional for older Projects', () => {
        const project = normalizeProjectData({ language: 'MIPS', code: 'nop' })
        expect(project).not.toHaveProperty('openTabs')
        expect(project).not.toHaveProperty('activeTab')
    })

    it('cleans saved tab paths and selection, including a missing Entry', () => {
        const project = normalizeProjectData({
            entry: 'missing.s',
            files: { 'a.s': { encoding: 'plain', content: 'nop' } },
            openTabs: ['a.s', '../a.s', 'gone.s', 'a.s', null, 'missing.s', '@runtime/v1/lib.s'],
            activeTab: 'missing.s'
        })
        expect(project.openTabs).toEqual(['a.s'])
        expect(project.activeTab).toBeUndefined()
    })

    it('ignores malformed metadata and an active path outside the saved tabs', () => {
        for (const openTabs of [null, false, 'main.m68k', {}]) {
            const project = normalizeProjectData({ openTabs, activeTab: 42 })
            expect(project).not.toHaveProperty('openTabs')
            expect(project).not.toHaveProperty('activeTab')
        }
        const empty = normalizeProjectData({ openTabs: [], activeTab: 'main.m68k' })
        expect(empty.openTabs).toEqual([])
        expect(empty.activeTab).toBeUndefined()
    })
})

describe('isValidFilePath', () => {
    it('accepts canonical relative paths, including extensionless names and dotfiles', () => {
        for (const path of [
            'main.m68k',
            'src/lib/util.s',
            'README',
            '.config',
            'data/sprites.bin'
        ]) {
            expect(isValidFilePath(path), path).toBe(true)
        }
    })

    it('rejects absolute, traversal, empty, backslash and control-character paths', () => {
        for (const path of ['', '/x.s', 'a/../x.s', 'a\\x.s', 'a//x.s', 'bad\0name', '\ud800']) {
            expect(isValidFilePath(path), path).toBe(false)
        }
    })
})

describe('makeProject', () => {
    it('snapshots tab metadata independently and clears stale active paths on a merge', () => {
        const project = makeProject({ openTabs: ['main.m68k'], activeTab: 'main.m68k' })
        const snapshot = project.toObject()
        snapshot.openTabs!.push('other.s')
        expect(project.openTabs).toEqual(['main.m68k'])
        project.set({ openTabs: [] })
        expect(project.activeTab).toBeUndefined()
        expect(project.toObject().openTabs).toEqual([])
    })

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
        expect(Object.keys(project.programs)).toEqual(['main.mips'])
        expect(project.code).toBe('li $v0, 10')
        expect(project.name).toBe('Shared')
    })

    it('keeps its files when set is given a current shape', () => {
        const project = makeProject({ language: 'Z80', code: 'halt' })
        project.set({ programs: { 'main.z80': { settings: { undoEnabled: false } } } })
        expect(project.code).toBe('halt')
        expect(project.selected?.settings).toEqual({ undoEnabled: false })
    })

    it("allows a Program's Entry path to name a missing File", () => {
        const project = makeProject({ language: 'Z80', code: 'halt' })
        project.createProgram('other.z80')
        expect(project.selectedProgram).toBe('other.z80')
        expect(project.code).toBe('')
        expect(() => (project.code = 'nop')).not.toThrow()
        expect(project.files['other.z80']?.content).toBe('nop')
    })

    it('renders a binary Entry through Files without exposing it as editable code', () => {
        const project = makeProject({
            language: 'Z80',
            files: { 'main.z80': { encoding: 'base64', content: '/w==' } },
            entry: 'main.z80'
        })
        expect(project.code).toBe('')
        expect(project.files['main.z80']).toEqual({ encoding: 'base64', content: '/w==' })
    })
})

/**
 * A Project's Programs, each identified by its Entry file
 * ([programs.md](../../../../docs/design/programs.md)): made, selected, removed and renamed only as
 * a whole, through the Project, and never while a Debug session holds the Files.
 */
describe('Programs', () => {
    function twoPrograms() {
        return makeProject({
            language: 'MIPS',
            files: {
                'main.s': { encoding: 'plain', content: 'main' },
                'sort.s': { encoding: 'plain', content: 'sort' }
            },
            programs: {
                'main.s': { settings: { undoEnabled: false }, testcases: [testcaseWith({})] },
                'sort.s': { settings: { programArguments: '3 1 2' }, testcases: [] }
            },
            selectedProgram: 'sort.s'
        })
    }

    it('starts a new Project with one selected Program, main.<ext>, with nothing decided', () => {
        const project = makeProject({ language: 'RISC-V' })
        expect(project.programs).toEqual({ 'main.riscv': nothingDecided })
        expect(project.selectedProgram).toBe('main.riscv')
        expect(project.selected).toEqual(nothingDecided)
        expect(project.program('main.riscv')).toBe(project.selected)
        expect(project.program('other.riscv')).toBeUndefined()
        //no inherited key is a Program
        expect(project.program('constructor')).toBeUndefined()
    })

    it('makes a Program with nothing decided and selects it, for an Entry with none', () => {
        const project = twoPrograms()
        project.createProgram('lib/new.s')
        expect(project.selectedProgram).toBe('lib/new.s')
        expect(project.selected).toEqual(nothingDecided)
        expect(Object.keys(project.programs)).toEqual(['main.s', 'sort.s', 'lib/new.s'])
        expect(() => project.createProgram('main.s')).toThrow(/already the Entry/)
        expect(() => project.createProgram('../x.s')).toThrow(ProjectFormatError)
        expect(project.program('main.s')?.settings).toEqual({ undoEnabled: false })
    })

    it('selects only a Program, and reads what it runs with from the selection', () => {
        const project = twoPrograms()
        expect(project.code).toBe('sort')
        project.selectProgram('main.s')
        expect(project.code).toBe('main')
        expect(project.selected?.testcases).toHaveLength(1)
        expect(() => project.selectProgram('notes.txt')).toThrow(/Entry of no program/)
        expect(project.selectedProgram).toBe('main.s')
    })

    it('removes a Program, keeps its File and selects the first one left by label', () => {
        const project = makeProject({
            language: 'MIPS',
            files: {
                'b.s': { encoding: 'plain', content: '' },
                'a.s': { encoding: 'plain', content: '' },
                'c.s': { encoding: 'plain', content: '' }
            },
            programs: { 'c.s': nothingDecided, 'b.s': nothingDecided, 'a.s': nothingDecided },
            selectedProgram: 'b.s'
        })
        project.removeProgram('c.s')
        expect(project.selectedProgram).toBe('b.s')
        project.removeProgram('b.s')
        expect(project.selectedProgram).toBe('a.s')
        expect(Object.keys(project.files)).toEqual(['b.s', 'a.s', 'c.s'])
        //a path that is no Entry is left alone
        project.removeProgram('c.s')
        expect(Object.keys(project.programs)).toEqual(['a.s'])
    })

    it('leaves a Project without a Program when the last one goes, which nothing can write to', () => {
        const project = twoPrograms()
        project.removeProgram('sort.s')
        project.removeProgram('main.s')
        expect(project.programs).toEqual({})
        expect(project.selectedProgram).toBeUndefined()
        expect(project.selected).toBeUndefined()
        expect(project.code).toBe('')
        expect(() => (project.code = 'nop')).toThrow(/no program/)
        expect(project.toObject()).not.toHaveProperty('selectedProgram')
        const reloaded = makeProject(JSON.parse(JSON.stringify(project.toObject())))
        expect(reloaded.programs).toEqual({})
        expect(reloaded.selectedProgram).toBeUndefined()
    })

    it('moves a Program, its parts and its selection with a rename of its Entry', () => {
        const project = twoPrograms()
        const sort = project.program('sort.s')
        project.renameProgram('sort.s', 'algorithms/sort.s')
        expect(project.selectedProgram).toBe('algorithms/sort.s')
        expect(project.program('algorithms/sort.s')).toBe(sort)
        expect(project.program('sort.s')).toBeUndefined()
        //in place, so the picker's order by label is all that orders them
        expect(Object.keys(project.programs)).toEqual(['main.s', 'algorithms/sort.s'])
        project.renameProgram('main.s', 'start.s')
        expect(project.selectedProgram).toBe('algorithms/sort.s')
        //a File that is no Entry is no Program to move
        project.renameProgram('notes.txt', 'notes.md')
        expect(Object.keys(project.programs)).toEqual(['start.s', 'algorithms/sort.s'])
        expect(() => project.renameProgram('start.s', 'algorithms/sort.s')).toThrow(
            /already the Entry/
        )
        expect(() => project.renameProgram('start.s', '/start.s')).toThrow(ProjectFormatError)
    })

    it('replaces one part of one Program, reading Settings and Display as a load would', () => {
        const project = twoPrograms()
        project.setProgramSettings('main.s', { fileSystemHistoryBudgetMb: 8, nonsense: 1 } as never)
        project.setProgramTestcases('main.s', [])
        project.setProgramDisplay('main.s', { unitWidth: '2' } as never)
        expect(project.program('main.s')).toEqual({
            settings: { fileSystemHistoryBudgetMb: 8 },
            testcases: [],
            display: {
                unitWidth: 2,
                unitHeight: 1,
                width: 512,
                height: 256,
                baseAddress: 0x10010000
            }
        })
        project.setProgramDisplay('main.s', undefined)
        expect(project.program('main.s')).not.toHaveProperty('display')
        expect(project.program('sort.s')?.settings).toEqual({ programArguments: '3 1 2' })
        expect(() => project.setProgramSettings('notes.txt', {})).toThrow(/Entry of no program/)
    })

    it('refuses a change to which Programs there are during a Debug session, but not to their parts', () => {
        const project = twoPrograms()
        const run = project.fileSystem.beginSession()
        const locked = /Stop the Debug session/
        expect(() => project.createProgram('new.s')).toThrow(locked)
        expect(() => project.selectProgram('main.s')).toThrow(locked)
        expect(() => project.removeProgram('main.s')).toThrow(locked)
        expect(() => project.renameProgram('main.s', 'start.s')).toThrow(locked)
        expect(() => project.set({ programs: {} })).toThrow(locked)
        expect(() => project.set({ selectedProgram: 'main.s' })).toThrow(locked)
        expect(() => project.set({ entry: 'main.s', settings: {} })).toThrow(locked)
        //Settings apply at the next Build, and a Build reads the Display during its session
        project.setProgramSettings('sort.s', { programArguments: '1' })
        project.setProgramDisplay('sort.s', { unitWidth: 8 } as never)
        project.set({ name: 'Renamed while running' })
        expect(Object.keys(project.programs)).toEqual(['main.s', 'sort.s'])
        expect(project.selectedProgram).toBe('sort.s')
        run.stop()
        project.selectProgram('main.s')
        expect(project.selectedProgram).toBe('main.s')
    })

    it('saves the Programs and the selection in place of an Entry and its parts', () => {
        const object = twoPrograms().toObject()
        expect(Object.keys(object.programs)).toEqual(['main.s', 'sort.s'])
        expect(object.selectedProgram).toBe('sort.s')
        for (const field of ['entry', 'settings', 'testcases', 'display'])
            expect(object).not.toHaveProperty(field)
        const reloaded = makeProject(JSON.parse(JSON.stringify(object)))
        expect(reloaded.programs).toEqual(twoPrograms().programs)
        expect(reloaded.selectedProgram).toBe('sort.s')
    })

    it('replaces its Programs on a merge only with what the merge describes', () => {
        const kept = twoPrograms()
        kept.set({ name: 'Kept', id: 'x' })
        expect(Object.keys(kept.programs)).toEqual(['main.s', 'sort.s'])
        expect(kept.selectedProgram).toBe('sort.s')

        const replaced = twoPrograms()
        replaced.set({ programs: { 'sort.s': nothingDecided } })
        expect(replaced.programs).toEqual({ 'sort.s': nothingDecided })
        expect(replaced.selectedProgram).toBe('sort.s')

        //a record from before Programs is one Program, whose fields replace all of them
        const shared = twoPrograms()
        shared.set({ entry: 'main.s', settings: { undoEnabled: true }, testcases: [] })
        expect(shared.programs).toEqual({
            'main.s': { settings: { undoEnabled: true }, testcases: [] }
        })
        expect(shared.selectedProgram).toBe('main.s')

        //and a Project object read back from storage brings its own
        const stored = twoPrograms()
        stored.selectProgram('main.s')
        const opened = makeProject()
        opened.set(stored)
        expect(Object.keys(opened.programs)).toEqual(['main.s', 'sort.s'])
        expect(opened.selectedProgram).toBe('main.s')
        expect(opened.code).toBe('main')
    })
})

describe('legacyProjectShape', () => {
    it('puts the one Program at the top level, as every earlier version wrote it', () => {
        const snapshot = makeProject({
            language: 'MIPS',
            files: { 'main.s': { encoding: 'plain', content: 'nop' } },
            settings: { undoEnabled: false },
            testcases: [testcaseWith({})],
            display: { unitWidth: 2 }
        }).toObject()
        const legacy = legacyProjectShape(snapshot)
        expect(legacy).toMatchObject({
            entry: 'main.s',
            settings: { undoEnabled: false },
            testcases: [{ expectedOutput: '' }],
            display: { unitWidth: 2 },
            files: snapshot.files,
            language: 'MIPS'
        })
        expect(legacy).not.toHaveProperty('programs')
        expect(legacy).not.toHaveProperty('selectedProgram')
        expect(legacyProjectShape({ ...snapshot, programs: {} })).toBeUndefined()
        expect(
            legacyProjectShape({
                ...snapshot,
                programs: { 'a.s': nothingDecided, 'b.s': nothingDecided }
            })
        ).toBeUndefined()
        //and leaves out a Display the Program has none of
        expect(
            legacyProjectShape({ ...snapshot, programs: { 'main.s': nothingDecided } })
        ).not.toHaveProperty('display')
    })
})

describe('entryFileContent', () => {
    it("reads the Selected program's Entry, or another Program's", () => {
        const project = normalizeProjectData({
            language: 'MIPS',
            files: {
                'main.s': { encoding: 'plain', content: 'main' },
                'b.s': { encoding: 'plain', content: 'b' }
            },
            programs: { 'main.s': nothingDecided, 'b.s': nothingDecided, 'gone.s': nothingDecided },
            selectedProgram: 'main.s'
        })
        expect(entryFileContent(project)).toBe('main')
        expect(entryFileContent(project, 'b.s')).toBe('b')
        expect(entryFileContent(project, 'gone.s')).toBe('')
    })
})

describe('the exported file', () => {
    it('round trips a project through metadata version 2', async () => {
        const project = makeProject({
            name: 'Round trip',
            description: 'with a decision and a testcase',
            language: 'MIPS',
            code: 'li $v0, 10\nsyscall',
            settings: { fileSystemHistoryBudgetMb: 12 },
            openTabs: ['main.mips'],
            activeTab: 'main.mips',
            testcases: [testcaseWith({ expectedRegisters: { v0: 10n } })]
        })
        const text = project.toExternal()
        expect(text.startsWith('li $v0, 10\nsyscall')).toBe(true)
        expect(text).toContain('# ---METADATA---')
        const { project: imported, notice } = await makeProjectFromExternal(text)
        expect(notice).toBeUndefined()
        expect(imported.name).toBe('Round trip')
        expect(imported.language).toBe('MIPS')
        expect(imported.code).toBe('li $v0, 10\nsyscall')
        expect(imported.selectedProgram).toBe('main.mips')
        expect(imported.selected?.settings).toEqual({ fileSystemHistoryBudgetMb: 12 })
        expect(imported.openTabs).toEqual(['main.mips'])
        expect(imported.activeTab).toBe('main.mips')
        expect(imported.selected?.testcases[0]?.expectedRegisters.v0).toBe(10n)
    })

    it('still imports a version 1 file, code first and metadata in comments', async () => {
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
        const { project, notice } = await makeProjectFromExternal(text)
        expect(notice).toBeUndefined()
        expect(project.name).toBe('From before')
        expect(project.id).toBe('abcdefg')
        expect(project.code).toBe('    move.l #1, d0')
        expect(project.files['main.m68k']?.content).toBe('    move.l #1, d0')
    })

    it('imports the code only, and says so, from a newer version', async () => {
        const text = [
            'halt',
            '',
            '; ---METADATA--- do not write below here',
            '; {"version": 3, "name": "Future", "language": "Z80", "entry": "main.z80"}'
        ].join('\n')
        const { project, notice } = await makeProjectFromExternal(text)
        expect(notice).toMatch(/newer version/)
        expect(project.language).toBe('Z80')
        expect(project.code).toBe('halt')
        expect(project.name).toBe('Future')
    })

    it('imports a bare source file as a new project', async () => {
        const { project, notice } = await makeProjectFromExternal(
            '        .org 0x8000\nstart:\n        halt\n'
        )
        expect(notice).toBeUndefined()
        expect(project.code).toBe('        .org 0x8000\nstart:\n        halt')
        expect(project.selectedProgram).toBe(`main.${LANGUAGE_EXTENSIONS[project.language]}`)
    })

    it('holds exactly one Program, so a Project with several or none has no exported file', () => {
        const project = makeProject({ language: 'Z80', code: 'halt' })
        project.createProgram('other.z80')
        expect(() => project.toExternal()).toThrow(/exactly one program/)
        project.removeProgram('main.z80')
        expect(project.toExternal()).toContain('"entry": "other.z80"')
        project.removeProgram('other.z80')
        expect(() => project.toExternal()).toThrow(/exactly one program/)
    })
})

describe('projectContentEquals', () => {
    it('ignores the bookkeeping and notices every part the user owns', () => {
        const a = makeProject({ language: 'Z80', code: 'halt', id: 'a', updatedAt: 1 }).toObject()
        const b = makeProject({ language: 'Z80', code: 'halt', id: 'b', updatedAt: 2 }).toObject()
        expect(projectContentEquals(a, b)).toBe(true)
        const decided = { settings: { undoEnabled: false }, testcases: [] }
        expect(projectContentEquals(a, { ...b, programs: { 'main.z80': decided } })).toBe(false)
        const two = { 'main.z80': nothingDecided, 'b.z80': nothingDecided }
        expect(projectContentEquals({ ...a, programs: two }, { ...b, programs: two })).toBe(true)
        expect(
            projectContentEquals(
                { ...a, programs: two },
                { ...b, programs: two, selectedProgram: 'b.z80' }
            )
        ).toBe(false)
        expect(projectContentEquals(a, { ...b, description: 'changed' })).toBe(false)
        expect(projectContentEquals(a, { ...b, openTabs: [] })).toBe(false)
        expect(projectContentEquals(a, { ...b, activeTab: 'main.z80' })).toBe(false)
    })
})
