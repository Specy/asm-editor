import { describe, expect, it } from 'vitest'
import { resolveRuntimeLink } from '$lib/sourceCompilation/assemblyProfile'
import { cleanCompilationRecords, type CompilationRecord } from '$lib/sourceCompilation/records'
import { cleanProjectSettings, resolveProjectSettings } from '$lib/projectSettings'
import { normalizeBuildInput, ProjectFormatError, type BuildSources } from '$lib/projectFiles'
import { unsupportedRuntimeAbi } from '$lib/runtimeAbi'
import { runtimeLibraryHint, unresolvedSymbol, type RuntimeFunctionList } from './runtimeLibrary'
import {
    mipsCallingConvention,
    riscvCallingConvention,
    runtimeFunctionDocumentation
} from './runtimeLanguage'

const text = (content: string) => ({ encoding: 'plain' as const, content })
const fingerprint = 'a'.repeat(32)

function record(outputPath: string, extra: Partial<CompilationRecord> = {}): CompilationRecord {
    return {
        sourcePath: 'main.c',
        outputPath,
        target: 'RISC-V',
        language: 'c',
        compilerId: 'rv32-cgcc1420',
        optimization: '0',
        inputs: { 'main.c': fingerprint },
        outputFingerprint: fingerprint,
        ...extra
    }
}

describe('which Builds link the Runtime library', () => {
    const sources: BuildSources = {
        files: { 'main.c.riscv': text('main:\n'), 'manual.s': text('.include "main.c.riscv"\n') },
        entry: 'main.c.riscv'
    }

    it('links nothing by default', () => {
        expect(resolveRuntimeLink(sources, [], undefined)).toEqual({})
        expect(resolveRuntimeLink(sources, [], 'off')).toEqual({})
        expect(resolveProjectSettings('RISC-V', {}).linkRuntimeLibrary).toBe('off')
    })

    it('lets the Setting link hand-written assembly, which keeps its own start', () => {
        expect(resolveRuntimeLink(sources, [], 'v1')).toEqual({ runtimeAbi: 'v1' })
    })

    it('makes a Compilation record require its ABI and start at _start, whatever the Setting says', () => {
        const records = [record('main.c.riscv', { runtimeAbi: 'v1' })]
        expect(resolveRuntimeLink(sources, records, 'off')).toEqual({
            runtimeAbi: 'v1',
            entrySymbol: '_start'
        })
        //the requirement owns the whole include unit, as the assembler profile's does
        expect(resolveRuntimeLink({ ...sources, entry: 'manual.s' }, records, undefined)).toEqual({
            runtimeAbi: 'v1',
            entrySymbol: '_start'
        })
    })

    it('keeps records from before the Runtime library self-contained', () => {
        expect(resolveRuntimeLink(sources, [record('main.c.riscv')], undefined)).toEqual({})
    })

    it('refuses conflicting requirements and Files inside the reserved folder', () => {
        const conflicting = {
            files: {
                'a.s': text('.include "b.s"\n.include "c.s"\n'),
                'b.s': text(''),
                'c.s': text('')
            },
            entry: 'a.s'
        }
        expect(() =>
            resolveRuntimeLink(
                conflicting,
                [record('b.s', { runtimeAbi: 'v1' }), record('c.s', { runtimeAbi: 'v2' })],
                undefined
            )
        ).toThrow(/Conflicting required Runtime ABIs/)
        expect(() =>
            resolveRuntimeLink(
                { ...sources, files: { ...sources.files, '@runtime/v1/x.s': text('') } },
                [],
                'v1'
            )
        ).toThrow(/reserves/)
    })

    it('keeps an ABI this editor does not ship, so the Build can explain it', () => {
        expect(cleanProjectSettings({ linkRuntimeLibrary: 'v7' }).linkRuntimeLibrary).toBe('v7')
        expect(cleanProjectSettings({ linkRuntimeLibrary: 'latest' }).linkRuntimeLibrary).toBe(
            undefined
        )
        expect(cleanCompilationRecords([record('o.s', { runtimeAbi: 'v7' })])?.[0].runtimeAbi).toBe(
            'v7'
        )
        expect(() => cleanCompilationRecords([{ ...record('o.s'), runtimeAbi: 'x' }])).toThrow(
            ProjectFormatError
        )
        expect(unsupportedRuntimeAbi('v1')).toBeUndefined()
        expect(unsupportedRuntimeAbi('v7')).toMatch(/Link Runtime library Setting/)
        expect(unsupportedRuntimeAbi('v7', true)).toMatch(/Recompile its source/)
        expect(
            normalizeBuildInput({ ...sources, runtimeAbi: 'v1', entrySymbol: '_start' })
        ).toEqual(expect.objectContaining({ runtimeAbi: 'v1', entrySymbol: '_start' }))
        expect(() => normalizeBuildInput({ ...sources, entrySymbol: '1x' })).toThrow(
            ProjectFormatError
        )
    })
})

describe('library hints and documentation', () => {
    const list: RuntimeFunctionList = {
        abi: 'v1',
        functions: [
            {
                name: 'printf',
                header: 'stdio.h',
                prototype: 'int printf(const char *format, ...)',
                doc: 'Prints formatted text to standard output.'
            }
        ]
    }

    it('explains an undefined library function in both assembler dialects', () => {
        expect(unresolvedSymbol('Unresolved symbol: printf')).toBe('printf')
        expect(unresolvedSymbol('Symbol "printf" not found in symbol table.')).toBe('printf')
        expect(runtimeLibraryHint('Unresolved symbol: printf', list)).toMatch(
            /Link Runtime library/
        )
        expect(runtimeLibraryHint('Unresolved symbol: mine', list)).toBeUndefined()
        expect(runtimeLibraryHint('Unresolved symbol: printf', undefined)).toBeUndefined()
    })

    it('summarizes the RISC-V calling convention from the prototype', () => {
        expect(riscvCallingConvention('int printf(const char *format, ...)')).toBe(
            'format → a0; the remaining arguments → a1…a7, then the stack; returns int in a0'
        )
        expect(riscvCallingConvention('double pow(double x, double y)')).toBe(
            'x → fa0; y → fa1; returns double in fa0'
        )
        expect(riscvCallingConvention('void *memcpy(void *dest, const void *src, size_t n)')).toBe(
            'dest → a0; src → a1; n → a2; returns void * in a0'
        )
        expect(riscvCallingConvention('void exit(int status)')).toBe('status → a0; returns nothing')
        expect(riscvCallingConvention('int rand(void)')).toBe('returns int in a0')
        expect(runtimeFunctionDocumentation(list.functions[0])).toContain('call printf')
        expect(runtimeFunctionDocumentation(list.functions[0], 'MIPS')).toContain('jal printf')
    })

    it('summarizes the MIPS O32 calling convention from the prototype', () => {
        expect(mipsCallingConvention('int printf(const char *format, ...)')).toBe(
            'format → $a0; the remaining arguments → $a1…$a3, then the stack; returns int in $v0'
        )
        expect(mipsCallingConvention('double pow(double x, double y)')).toBe(
            'x → $f12; y → $f14; returns double in $f0'
        )
        expect(mipsCallingConvention('long long llabs(long long n)')).toBe(
            'n → $a0:$a1; returns long long in $v0:$v1'
        )
        expect(mipsCallingConvention('int f(int a, double b)')).toBe(
            'a → $a0; b → $a2:$a3; returns int in $v0'
        )
    })
})
