import { describe, expect, it } from 'vitest'
import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
import { appendLog, buildEntry, exitEntry, testRunEntry, type LogDraft } from './workbenchLog'

const testcase: Testcase = {
    input: [],
    expectedOutput: '',
    expectedRegisters: {},
    expectedMemory: [],
    startingMemory: [],
    startingRegisters: {}
}

describe('buildEntry', () => {
    it('reports a clean Build as a success with its Entry and time', () => {
        const entry = buildEntry({
            ok: true,
            errors: 0,
            warnings: 0,
            durationMs: 42,
            entry: 'main.s'
        })
        expect(entry).toMatchObject({
            kind: 'build',
            tone: 'success',
            text: 'Built main.s in 42ms'
        })
    })

    it('reports warnings on a Build that still succeeded', () => {
        const entry = buildEntry({ ok: true, errors: 0, warnings: 2, durationMs: 1500 })
        expect(entry).toMatchObject({ tone: 'warning', text: 'Built in 1.500s with 2 warnings' })
    })

    it('reports a failed Build with its error count', () => {
        const entry = buildEntry({ ok: false, errors: 1, warnings: 0, durationMs: 3, entry: 'a.s' })
        expect(entry).toMatchObject({
            tone: 'error',
            text: 'Build of a.s failed in 3ms with 1 error'
        })
    })
})

describe('testRunEntry', () => {
    it('lists every Testcase and summarises the run', () => {
        const results: TestcaseResult[] = [
            { passed: true, errors: [], testcase },
            {
                passed: false,
                testcase,
                errors: [
                    { type: 'wrong-register', register: 'd0', expected: 10n, got: 11n },
                    { type: 'wrong-output', expected: 'a', got: 'b' }
                ]
            }
        ]
        const entry = testRunEntry(results, 20)
        expect(entry.tone).toBe('error')
        expect(entry.text).toBe('1 of 2 testcases passed in 20ms')
        expect(entry.details).toEqual([
            { tone: 'success', text: 'Testcase 1 passed' },
            {
                tone: 'error',
                text: 'Testcase 2 failed: register d0 is 0xB, expected 0xA (and 1 more)'
            }
        ])
    })

    it('is a success only when every Testcase passed', () => {
        expect(testRunEntry([{ passed: true, errors: [], testcase }], 1).tone).toBe('success')
        expect(testRunEntry([], 1).tone).toBe('error')
    })
})

describe('exitEntry', () => {
    it('reports the running time', () => {
        expect(exitEntry({ executionTimeMs: 12, errors: [] })).toMatchObject({
            kind: 'exit',
            tone: 'info',
            text: 'Ran in 12ms'
        })
    })

    it('names the error a program stopped on', () => {
        expect(exitEntry({ executionTimeMs: -1, errors: ['Invalid access'] }).text).toBe(
            'Program ended, stopped by an error: Invalid access'
        )
    })
})

describe('appendLog', () => {
    it('drops the oldest entries past the limit', () => {
        const draft: LogDraft = { kind: 'exit', tone: 'info', text: 'x', details: [] }
        let log = appendLog([], draft, 1, 100, 2)
        log = appendLog(log, draft, 2, 101, 2)
        log = appendLog(log, draft, 3, 102, 2)
        expect(log.map((entry) => entry.id)).toEqual([2, 3])
        expect(log[1]).toMatchObject({ id: 3, time: 102, text: 'x' })
    })
})
