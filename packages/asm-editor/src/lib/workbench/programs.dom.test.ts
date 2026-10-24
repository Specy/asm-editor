/**
 * The Workbench's Programs: the Selected program everything without an Entry file to go by uses,
 * a pane's Build and Test of the Program whose Entry it shows, the host's actions that make, move
 * and delete Programs, and the one effect that applies a selection
 * ([programs.md](../../../../../docs/design/programs.md), the plan's M3).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import {
    DEFAULT_PROJECT_DISPLAY,
    type AvailableLanguages,
    type ProjectDisplay,
    type StoredProject,
    type Testcase,
    type TestcaseResult
} from '#lib/Project.svelte.ts'
import { normalizeBuildInput, type BuildSources, type ProjectFile } from '#lib/projectFiles.ts'
import type { ProjectAnalysisSnapshot } from '#lib/languages/service/protocol.ts'
import {
    compileProjectSource,
    type CompiledProgram
} from '#lib/sourceCompilation/compileProjectSource.ts'
import { toast } from '#stores/toastStore.ts'
import ExecutionControlsHarness from '#cmp/specific/workbench/__fixtures__/ExecutionControlsHarness.svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import type { EditorGroup } from './EditorGroup.svelte'
import { NO_PROGRAM_MESSAGE, type WorkbenchSession } from './WorkbenchSession.svelte'

vi.mock('#lib/sourceCompilation/compileProjectSource.ts', () => ({ compileProjectSource: vi.fn() }))

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')

const text = (content: string): ProjectFile => ({ encoding: 'plain', content })
const testcase: Testcase = {
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
}

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

/**
 * A Project of two Programs, `main.s` selected and `sort.s` with its own Arguments and a
 * Testcase, beside Files that are no Entry; its Build succeeds and records what it was given, and
 * the Emulator records the Settings and Display it is handed.
 */
function setup(language: AvailableLanguages = 'RISC-V', data: StoredProject = {}) {
    const fixture = editorGroupsFixture(language, {
        files: {
            'main.s': text('nop'),
            'sort.s': text('nop\nnop'),
            'macros.inc': text(''),
            'notes.txt': text('notes'),
            'main.c': text('int main(void) { return 0; }')
        },
        programs: {
            'main.s': { settings: {}, testcases: [] },
            'sort.s': { settings: { programArguments: 'sort me' }, testcases: [testcase] }
        },
        selectedProgram: 'main.s',
        ...data
    })
    disposers.push(fixture.dispose)
    const { emulator } = fixture
    const given = {
        screen: undefined as number | undefined,
        fileSystem: undefined as number | undefined,
        display: undefined as ProjectDisplay | undefined
    }
    emulator.setScreenHistoryBudgetMb = (megabytes) => (given.screen = megabytes)
    emulator.setFileSystemHistoryBudgetMb = (megabytes) => (given.fileSystem = megabytes)
    const withDisplay = emulator as typeof emulator & {
        setDisplay: (display: ProjectDisplay) => void
        test: (sources: BuildSources, testcases: Testcase[]) => Promise<TestcaseResult[]>
    }
    withDisplay.setDisplay = (display) => (given.display = display)
    /** What each Build was given, as the Emulator read it when it started. */
    const builds: { sources: BuildSources; arguments: string; screen?: number }[] = []
    emulator.compile = async (_historySize, sources) => {
        builds.push({ sources, arguments: emulator.programArguments, screen: given.screen })
        emulator.buildSources = { ...sources }
        emulator.canExecute = true
        emulator.currentFile = sources.entry
        emulator.line = 0
    }
    emulator.clear = () => {
        emulator.canExecute = false
        emulator.buildSources = undefined
    }
    /** What each test run was given. */
    const tests: { entry: string; testcases: Testcase[] }[] = []
    withDisplay.test = async (sources, testcases) => {
        tests.push({ entry: sources.entry, testcases })
        return testcases.map((item) => ({ testcase: item, passed: true, errors: [] }))
    }
    flushSync()
    return { ...fixture, emulator: withDisplay, given, builds, tests }
}

function show(session: WorkbenchSession, path: string, group: EditorGroup = session.groups[0]) {
    session.selectFile(path, group)
    flushSync()
    return group
}

/** The buttons of a pane's dock, as the Workbench draws it, and a press on one of them. */
function dock(session: WorkbenchSession, group: EditorGroup) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ExecutionControlsHarness, { target, props: { session, group } })
    flushSync()
    disposers.push(() => unmount(app))
    return {
        buttons: () =>
            [...target.querySelectorAll('button')].map(
                (button) => button.getAttribute('aria-label') ?? button.textContent?.trim()
            ),
        button: (label: string) =>
            target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`),
        press: (label: string) =>
            target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
    }
}

describe('the Selected program', () => {
    it('is what the session builds, configures and names', () => {
        const { session, project } = setup()
        expect(session.sourceInput.entry).toBe('main.s')
        expect(session.commandLine?.program).toBe('main')
        //a derived is brought up to date as it is read, so a Build that selects first reads the
        //new Program's sources at once
        project.selectProgram('sort.s')
        expect(session.sourceInput.entry).toBe('sort.s')
        expect(session.effectiveSettings.programArguments).toBe('sort me')
        expect(session.commandLine).toMatchObject({ program: 'sort', text: 'sort me' })
    })

    it('can be none, which builds nothing and says how to make one', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session, project, builds, tests } = setup()
        project.removeProgram('main.s')
        project.removeProgram('sort.s')
        flushSync()
        //the Emulator and live checking still have sources, which say why nothing builds
        expect(session.sourceInput).toMatchObject({
            entry: 'main.riscv',
            assemblyError: NO_PROGRAM_MESSAGE
        })
        expect(() => normalizeBuildInput(session.sourceInput)).not.toThrow()
        expect(session.commandLine).toBeUndefined()
        await session.build()
        await session.test()
        expect(builds).toEqual([])
        expect(tests).toEqual([])
        expect(warn).toHaveBeenCalledWith(NO_PROGRAM_MESSAGE)
        session.applySettings({ programArguments: 'x' })
        expect(project.programs).toEqual({})
    })

    it("gives the Emulator its Settings and Display once selected, and drops the last one's results", () => {
        const display = { ...DEFAULT_PROJECT_DISPLAY, width: 256 }
        const { session, project, given } = setup('MIPS', {
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'sort.s': {
                    settings: { screenHistoryBudgetMb: 8, fileSystemHistoryBudgetMb: 4 },
                    testcases: [],
                    display
                }
            }
        })
        const result = { testcase, passed: true, errors: [] }
        session.testcasesResult = [result]
        //the Workbench made the Emulator with the Program selected then, which is not given again
        expect(given).toEqual({ screen: undefined, fileSystem: undefined, display: undefined })
        expect(session.selectProgram('sort.s')).toBe(true)
        flushSync()
        expect(given).toEqual({ screen: 8, fileSystem: 4, display })
        expect(session.currentDisplay).toEqual(display)
        expect(session.testcasesResult).toEqual([])
        //however the selection changes: here a deletion, which selects the first one left
        project.fileSystem.remove('sort.s')
        session.fileDeleted('sort.s')
        flushSync()
        expect(project.selectedProgram).toBe('main.s')
        expect(given).toEqual({ screen: 64, fileSystem: 64, display: DEFAULT_PROJECT_DISPLAY })
    })

    it('waits for Stop to apply a change made during a Debug session, which refuses its own', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session, project, emulator } = setup()
        await session.build()
        flushSync()
        expect(session.debugSession).toBe(true)
        expect(session.programsLocked).toBe('Stop the Debug session before changing programs')
        //the picker, Remove program and New program from this file are refused
        expect(session.selectProgram('sort.s')).toBe(false)
        expect(session.removeProgram('main.s')).toBe(false)
        expect(session.createProgram('notes.txt')).toBe(false)
        expect(warn).toHaveBeenCalledTimes(3)
        expect(Object.keys(project.programs)).toEqual(['main.s', 'sort.s'])
        expect(project.selectedProgram).toBe('main.s')
        //a change made anyway reaches the Emulator once the session ends
        project.selectProgram('sort.s')
        flushSync()
        expect(emulator.programArguments).toBe('')
        session.stop()
        flushSync()
        expect(emulator.programArguments).toBe('sort me')
    })

    it('locks the Programs and the Files while a test run lasts, and frees them after', async () => {
        const { session, emulator } = setup()
        let finish!: () => void
        emulator.test = async (_sources, testcases) => {
            await new Promise<void>((resolve) => (finish = resolve))
            return testcases.map((item) => ({ testcase: item, passed: true, errors: [] }))
        }
        const run = session.test('sort.s')
        await vi.waitFor(() => expect(session.testing).toBe(true))
        flushSync()
        expect(session.programsLocked).toBe(
            'Wait for the Build or the test run to end before changing programs'
        )
        expect(session.filesLocked).toBe(true)
        finish()
        await run
        flushSync()
        expect(session.programsLocked).toBeUndefined()
        expect(session.filesLocked).toBe(false)
    })

    it('is refused a change while a Build runs', async () => {
        const { session, project, emulator } = setup()
        let finish!: () => void
        emulator.compile = () => new Promise<void>((resolve) => (finish = resolve))
        const building = session.build()
        expect(session.selectProgram('sort.s')).toBe(false)
        finish()
        await building
        expect(project.selectedProgram).toBe('main.s')
    })
})

describe('a Build and a test run', () => {
    it('build and select the Program a pane names, with its Settings, and Shift+B the Selected one', async () => {
        const { session, project, builds } = setup('RISC-V', {
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'sort.s': {
                    settings: { programArguments: 'sort me', screenHistoryBudgetMb: 8 },
                    testcases: []
                }
            }
        })
        await session.build('sort.s')
        flushSync()
        expect(project.selectedProgram).toBe('sort.s')
        //given to the Emulator before the Build reads them, not after
        expect(builds.map((build) => [build.sources.entry, build.arguments, build.screen])).toEqual(
            [['sort.s', 'sort me', 8]]
        )
        expect(session.log.at(-1)?.text).toMatch(/^Built sort\.s in /)
        session.stop()
        await session.build()
        expect(builds.at(-1)?.sources.entry).toBe('sort.s')
    })

    it('refuse a path that is the Entry of no Program', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session, project, builds } = setup()
        await session.build('macros.inc')
        expect(builds).toEqual([])
        expect(project.selectedProgram).toBe('main.s')
        expect(warn).toHaveBeenCalledWith('macros.inc is the Entry of no program')
    })

    it("run the Testcases of the Program a pane names and select it, or else the Selected program's", async () => {
        const { session, project, tests } = setup()
        await session.test('sort.s')
        flushSync()
        expect(project.selectedProgram).toBe('sort.s')
        expect(tests).toEqual([{ entry: 'sort.s', testcases: [testcase] }])
        expect(session.testcasesResult).toHaveLength(1)
        project.selectProgram('main.s')
        flushSync()
        //a selection forgets the results, which were another Program's
        expect(session.testcasesResult).toEqual([])
        await session.test()
        expect(tests.at(-1)).toEqual({ entry: 'main.s', testcases: [] })
    })

    it("are refused by the Selected program's live errors alone, which are all live checking sees", () => {
        const { session } = setup()
        session.languageAnalysis = {
            diagnostics: [
                {
                    severity: 'error',
                    source: 'rars',
                    message: 'Unknown instruction',
                    location: {
                        path: 'main.s',
                        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 3 } }
                    }
                }
            ]
        } as unknown as ProjectAnalysisSnapshot
        flushSync()
        expect(session.buildDisabledFor('main.s')).toBe(true)
        expect(session.buildDisabled).toBe(true)
        //another Program's Build goes ahead, and reports its own errors
        expect(session.buildDisabledFor('sort.s')).toBe(false)
        session.compiling = true
        expect(session.buildDisabledFor('sort.s')).toBe(true)
    })
})

describe("a pane's dock", () => {
    it("builds and tests the Program whose Entry file the pane shows, and every Entry's pane has one", async () => {
        const { session, project, builds } = setup()
        const left = show(session, 'main.s')
        const right = show(session, 'sort.s', session.splitEditor())
        expect([left.displayedProgram, right.displayedProgram]).toEqual(['main.s', 'sort.s'])
        expect([left.hasDock(true), right.hasDock(true)]).toEqual([true, true])
        //the one bar a tablet has is the Selected program's pane's
        expect(session.controlsGroup).toBe(left)
        const leftDock = dock(session, left)
        const rightDock = dock(session, right)
        expect(leftDock.buttons()).toEqual(['Build'])
        expect(rightDock.buttons()).toEqual(['Build', 'Test'])
        rightDock.press('Build')
        await vi.waitFor(() => expect(session.debugSession && !session.building).toBe(true))
        await tick()
        flushSync()
        expect(builds.map((build) => build.sources.entry)).toEqual(['sort.s'])
        expect(project.selectedProgram).toBe('sort.s')
        //during the Debug session only the pane execution is followed in has the controls
        expect(session.controlsGroup).toBe(right)
        expect([left, right].filter((group) => group.hasDock(true))).toEqual([right])
    })

    it('calls Build Debug for an Executable, which a Build loads, saying so until it builds', async () => {
        //reverse-engineering-ux.md, decision 10
        const { session, emulator } = setup('X86', {
            files: { 'main.s': text('nop'), crackme: { encoding: 'base64', content: crackme } },
            programs: {
                'main.s': { settings: {}, testcases: [] },
                crackme: { settings: {}, testcases: [] }
            },
            selectedProgram: 'main.s'
        })
        const left = show(session, 'main.s')
        const right = show(session, 'crackme', session.splitEditor())
        const assembly = dock(session, left)
        const executable = dock(session, right)
        expect(assembly.buttons()).toEqual(['Build'])
        expect(assembly.button('Build')!.title).toBe('Assemble the program and start debugging it')
        expect(executable.buttons()).toEqual(['Debug', 'Hex', 'Disassemble', 'Decompile'])
        const debug = executable.button('Debug')!
        expect(debug.textContent?.trim()).toBe('Debug')
        expect(debug.title).toBe('Load the program and start debugging it')
        //while it builds, the button says what the Build waits for, beside Cancel
        let finish = () => {}
        emulator.compile = (_historySize, sources) =>
            new Promise<void>((resolve) => {
                emulator.buildPhase = 'Loading the program…'
                finish = () => {
                    emulator.buildPhase = undefined
                    emulator.buildSources = { ...sources }
                    emulator.canExecute = true
                    resolve()
                }
            })
        executable.press('Debug')
        flushSync()
        expect(session.project.selectedProgram).toBe('crackme')
        expect(debug.textContent?.trim()).toBe('Loading the program…')
        expect(debug.title).toBe('Loading the program…')
        expect(executable.button('Cancel the Build')).not.toBeNull()
        finish()
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(executable.buttons().slice(0, 4)).toEqual(['Stop', 'Run', 'Undo', 'Step'])
    })

    it('makes the pane whose Build or Test was pressed the one execution is followed in', async () => {
        const { session, emulator } = setup()
        const left = show(session, 'main.s')
        const right = show(session, 'sort.s', session.splitEditor())
        session.executionGroupId = left.id
        //sort.s stops first in a File no pane shows, which opens in the execution pane
        const compile = emulator.compile
        emulator.compile = async (historySize, sources) => {
            await compile(historySize, sources)
            emulator.currentFile = 'macros.inc'
        }
        dock(session, right).press('Build')
        await vi.waitFor(() => expect(session.debugSession && !session.building).toBe(true))
        await tick()
        flushSync()
        expect(session.executionGroupId).toBe(right.id)
        expect(session.controlsGroup).toBe(right)
        expect([left.displayedPath, right.displayedPath]).toEqual(['main.s', 'macros.inc'])
        session.stop()
        flushSync()
        //a Test from a pane does the same
        session.executionGroupId = right.id
        show(session, 'sort.s', right)
        await session.test('main.s', left)
        expect(session.executionGroupId).toBe(left.id)
    })

    it("gives the one bar a tablet has to a pane with Build, never to C's", () => {
        //a Program whose Entry is C source, as earlier data can have, is selected; its pane has
        //Compile alone
        const { session } = setup('RISC-V', {
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'main.c': { settings: {}, testcases: [] }
            },
            selectedProgram: 'main.c'
        })
        show(session, 'main.c')
        const assembly = show(session, 'main.s', session.splitEditor())
        session.executionGroupId = session.groups[0].id
        flushSync()
        expect(session.controlsGroup).toBe(assembly)
    })

    it('has no Build beside a File that is no Entry, nor beside C, which has Compile', () => {
        //a Program whose Entry is C source, as earlier data can have, is still compiled first
        const { session } = setup('RISC-V', {
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'main.c': { settings: {}, testcases: [testcase] }
            }
        })
        for (const path of ['macros.inc', 'notes.txt']) {
            const group = show(session, path)
            expect(group.displayedProgram, path).toBeUndefined()
            expect(group.hasDock(true), path).toBe(false)
        }
        const source = show(session, 'main.c')
        expect(source.displayedProgram).toBe('main.c')
        expect(source.hasDock(true)).toBe(true)
        expect(dock(session, source).buttons()).toEqual(['Compile'])
    })

    it('has no Program for an Entry that is missing, which there is nothing to show of', () => {
        const { session, project } = setup()
        project.fileSystem.remove('sort.s')
        flushSync()
        const group = show(session, 'sort.s')
        expect(group.displayedProgram).toBeUndefined()
        expect(group.hasDock(true)).toBe(false)
        expect(session.programChoices.find((choice) => choice.entry === 'sort.s')).toEqual({
            entry: 'sort.s',
            label: 'sort.s',
            missing: true
        })
    })
})

describe('the Programs the host changes', () => {
    it('lists them by label, a compiled one by its source, a missing Entry marked', () => {
        const fingerprint = 'a'.repeat(32)
        const { session } = setup('RISC-V', {
            files: {
                'main.s': text('nop'),
                'zsort.c': text('int main(void) { return 0; }'),
                'zsort.c.riscv': text('nop')
            },
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'zsort.c.riscv': { settings: {}, testcases: [] },
                'gone.s': { settings: {}, testcases: [] }
            },
            compilations: [
                {
                    sourcePath: 'zsort.c',
                    outputPath: 'zsort.c.riscv',
                    target: 'RISC-V',
                    language: 'c',
                    compilerId: 'gcc',
                    optimization: '0',
                    inputs: { 'zsort.c': fingerprint },
                    outputFingerprint: fingerprint
                }
            ]
        })
        expect(session.programChoices).toEqual([
            { entry: 'gone.s', label: 'gone.s', missing: true },
            { entry: 'main.s', label: 'main.s', missing: false },
            { entry: 'zsort.c.riscv', label: 'zsort.c', missing: false }
        ])
    })

    it('says what deleting an Entry takes with it', () => {
        const { session, project } = setup()
        expect(session.programLoss('notes.txt')).toBeUndefined()
        expect(session.programLoss('main.s')).toEqual({ settings: false, testcases: 0 })
        expect(session.programLoss('sort.s')).toEqual({ settings: true, testcases: 1 })
        project.setProgramSettings('main.s', { undoEnabled: false })
        expect(session.programLoss('main.s')).toEqual({ settings: true, testcases: 0 })
    })

    it('makes, selects and removes them, the File staying', () => {
        const onChange = vi.fn()
        const fixture = editorGroupsFixture('RISC-V', {}, { onChange })
        disposers.push(fixture.dispose)
        const { session, project } = fixture
        //each is a change to the Project, saved as any other
        const changes = (step: () => boolean) => {
            onChange.mockClear()
            expect(step()).toBe(true)
            expect(onChange).toHaveBeenCalled()
        }
        expect(project.selectedProgram).toBe('main.c')
        changes(() => session.createProgram('main.s'))
        expect(project.selectedProgram).toBe('main.s')
        changes(() => session.selectProgram('main.c'))
        //a File is the Entry of one Program at most: making it again selects it
        changes(() => session.createProgram('main.s'))
        expect(Object.keys(project.programs)).toEqual(['main.c', 'main.s'])
        expect(project.selectedProgram).toBe('main.s')
        expect(session.selectProgram('value.h')).toBe(false)
        changes(() => session.removeProgram('main.s'))
        expect(project.selectedProgram).toBe('main.c')
        expect(project.files['main.s']).toBeDefined()
    })

    it('refuses to make or remove one on a read-only host', () => {
        const fixture = editorGroupsFixture('RISC-V', {}, { readonly: true })
        disposers.push(fixture.dispose)
        expect(fixture.session.createProgram('main.s')).toBe(false)
        expect(fixture.session.removeProgram('main.c')).toBe(false)
        expect(Object.keys(fixture.project.programs)).toEqual(['main.c'])
    })

    it("deletes an Entry's Program with its File, selecting the first one left by label", () => {
        const { session, project } = setup('RISC-V', {
            programs: {
                'main.s': { settings: {}, testcases: [] },
                'b.s': { settings: {}, testcases: [] },
                'a.s': { settings: {}, testcases: [] }
            },
            selectedProgram: 'b.s',
            files: { 'main.s': text(''), 'b.s': text(''), 'a.s': text(''), 'notes.txt': text('') }
        })
        project.fileSystem.remove('notes.txt')
        session.fileDeleted('notes.txt')
        expect(Object.keys(project.programs)).toHaveLength(3)
        project.fileSystem.remove('b.s')
        session.fileDeleted('b.s')
        expect(Object.keys(project.programs)).toEqual(['main.s', 'a.s'])
        expect(project.selectedProgram).toBe('a.s')
    })

    it('moves a Program with a host rename of its Entry, its selection with it', () => {
        const { session, project } = setup()
        project.fileSystem.rename('main.s', 'start.s')
        session.fileRenamed('main.s', 'start.s')
        expect(Object.keys(project.programs)).toEqual(['start.s', 'sort.s'])
        expect(project.selectedProgram).toBe('start.s')
        //a File that is no Entry moves no Program
        project.fileSystem.rename('notes.txt', 'readme.txt')
        session.fileRenamed('notes.txt', 'readme.txt')
        expect(Object.keys(project.programs)).toEqual(['start.s', 'sort.s'])
        //a Program moved over another's missing Entry takes its path
        project.fileSystem.remove('start.s')
        project.fileSystem.rename('sort.s', 'start.s')
        session.fileRenamed('sort.s', 'start.s')
        expect(project.programs).toEqual({
            'start.s': { settings: { programArguments: 'sort me' }, testcases: [testcase] }
        })
    })
})

describe('the first Program, which makes itself', () => {
    /** The same Project without its Programs, as after removing the last one. */
    function none(language: AvailableLanguages = 'RISC-V') {
        return setup(language, { programs: {} })
    }
    function add(fixture: ReturnType<typeof setup>, files: Record<string, ProjectFile>) {
        for (const [path, file] of Object.entries(files))
            if (file.encoding === 'plain') fixture.project.fileSystem.writeText(path, file.content)
            else fixture.project.fileSystem.writeBytes(path, Buffer.from(file.content, 'base64'))
        fixture.session.filesAdded(Object.keys(files))
        flushSync()
    }

    it('from the File named main.<ext> among several, and selects it', () => {
        const fixture = none()
        add(fixture, { 'bubble.s': text('nop'), 'main.s': text('nop'), 'notes.txt': text('') })
        expect(fixture.project.programs).toEqual({ 'main.s': { settings: {}, testcases: [] } })
        expect(fixture.project.selectedProgram).toBe('main.s')
        expect(fixture.session.sourceInput.entry).toBe('main.s')
    })

    it('from the only qualifying File, and from none of several', () => {
        const one = none()
        add(one, { 'sort.asm': text('nop'), 'macros.inc': text('') })
        expect(one.project.selectedProgram).toBe('sort.asm')
        const several = none()
        add(several, { 'bubble.s': text('nop'), 'quick.s': text('nop') })
        expect(several.project.programs).toEqual({})
    })

    it('never from an .inc, an extension-less File or C source', () => {
        const fixture = none()
        add(fixture, { 'macros.inc': text('') })
        add(fixture, { start: text('nop') })
        add(fixture, { 'sum.c': text('int main(void) { return 0; }') })
        expect(fixture.project.programs).toEqual({})
    })

    it('from a supported Executable in an x86 Project', () => {
        const fixture = none('X86')
        add(fixture, { crackme: { encoding: 'base64', content: crackme } })
        expect(fixture.project.selectedProgram).toBe('crackme')
        const mips = none('MIPS')
        add(mips, { crackme: { encoding: 'base64', content: crackme } })
        expect(mips.project.programs).toEqual({})
    })

    it('only while the Project has none', () => {
        const fixture = setup()
        add(fixture, { 'quick.s': text('nop') })
        expect(Object.keys(fixture.project.programs)).toEqual(['main.s', 'sort.s'])
    })

    it('from a rename into a qualifying name, as the Explorer makes one', () => {
        const fixture = none()
        const { project, session } = fixture
        project.fileSystem.rename('notes.txt', 'a.s')
        session.fileRenamed('notes.txt', 'a.s')
        flushSync()
        expect(project.selectedProgram).toBe('a.s')
    })

    it('not from a rename of a File that qualified already, whose Program was removed', () => {
        const fixture = none()
        const { project, session } = fixture
        project.fileSystem.rename('main.s', 'start.s')
        session.fileRenamed('main.s', 'start.s')
        flushSync()
        expect(project.programs).toEqual({})
        //nor from a rename out of qualifying
        project.fileSystem.rename('sort.s', 'sort.txt')
        session.fileRenamed('sort.s', 'sort.txt')
        flushSync()
        expect(project.programs).toEqual({})
    })

    it('after the last Entry is deleted, from what replaces it', () => {
        const fixture = setup('RISC-V', {
            programs: { 'main.s': { settings: {}, testcases: [] } }
        })
        const { project, session } = fixture
        project.fileSystem.remove('main.s')
        session.fileDeleted('main.s')
        expect(project.programs).toEqual({})
        add(fixture, { 'main.s': text('nop') })
        expect(project.selectedProgram).toBe('main.s')
    })
})

describe('Compile', () => {
    const fingerprint = 'b'.repeat(32)
    function compiled(program: CompiledProgram, definesMain: boolean) {
        return {
            record: {
                sourcePath: 'main.c',
                outputPath: 'main.c.riscv',
                target: 'RISC-V' as const,
                language: 'c' as const,
                compilerId: 'gcc',
                optimization: '0' as const,
                inputs: { 'main.c': fingerprint },
                outputFingerprint: fingerprint
            },
            map: { sourcePath: 'main.c', outputFingerprint: fingerprint, lines: [] },
            assembly: '',
            diagnostics: [],
            program,
            definesMain
        }
    }

    it.each([
        ['none', false, ['note: main.c defines no `main`, so no program was made for it.']],
        ['none', true, []],
        ['created', true, []],
        ['selected', false, []]
    ] as const)(
        'notes a source that made no Program for want of main (program %s, main %s)',
        async (program, definesMain, notes) => {
            const { session } = setup()
            show(session, 'main.c')
            vi.mocked(compileProjectSource).mockResolvedValue(compiled(program, definesMain))
            await session.compileDisplayedSource(session.groups[0])
            expect(session.log.map((entry) => `${entry.kind}: ${entry.text}`)).toEqual(notes)
        }
    )
})
