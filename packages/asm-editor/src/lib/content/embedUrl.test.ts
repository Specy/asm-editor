import lzstring from 'lz-string'
import { describe, expect, it } from 'vite-plus/test'
import type { Testcase } from '#lib/Project.svelte.ts'
import { serializer } from '#lib/json.ts'
import { embedQuery, readEmbedSettings, readEmbedTestcases, type EmbedSettings } from './embedUrl'

/**
 * The embed's address. Other sites frame the links the site has handed out, so a page writes the
 * query it always wrote, byte for byte, and the embed reads a hand-written link as it always did.
 */

const settings: EmbedSettings = {
    language: 'MIPS',
    showMemory: true,
    showConsole: false,
    showTests: false,
    showPc: true,
    showRegisters: true,
    showFlags: false,
    showCycles: false,
    showScreen: true,
    openScreen: false,
    hideUntilBuilt: true,
    openButton: true,
    registerFile: 'fpu'
}

const testcase: Testcase = {
    input: [],
    expectedOutput: '1',
    startingRegisters: { t0: 1n },
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
}

describe('the embed URL', () => {
    it('writes its parameters in the order the site has always written them', () => {
        const code = 'li $t0, 1'
        const tests = lzstring.compressToEncodedURIComponent(serializer.stringify([testcase]))
        const source = lzstring.compressToEncodedURIComponent(code)
        expect(embedQuery(settings, { code, testcases: [testcase] })).toBe(
            'language=MIPS&showMemory=true&showTests=false&showPc=true&showRegisters=true&' +
                'showFlags=false&showScreen=true&hideUntilBuilt=true&openButton=true&' +
                `registerFile=fpu&testcases=${tests}&code=${source}`
        )
    })

    it('reads back the settings and the Testcases it writes', () => {
        const opposite: EmbedSettings = {
            language: 'Z80',
            showMemory: false,
            showConsole: true,
            showTests: true,
            showPc: false,
            showRegisters: false,
            showFlags: true,
            showCycles: true,
            showScreen: false,
            openScreen: false,
            hideUntilBuilt: false,
            openButton: false
        }
        for (const written of [settings, opposite]) {
            const params = new URLSearchParams(
                embedQuery(written, { code: '', testcases: [testcase] })
            )
            expect(readEmbedSettings(params)).toEqual(written)
            expect(readEmbedTestcases(params)).toEqual([testcase])
        }
    })

    it('gives a link written by hand the defaults it always had', () => {
        const params = new URLSearchParams('language=riscv&openScreen=true&registerFile=%20SSE')
        expect(readEmbedSettings(params)).toEqual({
            language: 'RISC-V',
            showMemory: false,
            showConsole: false,
            showTests: true,
            showPc: false,
            showRegisters: true,
            showFlags: false,
            showCycles: false,
            showScreen: true,
            openScreen: true,
            hideUntilBuilt: false,
            openButton: false,
            registerFile: 'sse'
        })
        expect(readEmbedSettings(new URLSearchParams('language=fortran')).language).toBe('M68K')
    })

    //the cycle counter is asked for, and a link that does not ask leaves it out
    it('writes the cycle counter only when it is asked for, after the flags', () => {
        const query = embedQuery({ ...settings, showCycles: true }, { code: '', testcases: [] })
        expect(query).toContain('&showFlags=false&showCycles=true&showScreen=true&')
        expect(embedQuery(settings, { code: '', testcases: [] })).not.toContain('showCycles')
    })
})
