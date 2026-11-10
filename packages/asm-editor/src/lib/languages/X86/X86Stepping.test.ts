import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { RegisterFile } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { X86Emulator } from './X86Emulator.svelte'

/**
 * Step over and Step out against the real Core
 * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)): the Core keeps its Call
 * stack whether or not Undo records, pushes a frame for a signal delivered to a handler and stops
 * a run at a call depth, and the adapter hands those to the Emulator.
 */

const emulators: { dispose(): void }[] = []
afterEach(() => {
    emulators.splice(0).forEach((emulator) => emulator.dispose())
    preferencesStore.values.stepIntoRuntimeLibrary.value = false
})

/** A NASM program whose lines can be found by their text. */
function program(lines: string[]) {
    const code = ['bits 64', 'global _start', 'section .text', '_start:', ...lines].join('\n')
    const all = code.split('\n')
    const lineOf = (text: string) => {
        const line = all.findIndex((candidate) => candidate.trim() === text)
        if (line < 0) throw new Error(`No line ${text}`)
        expect(all.indexOf(all[line], line + 1), `${text} is not unique`).toBe(-1)
        return line
    }
    const sources: BuildSources = {
        entry: 'main.asm',
        files: { 'main.asm': { encoding: 'plain', content: code } }
    }
    return { sources, lineOf }
}

async function built(sources: BuildSources, historySize: number) {
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    emulators.push(emulator)
    await emulator.compile(historySize, sources)
    expect(emulator.errors).toEqual([])
    return emulator
}

type Emulator = Awaited<ReturnType<typeof built>>

function cpu(emulator: { registerFiles: RegisterFile[] }, name: string): bigint {
    const file = emulator.registerFiles.find((candidate) => candidate.id === 'cpu')!
    return file.registers.find((register) => register.name === name)!.value
}

const routines = (emulator: Emulator) => emulator.callStack.map((frame) => frame.name)

async function stepTo(emulator: Emulator, line: number) {
    for (let i = 0; i < 100 && emulator.line !== line; i++) await emulator.step()
    expect(emulator.line).toBe(line)
}

/** `fact(3)` by recursion, into rax. */
const FACTORIAL = program([
    '    mov rdi, 3',
    '    call fact',
    '    mov rbx, rax',
    '    mov rax, 60',
    '    xor rdi, rdi',
    '    syscall',
    'fact:',
    '    mov rax, 1',
    '    cmp rdi, 1',
    '    jbe fact_done',
    '    push rdi',
    '    dec rdi',
    '    call fact ; again',
    '    pop rdi',
    '    imul rax, rdi',
    'fact_done:',
    '    ret'
])

describe.each([1000, 0])('x86 Step over and Step out with an Undo history of %i', (historySize) => {
    const { sources, lineOf } = FACTORIAL

    it('is a Step on a line that calls nothing, and has no routine to leave at the top', async () => {
        const emulator = await built(sources, historySize)
        expect(emulator.line).toBe(lineOf('mov rdi, 3'))
        expect(emulator.canStepOut).toBe(false)
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('call fact'))
        if (historySize) {
            expect(emulator.latestSteps[0].stretch).toBeUndefined()
            expect(emulator.undo()).toBe(1)
            expect(emulator.line).toBe(lineOf('mov rdi, 3'))
        }
    })

    it('runs the routine a call enters, stops on the line after it, one row and one Undo', async () => {
        const emulator = await built(sources, historySize)
        await emulator.step()
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov rbx, rax'))
        expect(cpu(emulator, 'rax')).toBe(6n)
        expect(emulator.callStack).toEqual([])
        expect(emulator.callStackDepth).toBe(0)
        if (historySize) {
            // the call, three levels of fact and their returns
            expect(emulator.latestSteps[0].stretch).toEqual({
                kind: 'over',
                library: 'fact',
                instructions: 23
            })
            expect(emulator.latestSteps[1].line).toBe(lineOf('mov rdi, 3'))
            expect(emulator.undo()).toBe(1)
            expect(emulator.line).toBe(lineOf('call fact'))
            expect(cpu(emulator, 'rax')).toBe(0n)
        } else {
            expect(emulator.canUndo).toBe(false)
        }
    })

    it('steps over a recursive call to where the same level goes on', async () => {
        const emulator = await built(sources, historySize)
        await stepTo(emulator, lineOf('call fact ; again'))
        expect(emulator.callStackDepth).toBe(1)
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        // fact(2) returned to fact(3): not the first return to this address, fact(1)'s
        expect(emulator.line).toBe(lineOf('pop rdi'))
        expect(emulator.callStackDepth).toBe(1)
        expect(cpu(emulator, 'rax')).toBe(2n)
    })

    it('steps out of the routine the program is in, as deep as it is', async () => {
        const emulator = await built(sources, historySize)
        await stepTo(emulator, lineOf('call fact ; again'))
        await emulator.step()
        await stepTo(emulator, lineOf('call fact ; again'))
        await emulator.step()
        expect(routines(emulator)).toEqual(['fact', 'fact', 'fact'])
        expect(emulator.canStepOut).toBe(true)
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('pop rdi'))
        expect(emulator.callStackDepth).toBe(2)
        expect(cpu(emulator, 'rax')).toBe(1n)
        if (historySize) {
            expect(emulator.latestSteps[0].stretch).toMatchObject({ kind: 'out', library: 'fact' })
            expect(emulator.undo()).toBe(1)
            expect(emulator.callStackDepth).toBe(3)
        }
        while ((emulator.callStackDepth ?? 0) > 0)
            expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov rbx, rax'))
        expect(cpu(emulator, 'rax')).toBe(6n)
        expect(emulator.canStepOut).toBe(false)
    })

    it('stops at a Breakpoint on the routine’s first instruction or inside it', async () => {
        const emulator = await built(sources, historySize)
        await emulator.step()
        emulator.toggleBreakpoint(lineOf('mov rax, 1'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('mov rax, 1'))
        expect(emulator.callStackDepth).toBe(1)
        emulator.toggleBreakpoint(lineOf('mov rax, 1'))
        emulator.toggleBreakpoint(lineOf('imul rax, rdi'))
        // a Step out is a Run from there, to the Breakpoint in fact(2)
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('imul rax, rdi'))
        expect(emulator.callStackDepth).toBe(2)
    })

    it('stops once, where the step ends, on a Breakpoint on the line after the call', async () => {
        const emulator = await built(sources, historySize)
        await emulator.step()
        emulator.toggleBreakpoint(lineOf('mov rbx, rax'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov rbx, rax'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov rax, 60'))
        expect(cpu(emulator, 'rbx')).toBe(6n)
    })

    it('goes on after the input a routine waits for, and ends after the call', async () => {
        const { sources, lineOf } = program([
            '    call reader',
            '    mov rbx, rax',
            '    mov rax, 60',
            '    xor rdi, rdi',
            '    syscall',
            'reader:',
            '    xor eax, eax',
            '    xor edi, edi',
            '    lea rsi, [rel buffer]',
            '    mov edx, 8',
            '    syscall',
            '    ret',
            'section .bss',
            'buffer: resb 8'
        ])
        const emulator = await built(sources, historySize)
        emulator.peripherals.terminal.useScriptedInput(['ab'])
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov rbx, rax'))
        expect(cpu(emulator, 'rax')).toBe(3n)
        expect(emulator.callStackDepth).toBe(0)
    })

    it('steps over a routine whose first instruction traps to a handler', async () => {
        const { sources, lineOf } = program([
            '    mov eax, 13',
            '    mov edi, 5',
            '    lea rsi, [rel act]',
            '    xor edx, edx',
            '    mov r10d, 8',
            '    syscall',
            '    call trapping',
            '    mov ebx, 1',
            '    mov eax, 60',
            '    xor edi, edi',
            '    syscall ; exit',
            'trapping:',
            '    int3',
            '    ret',
            'handler:',
            '    ret ; handler',
            'restorer:',
            '    mov eax, 15',
            '    syscall ; rt_sigreturn',
            'section .data',
            'act: dq handler, 0x04000000, restorer, 0'
        ])
        const emulator = await built(sources, historySize)
        await stepTo(emulator, lineOf('call trapping'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov ebx, 1'))
        expect(emulator.callStackDepth).toBe(0)
    })

    it('runs a signal handler entered on the line out, then the line', async () => {
        // kill(getpid(), SIGUSR1) queues the signal: it is delivered as the next instruction
        // begins, which the Step over of that line meets before the line runs
        const { sources, lineOf } = program([
            '    mov eax, 13',
            '    mov edi, 10',
            '    lea rsi, [rel act]',
            '    xor edx, edx',
            '    mov r10d, 8',
            '    syscall ; rt_sigaction',
            '    mov eax, 39',
            '    syscall ; getpid',
            '    mov edi, eax',
            '    mov eax, 62',
            '    mov esi, 10',
            '    syscall ; kill',
            '    inc rbx',
            '    mov eax, 60',
            '    xor edi, edi',
            '    syscall ; exit',
            'handler:',
            '    call note',
            '    ret',
            'note:',
            '    inc qword [rel count]',
            '    ret',
            'restorer:',
            '    mov eax, 15',
            '    syscall ; rt_sigreturn',
            'section .data',
            'act: dq handler, 0x04000000, restorer, 0',
            'count: dq 0'
        ])
        const emulator = await built(sources, historySize)
        await stepTo(emulator, lineOf('syscall ; kill'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('inc rbx'))
        expect(emulator.callStackDepth).toBe(0)
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mov eax, 60'))
        expect(cpu(emulator, 'rbx')).toBe(1n)
        expect(emulator.callStackDepth).toBe(0)
        const count = emulator.readMemoryBytes(emulator.resolveMemoryLabel('count')!, 8)
        expect(count[0]).toBe(1)
        if (historySize) {
            // rt_sigreturn cannot be undone, so the step is plain entries: Undo takes back the
            // line's own instruction, and stops at the signal's return
            expect(emulator.latestSteps[0].stretch).toBeUndefined()
            expect(emulator.undo()).toBe(1)
            expect(emulator.line).toBe(lineOf('inc rbx'))
            expect(cpu(emulator, 'rbx')).toBe(0n)
            expect(emulator.canUndo).toBe(false)
        }
    })
})

const fixtureBytes = (name: string) =>
    readFileSync(new URL(`../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url))

function executableSources(name = 'crackme'): BuildSources {
    const content = Buffer.from(fixtureBytes(name)).toString('base64')
    return { entry: name, files: { [name]: { encoding: 'base64', content } } }
}

async function builtExecutable() {
    const sources = executableSources()
    const emulator = await built(sources, 100_000)
    const document = emulator.listings!.session.get(sources.entry)!
    await document.ready
    const lines = document.listing!.text.split('\n')
    const lineOf = (text: string) => {
        const line = lines.findIndex((candidate) => candidate.trim() === text)
        expect(line, text).toBeGreaterThanOrEqual(0)
        return line
    }
    return { emulator, lineOf }
}

describe('x86 Step over and Step out of library calls', () => {
    it('steps over `call printf@plt` and `call strcmp@plt` to the next instruction, as a Step does', async () => {
        const { emulator, lineOf } = await builtExecutable()
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        const printf = lineOf('call printf@plt')
        await stepTo(emulator, printf)
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(printf + 1)
        // printf's first call maps its buffer, which no Undo takes back: the step is plain
        // entries, the newest of them undone one at a time
        expect(emulator.latestSteps[0].stretch?.kind).not.toBe('over')

        const strcmp = lineOf('call strcmp@plt')
        await stepTo(emulator, strcmp)
        const depth = emulator.callStackDepth
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(strcmp + 1)
        expect(emulator.callStackDepth).toBe(depth)
        expect(emulator.latestSteps[0].stretch).toMatchObject({
            kind: 'over',
            library: 'strcmp@plt'
        })
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(strcmp)
        // and a Step there ends where the Step over did
        await emulator.step()
        expect(emulator.line).toBe(strcmp + 1)
    })

    it('finishes the library call, or leaves the routine, the stop is shown at', async () => {
        const { emulator, lineOf } = await builtExecutable()
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        const printf = lineOf('call printf@plt')
        await stepTo(emulator, printf)
        // a Run that ends inside printf is shown at main's call of it
        await emulator.run(40)
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(printf)
        const shown = emulator.callStackDepth!
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(printf + 1)
        expect(emulator.callStackDepth).toBeLessThan(shown)

        const strcmp = lineOf('call strcmp@plt')
        await stepTo(emulator, strcmp)
        await emulator.run(10)
        expect(emulator.line).toBe(strcmp)
        expect(emulator.canStepOut).toBe(true)
        // the routine shown is main, not strcmp: Step out runs main to its return, and goes on
        // through libc's exit to the program's own code it calls back, as a Step does
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.stdOut).toBe('Enter password: Correct!\n')
        expect(routines(emulator)).not.toContain('main')
        expect(routines(emulator).at(-1)).toBe('__do_global_dtors_aux')
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.latestSteps[0].stretch).toMatchObject({ kind: 'out', library: 'main' })
    })
})
