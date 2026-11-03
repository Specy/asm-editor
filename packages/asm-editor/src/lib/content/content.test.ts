import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import {
    extractPlaygrounds,
    parsePlaygroundFence,
    parseTestcaseFence
} from '#lib/content/playgrounds.ts'

/**
 * The fences of the course pages, as `playgrounds.ts` reads them. The programs in them are built
 * and run by `contentSuite.ts`, from one test file per folder of `src/content`.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const CONTENT = fileURLToPath(new URL('../../content', import.meta.url))

it('runs the pages of every folder of src/content, from a test file of its own', () => {
    const folders = readdirSync(CONTENT).filter((entry) =>
        statSync(join(CONTENT, entry)).isDirectory()
    )
    expect(folders.length).toBeGreaterThan(0)
    for (const folder of folders) {
        expect(
            existsSync(join(HERE, `content.${folder}.test.ts`)),
            `src/content/${folder} has no content.${folder}.test.ts`
        ).toBe(true)
    }
})

/**
 * The Register file a fence opens its Playground on, which is the lower-case label of one of the
 * panel's tabs (`docs/design/register-files.md`). Parsed here rather than in the panel so that the
 * renderer's embed URL and the embed's own reading of it cannot drift apart.
 */
/** The cycle counter above the PC, which a Playground shows only when its fence asks for it. */
describe('the cycles fence flag', () => {
    it('shows the counter for a fence that asks for it, and for no other', () => {
        expect(parsePlaygroundFence('m68k|playground|cycles')?.settings.showCycles).toBe(true)
        expect(parsePlaygroundFence('m68k|playground|console')?.settings.showCycles).toBe(false)
    })
})

describe('the register file fence flag', () => {
    it('reads the file a fence names', () => {
        expect(parsePlaygroundFence('mips|playground|fpu')?.settings.registerFile).toBe('fpu')
        expect(parsePlaygroundFence('riscv|playground|csr')?.settings.registerFile).toBe('csr')
        expect(parsePlaygroundFence('x86|playground|x87')?.settings.registerFile).toBe('x87')
        expect(parsePlaygroundFence('m68k|playground|system')?.settings.registerFile).toBe('system')
    })

    it('leaves a fence without one on the CPU file', () => {
        const parsed = parsePlaygroundFence('m68k|playground|memory')
        expect(parsed?.settings.registerFile).toBeUndefined()
    })

    it('keeps the other flags beside it, in any order', () => {
        const parsed = parsePlaygroundFence('mips|playground|memory|fpu|console|pc')
        expect(parsed?.settings.registerFile).toBe('fpu')
        expect(parsed?.settings.showMemory).toBe(true)
        expect(parsed?.settings.showConsole).toBe(true)
        expect(parsed?.settings.showPc).toBe(true)
        expect(parsed?.settings.showRegisters).toBe(true)
    })

    it('keeps the first of several, because one panel shows one tab', () => {
        expect(parsePlaygroundFence('x86|playground|sse|x87')?.settings.registerFile).toBe('sse')
        expect(parsePlaygroundFence('x86|playground|x87|sse')?.settings.registerFile).toBe('x87')
    })

    it('ignores a flag that names no file', () => {
        expect(parsePlaygroundFence('mips|playground|mmu')?.settings.registerFile).toBeUndefined()
    })

    it('reads it case-sensitively, as it reads every other flag of a fence', () => {
        expect(parsePlaygroundFence('mips|playground|FPU')?.settings.registerFile).toBeUndefined()
        expect(parsePlaygroundFence('x86|playground|Sse')?.settings.registerFile).toBeUndefined()
    })
})

describe('the endsWithSignal testcase key', () => {
    it('declares a crash without making a Testcase', () => {
        const parsed = parseTestcaseFence('{ "endsWithSignal": "SIGSEGV" }')
        expect(parsed.endsWithSignal).toBe('SIGSEGV')
        expect(parsed.hasTestcase).toBe(false)
    })

    it('must name a signal', () => {
        expect(() => parseTestcaseFence('{ "endsWithSignal": "segfault" }')).toThrow(
            /must name a signal/
        )
    })

    it('is attached to the playground above it', () => {
        const [playground] = extractPlaygrounds(
            '```x86|playground\nud2\n```\n\n```testcase\n{ "endsWithSignal": "SIGILL" }\n```\n'
        )
        expect(playground?.endsWithSignal).toBe('SIGILL')
    })
})
