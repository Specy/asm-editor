import { describe, expect, it, vi } from 'vitest'
import { AssemblyCodingHarness } from './harness'
import type { Emulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'

interface ToolExecutionResult {
    success?: boolean
    error?: string
    errorKind?: string
    path?: string
    file?: string
    line?: number
    lineCount?: number
    startLine?: number
    endLine?: number
    returnedLines?: number
    hasMore?: boolean
    nextStartLine?: number | null
    code?: string
    files?: Array<{ path: string; isEntry?: boolean }>
    count?: number
    breakpoints?: Array<{
        file: string
        line: number
        isOutOfBounds?: boolean
        snippet: string
        context: Array<{ line: number; text: string; isBreakpoint: boolean }>
    }>
    snippet?: string
    context?: Array<{ line: number; text: string; isBreakpoint: boolean }>
    alreadySet?: boolean
    removed?: boolean
    removedCount?: number
    totalBreakpoints?: number
    added?: number[]
    deleted?: string
    address?: string
    lineNumber?: number
    stepsRequested?: number
    [key: string]: unknown
}

function createMockEmulator(_initialCode = ''): Emulator {
    let line = 0
    let pc = 0x1000n
    const sp = 0x2000n
    let canExecute = true
    const terminated = false
    const breakpoints: { file: string; line: number }[] = []

    return {
        entry: 'main.s',
        currentFile: 'main.s',
        line,
        pc,
        sp,
        canExecute,
        terminated,
        canUndo: false,
        interrupt: undefined,
        stdOut: '',
        breakpoints,
        compilerDiagnostics: [],
        compilerErrors: [],
        errors: [],
        callStack: [],
        statusRegisters: [],
        registers: [],
        latestSteps: [],
        executionTime: 0,
        systemSize: 4 as Emulator['systemSize'],
        peripherals: {} as Emulator['peripherals'],
        clear: vi.fn(() => {
            breakpoints.length = 0
        }),
        setCode: vi.fn((_newCode: string) => {}),
        setSources: vi.fn((_newSources: unknown) => {}),
        check: vi.fn(async () => []),
        compile: vi.fn(async () => {
            canExecute = true
        }),
        step: vi.fn(async () => {
            line++
            pc += 4n
            return false
        }),
        run: vi.fn(async () => InterpreterStatus.Terminated),
        undo: vi.fn(() => 1),
        pause: vi.fn(),
        resetSelectedLine: vi.fn(),
        dispose: vi.fn(),
        test: vi.fn(async () => []),
        getLineFromAddress: vi.fn(() => 0),
        getSourceLocationFromAddress: vi.fn((_addr: bigint) => ({ file: 'main.s', line: 0 })),
        readMemoryBytes: vi.fn(() => new Uint8Array([0x12, 0x34])),
        setGlobalMemoryAddress: vi.fn(),
        setTabMemoryAddress: vi.fn(),
        setScreenHistoryBudgetMb: vi.fn(),
        setFileSystemHistoryBudgetMb: vi.fn(),
        toggleBreakpoint: vi.fn((bLine: number, file = 'main.s') => {
            const idx = breakpoints.findIndex((b) => b.file === file && b.line === bLine)
            if (idx >= 0) {
                breakpoints.splice(idx, 1)
            } else {
                breakpoints.push({ file, line: bLine })
            }
        })
    } as unknown as Emulator
}

describe('AssemblyCodingHarness', () => {
    it('initializes with multiple files', () => {
        const harness = new AssemblyCodingHarness({
            language: 'M68K',
            entry: 'main.s',
            files: {
                'main.s': 'move.l #1, d0\njsr helper',
                'helper.s': 'helper:\nmove.l #2, d1\nrts'
            }
        })

        expect(harness.getLanguage()).toBe('M68K')
        expect(harness.getEntry()).toBe('main.s')
        expect(harness.getFile('main.s')).toBe('move.l #1, d0\njsr helper')
        expect(harness.getFile('helper.s')).toBe('helper:\nmove.l #2, d1\nrts')

        const fileList = harness.listFiles()
        expect(fileList).toHaveLength(2)
        expect(fileList.find((f) => f.path === 'main.s')?.isEntry).toBe(true)
        expect(fileList.find((f) => f.path === 'helper.s')?.isEntry).toBe(false)
    })

    it('creates, modifies, and deletes files', () => {
        const harness = new AssemblyCodingHarness({
            language: 'MIPS',
            entry: 'main.asm',
            files: { 'main.asm': 'li $v0, 10\nsyscall' }
        })

        // Create new file
        harness.setFile('math.asm', 'add $t0, $t1, $t2')
        expect(harness.getFile('math.asm')).toBe('add $t0, $t1, $t2')
        expect(harness.listFiles()).toHaveLength(2)

        // Modify file
        harness.setFile('math.asm', 'sub $t0, $t1, $t2')
        expect(harness.getFile('math.asm')).toBe('sub $t0, $t1, $t2')

        // Delete file
        const deleted = harness.deleteFile('math.asm')
        expect(deleted).toBe(true)
        expect(harness.getFile('math.asm')).toBeNull()
        expect(harness.listFiles()).toHaveLength(1)
    })

    it('synchronizes sources with emulator on changes', () => {
        const mockEmulator = createMockEmulator('nop')
        const harness = new AssemblyCodingHarness({
            language: 'M68K',
            entry: 'main.s',
            emulator: mockEmulator,
            files: { 'main.s': 'nop' }
        })

        harness.setFile('extra.s', 'rts')
        expect(mockEmulator.setSources).toHaveBeenCalledWith(
            expect.objectContaining({
                entry: 'main.s',
                files: expect.objectContaining({
                    'main.s': { encoding: 'plain', content: 'nop' },
                    'extra.s': { encoding: 'plain', content: 'rts' }
                })
            })
        )
    })

    it('executes tools through the harness', async () => {
        const mockEmulator = createMockEmulator('line 1\nline 2\nline 3')
        const harness = new AssemblyCodingHarness({
            language: 'M68K',
            entry: 'main.s',
            emulator: mockEmulator,
            files: { 'main.s': 'line 1\nline 2\nline 3' }
        })

        // view_file
        const viewResult = (await harness.executeTool('view_file', {
            path: 'main.s',
            start_line: 2,
            end_line: 3
        })) as unknown as ToolExecutionResult

        expect(viewResult.success).toBe(true)
        expect(viewResult.startLine).toBe(2)
        expect(viewResult.endLine).toBe(3)
        expect(viewResult.returnedLines).toBe(2)
        expect(viewResult.code).toBe('line 2\nline 3')

        // replace_file_content
        const replaceResult = (await harness.executeTool('replace_file_content', {
            path: 'main.s',
            target_content: 'line 2',
            replacement_content: 'modified line 2'
        })) as unknown as ToolExecutionResult
        expect(replaceResult.success).toBe(true)
        expect(harness.getFile('main.s')).toBe('line 1\nmodified line 2\nline 3')

        // write_to_file
        const writeResult = (await harness.executeTool('write_to_file', {
            path: 'new_module.s',
            code: 'module_entry:\n    rts'
        })) as unknown as ToolExecutionResult
        expect(writeResult.success).toBe(true)
        expect(harness.getFile('new_module.s')).toBe('module_entry:\n    rts')

        // list_files
        const listResult = (await harness.executeTool(
            'list_files',
            {}
        )) as unknown as ToolExecutionResult
        expect(listResult.success).toBe(true)
        expect(listResult.files).toHaveLength(2)
        expect(listResult.files?.map((f) => f.path)).toContain('main.s')
        expect(listResult.files?.map((f) => f.path)).toContain('new_module.s')

        // list_breakpoints
        mockEmulator.toggleBreakpoint(1, 'main.s')
        const bpResult = (await harness.executeTool(
            'list_breakpoints',
            {}
        )) as unknown as ToolExecutionResult
        expect(bpResult.success).toBe(true)
        expect(bpResult.count).toBe(1)
        expect(bpResult.breakpoints?.[0]?.line).toBe(2)
        expect(bpResult.breakpoints?.[0]?.snippet).toContain(
            '=>    2 | modified line 2  <-- [BREAKPOINT]'
        )

        // set_breakpoint by instruction
        const setBpResult = (await harness.executeTool('set_breakpoint', {
            path: 'main.s',
            instruction: 'line 3'
        })) as unknown as ToolExecutionResult
        expect(setBpResult.success).toBe(true)
        expect(setBpResult.line).toBe(3)
        expect(setBpResult.snippet).toContain('=>    3 | line 3  <-- [BREAKPOINT]')

        // remove_breakpoint by instruction
        const remBpResult = (await harness.executeTool('remove_breakpoint', {
            path: 'main.s',
            instruction: 'line 3'
        })) as unknown as ToolExecutionResult
        expect(remBpResult.success).toBe(true)
        expect(remBpResult.removed).toBe(true)
    })
})
