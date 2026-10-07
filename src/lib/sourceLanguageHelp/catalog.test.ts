import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    compilerCapabilities,
    HOSTED_C_HEADERS,
    HOSTED_CPP_HEADERS
} from '$lib/sourceCompilation/capabilities'
import { createCatalogLoader, sourceHelpEntries } from './catalog'
import { entryDocumentation } from './documentation'
import type { HelpCatalog } from './types'
import { runtimeHelpCatalog } from '../../../scripts/source-language-help/runtimeCatalog.mjs'

describe('authoritative source help catalogs', () => {
    it('shares pending assets and recovers after a failed local load', async () => {
        const asset = { revision: 1, entries: [] }
        const read = vi
            .fn()
            .mockRejectedValueOnce(new Error('unavailable'))
            .mockResolvedValue({ default: asset })
        const load = createCatalogLoader({ test: read })
        expect(await Promise.all([load('test'), load('test')])).toEqual([undefined, undefined])
        expect(read).toHaveBeenCalledTimes(1)
        expect(await load('test')).toEqual(asset)
        expect(await load('test')).toEqual(asset)
        expect(read).toHaveBeenCalledTimes(2)
    })
    it('regenerates the committed runtime catalog deterministically without a compiler or subprocess', () => {
        const headers = JSON.parse(
            readFileSync('src/lib/sourceRuntime/generated/v1/include.json', 'utf8')
        )
        const functions = JSON.parse(
            readFileSync('src/lib/sourceRuntime/generated/v1/functions.json', 'utf8')
        )
        const expected = readFileSync(
            'src/lib/sourceLanguageHelp/generated/runtime-v1.json',
            'utf8'
        )
        expect(JSON.stringify(runtimeHelpCatalog(headers, functions)) + '\n').toBe(expected)
        expect(JSON.stringify(runtimeHelpCatalog(headers, functions)) + '\n').toBe(expected)
    })
    it('keeps capability header names in step with the actual shipped header set', () => {
        const actual = Object.keys(
            JSON.parse(readFileSync('src/lib/sourceRuntime/generated/v1/include.json', 'utf8'))
        ).sort()
        expect([...HOSTED_C_HEADERS, ...HOSTED_CPP_HEADERS].sort()).toEqual(actual)
    })
    it.each(['MIPS', 'RISC-V', 'RISC-V-64', 'X86'] as const)(
        'loads only supported functions and public entries for %s',
        async (target) => {
            const capabilities = compilerCapabilities(target)!
            const entries = await sourceHelpEntries(capabilities, 'cpp')
            expect(new Set(entries.map((entry) => entry.name)).size).toBe(entries.length)
            expect(entries.some((entry) => entry.name.startsWith('sim_'))).toBe(true)
            expect(entries.some((entry) => entry.name.startsWith('__SIM_'))).toBe(false)
            for (const entry of entries) {
                expect(
                    entry.headers.every((header) => capabilities.headers.cpp.includes(header))
                ).toBe(true)
                expect(entry.summary).not.toMatch(
                    /\$[afv]\d|\b(?:rax|rdi|rsi|rdx|rcx|r11|a[0-7]|fa[0-7])\b/
                )
                for (const parameter of entry.parameters ?? [])
                    expect(entry.declaration.slice(...parameter.range)).toBe(parameter.label)
                expect(entry.href).toMatch(/^\/documentation\//)
            }
        }
    )
    it.each([
        ['MIPS', 'mips'],
        ['RISC-V', 'risc-v'],
        ['RISC-V-64', 'risc-v'],
        ['X86', 'x86']
    ] as const)(
        'links every %s help entry to an existing Documentation entry',
        // Chapter adapters load a Core; match the documentation suite's startup timeout.
        { timeout: 60_000 },
        async (target, route) => {
            const { documentationFor, entriesOf } = await import('$lib/documentation/documentation')
            const destinations = new Set(
                entriesOf(await documentationFor(route)).map((entry) => entry.href)
            )
            for (const entry of await sourceHelpEntries(compilerCapabilities(target), 'cpp'))
                expect(destinations.has(entry.href!), `${entry.name}: ${entry.href}`).toBe(true)
        }
    )
    it('keeps qsort comparator commas together and represents variadics and void explicitly', async () => {
        const entries = await sourceHelpEntries(compilerCapabilities('MIPS'), 'c')
        expect(entries.find((entry) => entry.name === 'qsort')?.parameters).toHaveLength(4)
        expect(entries.find((entry) => entry.name === 'qsort')?.parameters?.[3].label).toContain(
            'const void *, const void *'
        )
        expect(entries.find((entry) => entry.name === 'printf')?.parameters?.[1].label).toBe('...')
        expect(entries.find((entry) => entry.name === 'sim_read_int')?.parameters).toEqual([])
    })
    it('uses actual C++ aliases, including cmath importing abs, and excludes them from C/shared headers', async () => {
        const cpp = await sourceHelpEntries(compilerCapabilities('MIPS'), 'cpp')
        expect(cpp.find((entry) => entry.name === 'std::printf')?.headers).toEqual(['cstdio'])
        expect(cpp.find((entry) => entry.name === 'std::abs')?.headers).toContain('cmath')
        expect(cpp.find((entry) => entry.name === 'printf')?.headers).toContain('stdio.h')
        expect(cpp.filter((entry) => entry.name === 'printf')).toHaveLength(1)
        for (const language of ['c', 'header'] as const)
            expect(
                (await sourceHelpEntries(compilerCapabilities('MIPS'), language)).some((entry) =>
                    entry.name.startsWith('std::')
                )
            ).toBe(false)
    })
    it('never advertises the hosted library or allocating new in x86', async () => {
        const entries = await sourceHelpEntries(compilerCapabilities('X86'), 'cpp')
        for (const name of [
            'printf',
            'std::printf',
            'malloc',
            'scanf',
            'fopen',
            'operator new',
            'new',
            'std::nothrow'
        ])
            expect(entries.some((entry) => entry.name === name)).toBe(false)
        for (const name of [
            'NULL',
            'size_t',
            'std::size_t',
            'int32_t',
            'std::int32_t',
            'va_start',
            'sim_write'
        ])
            expect(entries.some((entry) => entry.name === name)).toBe(true)
        expect(entries.some((entry) => entry.headers.includes('stdio.h'))).toBe(false)
    })
    it('keeps device and screen declarations shared with generated headers', async () => {
        for (const file of ['mips', 'riscv32', 'riscv64']) {
            const catalog = JSON.parse(
                readFileSync(`src/lib/sourceLanguageHelp/generated/${file}.json`, 'utf8')
            ) as HelpCatalog
            const header = readFileSync(`src/lib/sourceRuntime/generated/sim/${file}.h`, 'utf8')
            for (const name of [
                'sim_keyboard_ready',
                'sim_keyboard_read',
                'sim_display_ready',
                'sim_display_write',
                'sim_rgb',
                'SIM_SCREEN'
            ]) {
                const entry = catalog.entries.find((entry) => entry.name === name)!
                expect(header).toContain(entry.declaration)
                expect(entry.href).toContain('using-c#screen-and-devices')
            }
        }
    })
    it('fails closed for an unavailable ABI/revision, preserving independent simulator entries', async () => {
        const capabilities = compilerCapabilities('MIPS', 'v9')!
        const entries = await sourceHelpEntries(capabilities, 'cpp')
        expect(entries.some((entry) => entry.name === 'printf')).toBe(false)
        expect(entries.some((entry) => entry.name === 'sim_print_int')).toBe(true)
        expect(await sourceHelpEntries({ ...capabilities, catalogRevision: 99 }, 'c')).toEqual([])
    })
    it('escapes consumer descriptions and accepts only documentation links', () => {
        const text = entryDocumentation({
            name: 'test',
            kind: 'constant',
            declaration: 'test',
            summary: '<script> [run](command:evil)',
            headers: ['stdio.h'],
            href: 'command:evil'
        })
        expect(text).toContain('\\<script\\>')
        expect(text).not.toContain('[Read the documentation]')
    })
})
