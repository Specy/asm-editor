import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { X86Emulator } from '#lib/languages/X86/X86Emulator.svelte.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import x86DeviceFiles from '#lib/sourceRuntime/x86DeviceFiles.ts'
import { valueOf } from '../../../../scripts/sim-header/deviceHeaders.mjs'
import type { Chapter } from '../entries'
import { deviceChapters } from './devices'
import inputProse from './input.md?raw'
import screenProse from './screen.md?raw'
import soundProse from './sound.md?raw'

/**
 * The x86 device Chapters ([x86 devices](../../../../../../docs/design/x86-devices.md), M10 of
 * [the plan](../../../../../../docs/design/x86-devices-plan.md)): their sections, their tables read
 * from the device table, and their NASM programs and the system-call Lecture's, which build with the
 * include files and run to a clean exit on the real Core.
 */

function chapter(id: string): Chapter {
    const found = deviceChapters().find((candidate) => candidate.id === id)
    if (!found) throw new Error(`No Chapter ${id}`)
    return found
}

function markdownOf(id: string): string {
    return chapter(id)
        .entries.map((entry) => (entry.view.type === 'markdown' ? entry.view.markdown : ''))
        .join('\n')
}

describe('the x86 device Chapters', () => {
    it('have a section for each device, then what differs from Linux and what is not covered', () => {
        expect(chapter('screen').entries.map((entry) => entry.anchor)).toEqual([
            'overview',
            'opening',
            'pixels',
            'double-buffering',
            'display',
            'screen-keys',
            'differences',
            'not-covered'
        ])
        expect(chapter('input').entries.map((entry) => entry.anchor)).toEqual([
            'overview',
            'keyboard',
            'finding-devices',
            'events',
            'pointer',
            'state',
            'waiting',
            'terminal',
            'differences',
            'not-covered'
        ])
        expect(chapter('sound').entries.map((entry) => entry.anchor)).toEqual([
            'overview',
            'speaker',
            'midi',
            'dsp',
            'fragments',
            'mixer',
            'differences',
            'not-covered'
        ])
    })

    it('fill every table from the device table and the Display configuration', () => {
        for (const id of ['screen', 'input', 'sound']) {
            //a placeholder left in the text is a table the Chapter forgot to fill
            expect(markdownOf(id)).not.toMatch(/\{[a-zA-Z]+\}/)
        }
        expect(markdownOf('screen')).toContain(
            `| \`FBIOPAN_DISPLAY\` | \`0x${valueOf('FBIOPAN_DISPLAY').toString(16)}\` |`
        )
        expect(markdownOf('screen')).toContain('It starts at 320 × 240.')
        expect(markdownOf('input')).toContain('| 20 | 4 | `value` |')
        expect(markdownOf('sound')).toContain(
            `| \`SNDCTL_DSP_SETFRAGMENT\` | \`0x${valueOf('SNDCTL_DSP_SETFRAGMENT').toString(16)}\` |`
        )
    })

    it('give the pointer conversion and say where the Screen keys go', () => {
        expect(markdownOf('input')).toContain('x = (value × xres + 32766) ÷ 32767')
        expect(markdownOf('screen')).toContain('never to its standard input')
        expect(markdownOf('screen')).toContain('**Shift+Tab**')
    })
})

/** The complete NASM programs of a Markdown text: its `x86` fences with an `_start`. */
function programsOf(name: string, markdown: string) {
    return [...markdown.matchAll(/```x86\n([\s\S]*?)\n```/g)]
        .map((match) => match[1])
        .filter((code) => code.includes('_start:'))
        .map((code, index) => ({ name: `${name} #${index + 1}`, code }))
}

const LECTURE = 'src/content/x86/talking-to-the-outside-world/syscall-and-the-linux-abi/index.md'
const PROGRAMS = [
    ...programsOf('The Screen', screenProse),
    ...programsOf('Keys and the pointer', inputProse),
    ...programsOf('Sound', soundProse),
    ...programsOf('the system-call Lecture', readFileSync(LECTURE, 'utf8'))
]

const plain = (content: string) => ({ encoding: 'plain' as const, content })
/** Staged beside the Entry until NASM searches the include directory (decision 16 of the plan). */
const INCLUDES = Object.fromEntries(
    Object.entries(x86DeviceFiles)
        .filter(([path]) => path.endsWith('.inc'))
        .map(([path, text]) => [path, plain(text)])
)

/**
 * A Testcase whose only expectation is a clean exit: `rdi` holds the status at the exit, and every
 * program here exits with 1 on its failure path. No key is pressed in a Testcase, and the programs
 * that wait for one wait with a timeout.
 */
const CLEAN_EXIT: Testcase = {
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: { rdi: 0n },
    startingMemory: [],
    expectedMemory: []
}

const emulators: Awaited<ReturnType<typeof X86Emulator>>[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

describe('the NASM programs of the device Chapters and the system-call Lecture', () => {
    it('are all found', () => {
        expect(PROGRAMS.map((program) => program.name)).toEqual([
            'The Screen #1',
            'Keys and the pointer #1',
            'Sound #1',
            'Sound #2',
            'Sound #3',
            'the system-call Lecture #1',
            'the system-call Lecture #2'
        ])
    })

    it.each(PROGRAMS)(
        '$name builds and exits cleanly',
        async ({ code }) => {
            const sources: BuildSources = {
                entry: 'main.asm',
                files: { 'main.asm': plain(code), ...INCLUDES }
            }
            const emulator = await X86Emulator(sources, { automaticChecking: false })
            emulators.push(emulator)
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            const [outcome] = await emulator.test(sources, [CLEAN_EXIT], 2_000_000)
            expect(outcome?.errors ?? []).toEqual([])
            expect(outcome?.passed).toBe(true)
        },
        60_000
    )
})
