/**
 * The Terminal's Command line in the Workbench: the program's name and the Project's Arguments,
 * edited outside a Debug session and locked during one to what that run started with
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 12, plan M10.3).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { CompilationFailedError } from '#lib/languages/BaseEmulator.svelte.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { parseCommandLine } from '#lib/commandLine.ts'
import CommandLine from '#cmp/specific/workbench/CommandLine.svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import type { CommandLineState } from './WorkbenchSession.svelte'

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme-argv').toString('base64')

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function setup(data: Parameters<typeof editorGroupsFixture>[1] = {}) {
    const fixture = editorGroupsFixture('X86', {
        entry: 'crackme',
        files: {
            crackme: { encoding: 'base64', content: crackme },
            'main.asm': { encoding: 'plain', content: 'nop' }
        },
        ...data
    })
    disposers.push(fixture.dispose)
    //a Build that succeeds, as the Emulator's does, and a Stop that ends the session
    fixture.emulator.compile = async () => {
        fixture.emulator.canExecute = true
    }
    fixture.emulator.clear = () => {
        fixture.emulator.canExecute = false
    }
    flushSync()
    return fixture
}

describe('the Command line', () => {
    it('names an Executable by its Entry path and an assembled program without the extension', () => {
        const { session, project } = setup()
        expect(session.commandLine).toMatchObject({ program: 'crackme', text: '', locked: false })
        project.entry = 'main.asm'
        flushSync()
        expect(session.commandLine?.program).toBe('main')
    })

    it('names a compiled program after the source File its Generated assembly came from', () => {
        const fingerprint = 'a'.repeat(32)
        const { session } = setup({
            entry: 'main.c.asm',
            files: {
                'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
                'main.c.asm': { encoding: 'plain', content: 'nop' }
            },
            compilations: [
                {
                    sourcePath: 'main.c',
                    outputPath: 'main.c.asm',
                    target: 'X86',
                    language: 'c',
                    compilerId: 'cg152',
                    optimization: '0',
                    inputs: { 'main.c': fingerprint },
                    outputFingerprint: fingerprint
                }
            ]
        })
        expect(session.commandLine?.program).toBe('main')
        //the same name the Build gives the program's argv[0]
        expect(session.sourceInput).toMatchObject({ entry: 'main.c.asm', entrySource: 'main.c' })
    })

    it('shows what a Build started only in the Debug session that Build made', async () => {
        const { session, emulator } = setup()
        emulator.compile = async (_historySize, sources) => {
            emulator.canExecute = true
            emulator.buildSources = { ...sources }
        }
        session.setProgramArguments('hunter2')
        await session.build()
        flushSync()
        expect(session.commandLine).toMatchObject({ text: 'hunter2', locked: true })
        //a session the Workbench's Build did not make, a test run's or the coding agent's, ran
        //with the Project's Arguments as they are now
        session.applySettings({ programArguments: 'swordfish' })
        emulator.buildSources = { ...emulator.buildSources! }
        flushSync()
        expect(session.commandLine).toMatchObject({ text: 'swordfish', locked: true })
        //and ending the session forgets what the Build started
        session.stop()
        emulator.canExecute = true
        flushSync()
        expect(session.commandLine?.text).toBe('swordfish')
    })

    it('is only for x86 Projects', () => {
        const fixture = editorGroupsFixture('RISC-V')
        disposers.push(fixture.dispose)
        expect(fixture.session.commandLine).toBeUndefined()
    })

    it("saves what is typed as the Project's Arguments, empty being none", () => {
        const { session, project, emulator } = setup()
        session.setProgramArguments('hunter2 "two words"')
        flushSync()
        expect(project.settings).toEqual({ programArguments: 'hunter2 "two words"' })
        expect(emulator.programArguments).toBe('hunter2 "two words"')
        expect(session.commandLine?.parsed).toEqual({ args: ['hunter2', 'two words'] })
        session.setProgramArguments('')
        flushSync()
        expect(project.settings).toEqual({})
        expect(session.commandLine?.text).toBe('')
    })

    it('is locked during a Debug session to what the run started with', async () => {
        const { session, project, emulator } = setup()
        session.setProgramArguments('hunter2')
        await session.build()
        flushSync()
        expect(emulator.programArguments).toBe('hunter2')
        expect(session.commandLine).toMatchObject({
            program: 'crackme',
            text: 'hunter2',
            locked: true
        })
        //typing is refused, and a change from the Settings panel waits for the next Build
        session.setProgramArguments('swordfish')
        expect(project.settings.programArguments).toBe('hunter2')
        session.applySettings({ programArguments: 'swordfish' })
        flushSync()
        expect(session.commandLine).toMatchObject({ text: 'hunter2', locked: true })
        //so does renaming the Entry, which a Build snapshot keeps
        project.entry = 'main.asm'
        flushSync()
        expect(session.commandLine?.program).toBe('crackme')

        session.stop()
        flushSync()
        expect(session.commandLine).toMatchObject({
            program: 'main',
            text: 'swordfish',
            locked: false
        })
    })

    it('is locked on a host that offers the Workbench read only', () => {
        const fixture = editorGroupsFixture(
            'X86',
            { settings: { programArguments: 'a' } },
            { readonly: true }
        )
        disposers.push(fixture.dispose)
        expect(fixture.session.commandLine?.locked).toBe(true)
        fixture.session.setProgramArguments('b')
        expect(fixture.project.settings.programArguments).toBe('a')
    })

    it('shows a Build its Arguments stopped in the Problems until they are typed again', async () => {
        const fixture = setup()
        const { session, emulator } = fixture
        const problem: Diagnostic = {
            severity: 'error',
            source: 'Arguments',
            lineIndex: 0,
            column: 0,
            line: { line: '', line_index: 0 },
            message: 'Arguments: The double quote (") at column 1 is never closed',
            formatted: 'Arguments: The double quote (") at column 1 is never closed'
        }
        emulator.compile = async () => {
            emulator.compilerDiagnostics = [problem]
            throw new CompilationFailedError(problem.message, [problem])
        }
        session.setProgramArguments('"')
        await session.build()
        flushSync()
        expect(session.bottomTab).toBe('problems')
        expect(session.activeDiagnostics).toEqual([problem])
        //it is the Command line's, not a line of whichever File is shown
        session.selectFile('main.asm')
        flushSync()
        expect(session.groups[0].displayedDiagnostics).toEqual([])
        expect(session.log.at(-1)).toMatchObject({ kind: 'build', tone: 'error' })
        expect(session.commandLine?.locked).toBe(false)

        //choosing it goes to the Command line, where the Arguments are typed
        const focus = session.commandLineFocus
        await session.revealDiagnostic(problem)
        expect(session.bottomTab).toBe('terminal')
        expect(session.commandLineFocus).toBe(focus + 1)

        session.setProgramArguments('"fixed"')
        flushSync()
        expect(session.activeDiagnostics).toEqual([])
    })
})

describe('the Command line component', () => {
    function draw(commandLine: CommandLineState) {
        const changes: string[] = []
        const target = document.createElement('div')
        document.body.append(target)
        const component = mount(CommandLine, {
            target,
            props: { commandLine, onChange: (text: string) => changes.push(text) }
        })
        flushSync()
        disposers.push(() => {
            unmount(component)
            target.remove()
        })
        const input = target.querySelector('input')!
        return { target, input, changes }
    }

    const state = (text: string, locked = false): CommandLineState => ({
        program: 'crackme',
        text,
        parsed: parseCommandLine(text),
        locked
    })

    it('reads as a shell line, the parsed argv as its tooltip', () => {
        const { target, input } = draw(state('hunter2 "two words"'))
        expect(target.textContent).toContain('$')
        expect(target.textContent).toContain('./crackme')
        expect(input.value).toBe('hunter2 "two words"')
        expect(input.readOnly).toBe(false)
        expect(target.querySelector('[title]')?.getAttribute('title')).toBe(
            'argv[0] = "./crackme"\nargv[1] = "hunter2"\nargv[2] = "two words"'
        )
        expect(target.querySelector('[role="alert"]')).toBeNull()
    })

    it('hands what is typed to the session', () => {
        const { input, changes } = draw(state(''))
        input.value = 'hunter2'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        expect(changes).toEqual(['hunter2'])
    })

    it('says inline why text does not parse', () => {
        const { target, input } = draw(state("'open"))
        const alert = target.querySelector('[role="alert"]')
        expect(alert?.textContent).toBe("The single quote (') at column 1 is never closed")
        expect(input.getAttribute('aria-invalid')).toBe('true')
    })

    it('is read only when locked, and says why', () => {
        const { target, input } = draw(state('hunter2', true))
        expect(input.readOnly).toBe(true)
        expect(target.querySelector('[title]')?.getAttribute('title')).toContain(
            'Stop the Debug session to change it.'
        )
    })
})
