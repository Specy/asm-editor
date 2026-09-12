import { describe, expect, it, vi } from 'vitest'
import { createDefaultCodingAgentTools } from './tools'
import { DEFAULT_TAKE_LINES, MAX_TAKE_LINES, type DefaultCodingAgentToolContext } from './types'
import type { Emulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'

function createMockEmulator(): Emulator {
    const breakpoints: { file: string; line: number }[] = []

    return {
        entry: 'main.s',
        currentFile: 'main.s',
        line: 0,
        pc: 0x1000n,
        sp: 0x2000n,
        canExecute: true,
        terminated: false,
        canUndo: true,
        interrupt: undefined,
        stdOut: 'hello world',
        breakpoints,
        compilerDiagnostics: [],
        compilerErrors: [],
        errors: [],
        callStack: [],
        statusRegisters: [],
        registers: [],
        latestSteps: [],
        executionTime: 0,
        systemSize: 4 as any,
        peripherals: {} as any,
        clear: vi.fn(),
        setCode: vi.fn(),
        setSources: vi.fn(),
        check: vi.fn(async () => []),
        compile: vi.fn(async () => {}),
        step: vi.fn(async () => false),
        run: vi.fn(async () => InterpreterStatus.Terminated),
        undo: vi.fn(() => 1),
        pause: vi.fn(),
        resetSelectedLine: vi.fn(),
        dispose: vi.fn(),
        test: vi.fn(async () => []),
        getLineFromAddress: vi.fn(() => 0),
        getSourceLocationFromAddress: vi.fn((addr: bigint) => ({ file: 'sub.s', line: 2 })),
        readMemoryBytes: vi.fn(() => new Uint8Array([0xaa, 0xbb])),
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

function createTestContext(
    initialFiles: Record<string, string>,
    emulator?: Emulator
): {
    context: DefaultCodingAgentToolContext
    files: Record<string, string>
} {
    const files = { ...initialFiles }
    let language = 'M68K' as const
    let activePath = Object.keys(files)[0] ?? 'main.s'
    let em = emulator ?? createMockEmulator()

    const context: DefaultCodingAgentToolContext = {
        canUpdateLanguage: true,
        canEditCode: true,
        getEditorLanguage: () => language,
        setEditorLanguage: (l) => {
            language = l as any
            em = createMockEmulator()
        },
        getEmulator: () => em,
        getFiles: () => files,
        getFile: (path) => files[path] ?? null,
        setFile: (path, code) => {
            files[path] = code
        },
        deleteFile: (path) => {
            delete files[path]
        },
        getEntryPath: () => 'main.s',
        getActivePath: () => activePath,
        setActivePath: (p) => {
            activePath = p
        }
    }

    return { context, files }
}

describe('DefaultCodingAgent Tools (Standard Agent Model)', () => {
    describe('view_file', () => {
        it('returns entry file by default with raw source lines', async () => {
            const { context } = createTestContext({
                'main.s': 'line 1\nline 2\nline 3'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.view_file.execute({})) as any

            expect(result.success).toBe(true)
            expect(result.path).toBe('main.s')
            expect(result.lineCount).toBe(3)
            expect(result.startLine).toBe(1)
            expect(result.endLine).toBe(3)
            expect(result.code).toBe('line 1\nline 2\nline 3')
            expect(result.files).toEqual(['main.s'])
        })

        it('returns a specific file when path is provided', async () => {
            const { context } = createTestContext({
                'main.s': 'main code',
                'utils.s': 'helper 1\nhelper 2'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.view_file.execute({ path: 'utils.s' })) as any

            expect(result.success).toBe(true)
            expect(result.path).toBe('utils.s')
            expect(result.lineCount).toBe(2)
            expect(result.code).toBe('helper 1\nhelper 2')
        })

        it('returns a helpful failure if file does not exist', async () => {
            const { context } = createTestContext({ 'main.s': 'code' })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.view_file.execute({ path: 'missing.s' })) as any

            expect(result.success).toBe(false)
            expect(result.error).toContain('missing.s')
            expect(result.error).toContain('Available files: main.s')
        })

        it('supports start_line and end_line bounds', async () => {
            const codeLines = Array.from({ length: 50 }, (_, i) => `instruction_${i + 1}`).join(
                '\n'
            )
            const { context } = createTestContext({ 'main.s': codeLines })
            const tools = createDefaultCodingAgentTools(context)

            // View lines 11 to 15
            const result = (await tools.view_file.execute({
                start_line: 11,
                end_line: 15
            })) as any

            expect(result.success).toBe(true)
            expect(result.startLine).toBe(11)
            expect(result.endLine).toBe(15)
            expect(result.returnedLines).toBe(5)
            expect(result.hasMore).toBe(true)
            expect(result.nextStartLine).toBe(16)
            expect(result.code).toBe(
                'instruction_11\ninstruction_12\ninstruction_13\ninstruction_14\ninstruction_15'
            )
        })

        it('clamps lines to MAX_TAKE_LINES and defaults to DEFAULT_TAKE_LINES', async () => {
            const codeLines = Array.from({ length: 250 }, (_, i) => `line_${i + 1}`).join('\n')
            const { context } = createTestContext({ 'main.s': codeLines })
            const tools = createDefaultCodingAgentTools(context)

            // Without bounds, should return DEFAULT_TAKE_LINES
            const defaultResult = (await tools.view_file.execute({})) as any
            expect(defaultResult.returnedLines).toBe(DEFAULT_TAKE_LINES)
            expect(defaultResult.startLine).toBe(1)
            expect(defaultResult.endLine).toBe(DEFAULT_TAKE_LINES)
            expect(defaultResult.hasMore).toBe(true)
            expect(defaultResult.nextStartLine).toBe(DEFAULT_TAKE_LINES + 1)

            // With large end_line, should clamp to MAX_TAKE_LINES
            const hugeResult = (await tools.view_file.execute({
                start_line: 1,
                end_line: 9999
            })) as any
            expect(hugeResult.returnedLines).toBe(MAX_TAKE_LINES)
            expect(hugeResult.endLine).toBe(MAX_TAKE_LINES)
        })

        it('does not format code with line numbers or breakpoint markers', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(1, 'main.s') // line 2 in main.s

            const { context } = createTestContext({ 'main.s': 'first\nsecond\nthird' }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.view_file.execute({ path: 'main.s' })) as any
            expect(result.code).toBe('first\nsecond\nthird')
            expect(result.code).not.toContain('|')
            expect(result.breakpoints).toBeUndefined()
        })
    })

    describe('replace_file_content', () => {
        it('replaces an exact unique snippet in a file', async () => {
            const initial = 'start:\n    move.l #1, d0\n    rts\n'
            const { context, files } = createTestContext({ 'main.s': initial })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: '    move.l #1, d0',
                replacement_content: '    move.l #42, d0'
            })) as any

            expect(result.success).toBe(true)
            expect(files['main.s']).toBe('start:\n    move.l #42, d0\n    rts\n')
            expect(result.code).toContain('move.l #42, d0')
        })

        it('fails if target_content is empty', async () => {
            const { context } = createTestContext({ 'main.s': 'some code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: '',
                replacement_content: 'replacement'
            })) as any

            expect(result.success).toBe(false)
            expect(result.error).toContain('cannot be empty')
        })

        it('fails if target_content is not found', async () => {
            const { context } = createTestContext({ 'main.s': 'line 1\nline 2' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: 'nonexistent snippet',
                replacement_content: 'new snippet'
            })) as any

            expect(result.success).toBe(false)
            expect(result.error).toContain('was not found')
        })

        it('fails if target_content matches multiple times without bounds', async () => {
            const initial = 'nop\nnop\nnop'
            const { context } = createTestContext({ 'main.s': initial })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: 'nop',
                replacement_content: 'rts'
            })) as any

            expect(result.success).toBe(false)
            expect(result.error).toContain('matches 3 times')
        })

        it('disambiguates multiple matches using start_line and end_line bounds', async () => {
            const initial = 'label1:\n    nop\nlabel2:\n    nop'
            const { context, files } = createTestContext({ 'main.s': initial })
            const tools = createDefaultCodingAgentTools(context)

            // Restrict search to lines 3-4 (targeting the second nop)
            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: '    nop',
                replacement_content: '    rts',
                start_line: 3,
                end_line: 4
            })) as any

            expect(result.success).toBe(true)
            expect(files['main.s']).toBe('label1:\n    nop\nlabel2:\n    rts')
        })

        it('fails when targeting a file that does not exist and suggests write_to_file', async () => {
            const { context } = createTestContext({ 'main.s': 'code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'missing.s',
                target_content: 'old',
                replacement_content: 'new'
            })) as any

            expect(result.success).toBe(false)
            expect(result.error).toContain('does not exist')
            expect(result.error).toContain('write_to_file')
        })

        it('reports compile_error when code has syntax errors', async () => {
            const emulator = createMockEmulator()
            emulator.check = vi.fn(async () => ['Syntax error on line 2'] as any)

            const { context } = createTestContext({ 'main.s': 'line 1\nline 2' }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: 'line 2',
                replacement_content: 'bad instruction syntax'
            })) as any

            expect(result.success).toBe(false)
            expect(result.errorKind).toBe('compile_error')
            expect(result.details.errors).toContain('Syntax error on line 2')
        })
    })

    describe('write_to_file', () => {
        it('overwrites an existing file completely', async () => {
            const { context, files } = createTestContext({ 'main.s': 'old code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.write_to_file.execute({
                path: 'main.s',
                code: 'new complete code\nline 2'
            })) as any

            expect(result.success).toBe(true)
            expect(files['main.s']).toBe('new complete code\nline 2')
            expect(result.lineCount).toBe(2)
        })

        it('creates a new file in the project', async () => {
            const { context, files } = createTestContext({ 'main.s': 'main code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.write_to_file.execute({
                path: 'helper.s',
                code: 'helper:\n    rts'
            })) as any

            expect(result.success).toBe(true)
            expect(files['helper.s']).toBe('helper:\n    rts')
            expect(result.files).toContain('helper.s')
        })

        it('updates editor language if requested and allowed', async () => {
            const { context } = createTestContext({ 'main.s': 'old' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.write_to_file.execute({
                path: 'main.asm',
                code: 'li $v0, 10\nsyscall',
                language: 'MIPS'
            })) as any

            expect(result.success).toBe(true)
            expect(context.getEditorLanguage()).toBe('MIPS')
        })
    })

    describe('list_files', () => {
        it('lists all files in the project with metadata', async () => {
            const { context } = createTestContext({
                'main.s': 'move.l #1, d0\nrts',
                'sub.s': 'rts'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.list_files.execute({})) as any

            expect(result.success).toBe(true)
            expect(result.entry).toBe('main.s')
            expect(result.files).toHaveLength(2)

            const mainEntry = result.files.find((f: any) => f.path === 'main.s')
            expect(mainEntry.isEntry).toBe(true)
            expect(mainEntry.lineCount).toBe(2)

            const subEntry = result.files.find((f: any) => f.path === 'sub.s')
            expect(subEntry.isEntry).toBe(false)
            expect(subEntry.lineCount).toBe(1)
        })
    })

    describe('delete_file', () => {
        it('deletes a non-entry file', async () => {
            const { context, files } = createTestContext({
                'main.s': 'code',
                'temp.s': 'temp'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.delete_file.execute({ path: 'temp.s' })) as any

            expect(result.success).toBe(true)
            expect(result.deleted).toBe('temp.s')
            expect(files['temp.s']).toBeUndefined()
        })

        it('refuses to delete the sole entry file', async () => {
            const { context } = createTestContext({ 'main.s': 'code' })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.delete_file.execute({ path: 'main.s' })) as any

            expect(result.success).toBe(false)
            expect(result.error).toContain('sole entry file')
        })
    })

    describe('update_breakpoints', () => {
        it('updates breakpoints on a specified file', async () => {
            const emulator = createMockEmulator()
            const { context } = createTestContext(
                { 'main.s': 'line 1\nline 2', 'sub.s': 'line 1\nline 2\nline 3' },
                emulator
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.update_breakpoints.execute({
                path: 'sub.s',
                add: [2]
            })) as any

            expect(result.success).toBe(true)
            expect(emulator.toggleBreakpoint).toHaveBeenCalledWith(1, 'sub.s')
            expect(result.path).toBe('sub.s')
            expect(result.added).toEqual([2])
        })
    })

    describe('get_line_from_address', () => {
        it('resolves source file and line from address', async () => {
            const emulator = createMockEmulator()
            const { context } = createTestContext(
                { 'main.s': 'line 1', 'sub.s': 'line 1\nline 2\ntarget line' },
                emulator
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.get_line_from_address.execute({
                address: '0x1000'
            })) as any

            expect(result.success).toBe(true)
            expect(result.file).toBe('sub.s')
            expect(result.lineNumber).toBe(3)
            expect(result.line).toContain('target line')
        })
    })

    describe('list_breakpoints', () => {
        it('lists breakpoints with surrounding code and explicit breakpoint markers', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(1, 'main.s') // line 2 in main.s (0-indexed line 1)
            emulator.toggleBreakpoint(3, 'main.s') // line 4 in main.s (0-indexed line 3)

            const content = [
                'line 1',
                'line 2',
                'line 3',
                'line 4',
                'line 5',
                'line 6',
                'line 7'
            ].join('\n')

            const { context } = createTestContext({ 'main.s': content }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.list_breakpoints.execute({})) as any

            expect(result.success).toBe(true)
            expect(result.count).toBe(2)
            expect(result.breakpoints).toHaveLength(2)

            const bp1 = result.breakpoints[0]
            expect(bp1.file).toBe('main.s')
            expect(bp1.line).toBe(2)
            expect(bp1.snippet).toContain('=>    2 | line 2  <-- [BREAKPOINT]')
            expect(bp1.snippet).toContain('      1 | line 1')
            expect(bp1.snippet).toContain('      3 | line 3')
            expect(bp1.context).toEqual([
                { line: 1, text: 'line 1', isBreakpoint: false },
                { line: 2, text: 'line 2', isBreakpoint: true },
                { line: 3, text: 'line 3', isBreakpoint: false },
                { line: 4, text: 'line 4', isBreakpoint: false },
                { line: 5, text: 'line 5', isBreakpoint: false }
            ])

            const bp2 = result.breakpoints[1]
            expect(bp2.file).toBe('main.s')
            expect(bp2.line).toBe(4)
            expect(bp2.snippet).toContain('=>    4 | line 4  <-- [BREAKPOINT]')
        })

        it('filters breakpoints by path', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(0, 'main.s') // line 1 in main.s
            emulator.toggleBreakpoint(1, 'sub.s') // line 2 in sub.s

            const { context } = createTestContext(
                { 'main.s': 'main line 1', 'sub.s': 'sub line 1\nsub line 2' },
                emulator
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.list_breakpoints.execute({ path: 'sub.s' })) as any
            expect(result.success).toBe(true)
            expect(result.count).toBe(1)
            expect(result.breakpoints[0].file).toBe('sub.s')
            expect(result.breakpoints[0].line).toBe(2)
        })

        it('returns empty list when no breakpoints are set', async () => {
            const { context } = createTestContext({ 'main.s': 'line 1' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.list_breakpoints.execute({})) as any
            expect(result.success).toBe(true)
            expect(result.count).toBe(0)
            expect(result.breakpoints).toEqual([])
        })
    })
})
