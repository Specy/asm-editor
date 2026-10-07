import { afterEach, describe, expect, it, vi } from 'vitest'
import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import { ProjectLanguageSession } from '$lib/languages/service/ProjectLanguageSession'
import { normalizeBuildInput } from '$lib/projectFiles'
import { compilerCapabilities } from '$lib/sourceCompilation/capabilities'
import { setSourceHelpLanguage } from './context'
import * as catalog from './catalog'
import { languageEntries } from './languageEntries'
import { registerSourceLanguageHelp, SOURCE_HELP_SCAN_LIMIT } from './register'

vi.mock('$lib/languages/service/LanguageWorkerManager', () => ({
    languageWorkerManager: { acquire: () => undefined }
}))
let nextSession = 0
const cleanup: (() => void)[] = []
afterEach(() => {
    cleanup.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function harness(
    text: string,
    path = 'main.c',
    target: 'MIPS' | 'RISC-V' | 'RISC-V-64' | 'X86' | 'M68K' = 'MIPS'
) {
    const sessionId = `source-test-${++nextSession}`
    const initial = normalizeBuildInput({
        entry: path,
        files: { [path]: { encoding: 'plain', content: text } }
    })
    const session = new ProjectLanguageSession(sessionId, initial, target)
    cleanup.push(() => session.dispose())
    let version = 1,
        disposed = false
    const disposal = new Set<() => void>()
    const model = {
        uri: { scheme: 'asm-editor', authority: sessionId, path: `/live/${path}` },
        getValue: () => text,
        getValueInRange(range: monaco.IRange) {
            return text.slice(
                model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn }),
                model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn })
            )
        },
        getVersionId: () => version,
        isDisposed: () => disposed,
        getOffsetAt(position: monaco.IPosition) {
            return (
                text
                    .split('\n')
                    .slice(0, position.lineNumber - 1)
                    .reduce((sum, line) => sum + line.length + 1, 0) +
                position.column -
                1
            )
        },
        getPositionAt(offset: number) {
            const lines = text.slice(0, offset).split('\n')
            return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 }
        },
        onWillDispose(listener: () => void) {
            disposal.add(listener)
            return { dispose: () => disposal.delete(listener) }
        }
    } as unknown as monaco.editor.ITextModel
    const providers: {
        completion?: monaco.languages.CompletionItemProvider
        hover?: monaco.languages.HoverProvider
        signature?: monaco.languages.SignatureHelpProvider
    } = {}
    const registrations: { dispose: ReturnType<typeof vi.fn> }[] = []
    const installed: string[] = []
    const record = (language: string, key: keyof typeof providers, provider: unknown) => {
        Object.assign(providers, { [key]: provider })
        installed.push(`${language}:${key}`)
        const registration = { dispose: vi.fn() }
        registrations.push(registration)
        return registration
    }
    const currentMonaco = {
        languages: {
            CompletionItemKind: {
                Function: 1,
                TypeParameter: 2,
                Constant: 3,
                Variable: 4,
                File: 5,
                Keyword: 6,
                Snippet: 7
            },
            CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
            registerCompletionItemProvider: (language: string, provider: unknown) =>
                record(language, 'completion', provider),
            registerHoverProvider: (language: string, provider: unknown) =>
                record(language, 'hover', provider),
            registerSignatureHelpProvider: (language: string, provider: unknown) =>
                record(language, 'signature', provider)
        }
    } as unknown as MonacoType
    const owned = registerSourceLanguageHelp(currentMonaco)
    const dispose = () => owned.forEach((registration) => registration.dispose())
    cleanup.push(dispose)
    const token = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} })
    } as monaco.CancellationToken
    const position = (offset = text.length) => model.getPositionAt(offset)
    const complete = (offset = text.length) =>
        providers.completion!.provideCompletionItems(
            model,
            position(offset),
            { triggerKind: 0 },
            token
        )
    const hover = (offset = text.length) =>
        providers.hover!.provideHover(model, position(offset), token)
    const signature = (offset = text.length) =>
        providers.signature!.provideSignatureHelp(model, position(offset), token, {
            triggerKind: 1,
            isRetrigger: false
        })
    return {
        model,
        session,
        providers,
        currentMonaco,
        installed,
        registrations,
        token,
        complete,
        hover,
        signature,
        dispose,
        edit(value: string) {
            text = value
            version++
        },
        watchCount: () => disposal.size,
        disposeModel() {
            disposed = true
            disposal.forEach((listener) => listener())
        }
    }
}

describe('C/C++ Monaco help providers', () => {
    it('registers completion, hover and hints once for each C/C++ selector and disposes them', () => {
        const h = harness('')
        expect(h.installed).toEqual([
            'c:completion',
            'c:hover',
            'c:signature',
            'cpp:completion',
            'cpp:hover',
            'cpp:signature'
        ])
        h.dispose()
        expect(
            h.registrations.every((registration) => registration.dispose.mock.calls.length === 1)
        ).toBe(true)
    })
    it('disposes a partial installation if the next provider cannot register', () => {
        const dispose = vi.fn()
        const currentMonaco = {
            languages: {
                registerCompletionItemProvider: () => ({ dispose }),
                registerHoverProvider: () => {
                    throw new Error('hover failed')
                }
            }
        } as unknown as MonacoType
        expect(() => registerSourceLanguageHelp(currentMonaco)).toThrow('hover failed')
        expect(dispose).toHaveBeenCalledTimes(1)
    })
    it('shows function dependencies and inserts just a name with the exact replacement range', async () => {
        const h = harness('pri')
        const result = await h.complete()
        const item = result!.suggestions.find((item) => item.label === 'printf')!
        expect(item.insertText).toBe('printf')
        expect(item.detail).toContain('<stdio.h>')
        expect(item.additionalTextEdits).toBeUndefined()
        expect(item.range).toEqual({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 4
        })
    })
    it('replaces only the name after std:: and keeps its C++ header distinct', async () => {
        const h = harness('std::pri', 'main.cpp')
        const item = (await h.complete())!.suggestions.find((item) => item.label === 'std::printf')!
        expect(item.insertText).toBe('printf')
        expect(item.detail).toContain('<cstdio>')
        expect(item.range).toMatchObject({ startColumn: 6, endColumn: 9 })
        expect((await harness('std::pri').complete())?.suggestions).toBeUndefined()
    })
    it('offers C++ keywords only in C++ files, keeping shared .h neutral', async () => {
        expect(
            (await harness('cl', 'main.c').complete())!.suggestions.some(
                (item) => item.label === 'class'
            )
        ).toBe(false)
        expect(
            (await harness('cl', 'main.cpp').complete())!.suggestions.some(
                (item) => item.label === 'class'
            )
        ).toBe(true)
        expect(
            (await harness('cl', 'common.h').complete())!.suggestions.some(
                (item) => item.label === 'class'
            )
        ).toBe(false)
        expect(
            (await harness('cl', 'common.hpp').complete())!.suggestions.some(
                (item) => item.label === 'class'
            )
        ).toBe(true)
    })
    it('keeps standard-library APIs out of x86 and device helpers out of unsupported Targets', async () => {
        expect(
            (await harness('pri', 'main.c', 'X86').complete())!.suggestions.some(
                (item) => item.label === 'printf'
            )
        ).toBe(false)
        expect(
            (await harness('sim_', 'main.c', 'X86').complete())!.suggestions.some(
                (item) => item.label === 'sim_write'
            )
        ).toBe(true)
        expect((await harness('sim_', 'main.c', 'M68K').complete())!.suggestions).toEqual([])
        expect(
            languageEntries('cpp', 'X86').some(
                (entry) => entry.name === 'new' || entry.name === 'delete'
            )
        ).toBe(false)
    })
    it('serves basic standalone help without fabricating a Target', async () => {
        const h = harness('fo')
        Object.assign(h.model, { uri: { scheme: 'inmemory', authority: '', path: '/one' } })
        setSourceHelpLanguage(h.model, 'c')
        const result = await h.complete()
        expect(result!.suggestions.some((item) => item.label === 'for loop')).toBe(true)
        expect(result!.suggestions.some((item) => item.label === 'fopen')).toBe(false)
    })
    it('offers actual shipped angle headers with language and Target filtering', async () => {
        expect(
            (await harness('#include <std', 'main.c').complete())!.suggestions.some(
                (item) => item.label === 'stdio.h'
            )
        ).toBe(true)
        expect(
            (await harness('#include <std', 'main.c', 'X86').complete())!.suggestions.some(
                (item) => item.label === 'stdio.h'
            )
        ).toBe(false)
        expect(
            (await harness('#include <c', 'main.cpp').complete())!.suggestions.some(
                (item) => item.label === 'cstdio'
            )
        ).toBe(true)
        expect(
            (await harness('#include <c', 'main.c').complete())!.suggestions.some(
                (item) => item.label === 'cstdio'
            )
        ).toBe(false)
    })
    it('honors quoted source-directory precedence, binary filtering and Build header snapshots', async () => {
        const h = harness('#include "lo', 'src/main.c')
        const files = {
            ...h.session.sources.files,
            'src/local.h': { encoding: 'plain' as const, content: 'near' },
            'local.h': { encoding: 'plain' as const, content: 'root' },
            'local.inc': { encoding: 'plain' as const, content: 'inc' },
            'local.hpp': { encoding: 'base64' as const, content: '' }
        }
        h.session.update({ entry: 'src/main.c', files })
        h.session.setBuild(4, h.session.sources)
        const result = await h.complete()
        expect(result!.suggestions.find((item) => item.label === 'local.h')?.detail).toBe(
            'Project header: src/local.h'
        )
        expect(result!.suggestions.some((item) => item.label === 'local.hpp')).toBe(false)
        h.session.update({
            entry: 'src/main.c',
            files: h.session.sources.files['src/main.c']
                ? { 'src/main.c': h.session.sources.files['src/main.c'] }
                : {}
        })
        Object.assign(h.model.uri, { path: '/build-4/src/main.c' })
        expect((await h.complete())!.suggestions.some((item) => item.label === 'local.h')).toBe(
            true
        )
    })
    it.each([
        ['./lo', './local.h', 'src/local.h'],
        ['../lo', '../local.h', 'local.h'],
        ['../../lo', undefined, undefined]
    ])(
        'resolves explicit relative include paths %s without escaping the Project',
        async (prefix, name, path) => {
            const h = harness(`#include "${prefix}`, 'src/main.c')
            h.session.update({
                entry: 'src/main.c',
                files: {
                    ...h.session.sources.files,
                    'src/local.h': { encoding: 'plain', content: '' },
                    'local.h': { encoding: 'plain', content: '' }
                }
            })
            const result = (await h.complete())!.suggestions
            if (name)
                expect(result.find((item) => item.label === name)?.detail).toBe(
                    `Project header: ${path}`
                )
            else expect(result).toEqual([])
        }
    )
    it.each(['// printf', 'R"x(printf', 'obj.printf', 'other::printf'])(
        'suppresses misleading help in %s',
        async (text) => {
            const h = harness(text)
            expect(await h.complete()).toBeUndefined()
            expect(await h.hover()).toBeUndefined()
        }
    )
    it('shows a consumer hover and documentation link without register placement', async () => {
        const h = harness('sim_print_int')
        const result = await h.hover()
        const text = (result!.contents[0] as monaco.IMarkdownString).value
        expect(text).toContain('void sim_print_int(int value)')
        expect(text).toContain('<sim.h>')
        expect(text).toContain('/documentation/mips/syscall#service-1')
        expect(text).not.toMatch(/\$a0|register|syscall\s*:/)
        expect(result!.range).toMatchObject({ startColumn: 1, endColumn: 14 })
    })
    it('keeps qsort parameter offsets accurate and later printf arguments on the variadic slot', async () => {
        const h = harness('qsort(values, 4, sizeof(int), compare')
        const result = await h.signature()
        expect(result!.value.activeParameter).toBe(3)
        expect(result!.value.signatures[0].parameters).toHaveLength(4)
        const parameter = result!.value.signatures[0].parameters[3].label as [number, number]
        expect(result!.value.signatures[0].label.slice(...parameter)).toContain(
            'const void *, const void *'
        )
        expect(
            (await harness('printf("%d %d", first, second, third').signature())!.value
                .activeParameter
        ).toBe(1)
        expect(
            (await harness('sim_read_int(').signature())!.value.signatures[0].parameters
        ).toEqual([])
        expect(await harness('sim_print_int(1, ').signature()).toBeUndefined()
    })
    it('uses Monaco snippet tab stops without auto-includes or unsupported allocations', async () => {
        const h = harness('fo')
        const snippet = (await h.complete())!.suggestions.find((item) => item.label === 'for loop')!
        expect(snippet.insertText).toContain('${1:i}')
        expect(snippet.insertText).toContain('$0')
        expect(snippet.insertTextRules).toBe(4)
        expect(snippet.additionalTextEdits).toBeUndefined()
    })
    it.each(['edit', 'model', 'session', 'registration', 'cancel'] as const)(
        'discards a pending catalog response after %s',
        async (change) => {
            const entries = await catalog.sourceHelpEntries(compilerCapabilities('MIPS'), 'c')
            let resolve: (value: typeof entries) => void = () => {}
            const deferred = new Promise<typeof entries>((done) => {
                resolve = done
            })
            vi.spyOn(catalog, 'sourceHelpEntries').mockReturnValueOnce(deferred)
            const h = harness('pri')
            const request = h.complete()
            if (change === 'edit') h.edit('changed')
            if (change === 'model') h.disposeModel()
            if (change === 'session') h.session.dispose()
            if (change === 'registration') h.dispose()
            if (change === 'cancel') Object.assign(h.token, { isCancellationRequested: true })
            resolve(entries)
            expect(await request).toBeUndefined()
        }
    )
    it('serves suggestions, hover and hints without contacting a compiler or changing markers', async () => {
        const fetch = vi.fn(() => {
            throw new Error('unexpected request')
        })
        vi.stubGlobal('fetch', fetch)
        const h = harness('printf(')
        await h.complete(3)
        await h.hover(3)
        await h.signature()
        expect(fetch).not.toHaveBeenCalled()
        // The Monaco stub intentionally has no marker API: help owns no diagnostic channel.
        expect(h.currentMonaco.editor).toBeUndefined()
    })
    it('releases model listeners along with provider registrations', async () => {
        const h = harness('pri')
        await h.complete()
        expect(h.watchCount()).toBe(1)
        h.dispose()
        expect(h.watchCount()).toBe(0)
    })
    it('reads only the bounded range rather than materializing a whole large File', async () => {
        const h = harness('pri' + ' '.repeat(SOURCE_HELP_SCAN_LIMIT * 2))
        vi.spyOn(h.model, 'getValue').mockImplementation(() => {
            throw new Error('whole File read')
        })
        expect((await h.complete(3))!.suggestions.some((item) => item.label === 'printf')).toBe(
            true
        )
    })
    it('declines replacement ranges crossing the scan boundary', async () => {
        const h = harness(' '.repeat(SOURCE_HELP_SCAN_LIMIT - 3) + 'printf')
        expect(await h.complete(SOURCE_HELP_SCAN_LIMIT - 1)).toBeUndefined()
    })
    it('completes current-file variables and parameters with declaration details and exact ranges', async () => {
        const h = harness('int global; int run(int count) { int counter = 0; cou')
        const items = (await h.complete())!.suggestions
        const variable = items.find((item) => item.label === 'counter')!
        const parameter = items.find((item) => item.label === 'count')!
        expect(variable.kind).toBe(4)
        expect(variable.detail).toBe('int counter')
        expect(variable.insertText).toBe('counter')
        expect(variable.additionalTextEdits).toBeUndefined()
        expect(parameter.detail).toBe('int count')
        expect(variable.range).toMatchObject({
            startColumn: h.model.getValue().length - 2,
            endColumn: h.model.getValue().length + 1
        })
        expect(variable.sortText!.startsWith('0_')).toBe(true)
    })
    it('shows function declarations and hints from the current file even without a compilation Target', async () => {
        const h = harness('int add(int left, int right); int main(void) { ad', 'main.c', 'M68K')
        const item = (await h.complete())!.suggestions.find((item) => item.label === 'add')!
        expect(item.kind).toBe(1)
        expect(item.detail).toBe('int add(int left, int right)')
        h.edit('int add(int left, int right); int main(void) { add(1, ')
        const signature = (await h.signature())!.value
        expect(signature.activeParameter).toBe(1)
        expect(signature.signatures[0].label).toBe('int add(int left, int right)')
        expect(signature.signatures[0].parameters[1].label).toEqual([18, 27])
    })
    it('keeps local function variadics on the final slot and declines excess fixed parameters', async () => {
        const h = harness('int log(const char *format, ...); int run(void) { log("%d", 1, 2, ')
        expect((await h.signature())!.value.activeParameter).toBe(1)
        h.edit('int add(int left, int right); int run(void) { add(1, 2, ')
        expect(await h.signature()).toBeUndefined()
    })
    it('uses the nearest declaration and suppresses library signatures shadowed by a variable', async () => {
        const h = harness('int printf; void run(void) { double printf; pri')
        const matches = (await h.complete())!.suggestions.filter((item) => item.label === 'printf')
        expect(matches).toHaveLength(1)
        expect(matches[0].detail).toBe('double printf')
        h.edit('int printf; void run(void) { printf')
        const hover = (await h.hover())!.contents[0] as monaco.IMarkdownString
        expect(hover.value).toContain('int printf')
        expect(hover.value).not.toContain('Include')
        h.edit('int printf; void run(void) { printf(')
        expect(await h.signature()).toBeUndefined()
    })
    it('does not show closed-block locals, other function parameters, later declarations or another model names', async () => {
        const h = harness(
            'int other(int count) { int counter; } void run(void) { { int closed; } co'
        )
        const names = (await h.complete())!.suggestions.map((item) => item.label)
        expect(names).not.toContain('count')
        expect(names).not.toContain('counter')
        expect(names).not.toContain('closed')
        const a = harness('int private_one; void run(void) { private_')
        const b = harness('int private_two; void run(void) { private_')
        expect((await a.complete())!.suggestions.map((item) => item.label)).toEqual(['private_one'])
        expect((await b.complete())!.suggestions.map((item) => item.label)).toEqual(['private_two'])
        a.edit('int renamed; void run(void) { private_')
        expect((await a.complete())!.suggestions).toEqual([])
    })
    it('indexes the displayed Build model without borrowing declarations from changed live files', async () => {
        const h = harness('int snapshot_name; void run(void) { snapshot_')
        h.session.setBuild(4, h.session.sources)
        Object.assign(h.model.uri, { path: '/build-4/main.c' })
        h.session.update({
            entry: 'main.c',
            files: { 'main.c': { encoding: 'plain', content: 'int live_name;' } }
        })
        expect((await h.complete())!.suggestions.map((item) => item.label)).toEqual([
            'snapshot_name'
        ])
    })
    it('declines overload matching, unspecified C signatures and function-pointer calls', async () => {
        const overload = harness(
            'int add(int); double add(double); void run(void) { add(',
            'main.cpp'
        )
        expect(await overload.signature()).toBeUndefined()
        const pointer = harness('int (*printf)(int); void run(void) { printf(')
        expect(await pointer.signature()).toBeUndefined()
        expect(await harness('int read(); void run(void) { read(').signature()).toBeUndefined()
        expect(
            (await harness('int read(); void run() { read(', 'main.cpp').signature())!.value
                .signatures[0].parameters
        ).toEqual([])
    })
    it('uses local signature documentation without triggering compilation', async () => {
        const fetch = vi.fn(() => {
            throw new Error('unexpected request')
        })
        vi.stubGlobal('fetch', fetch)
        const h = harness('int add(int left, int right); int main(void) { add(')
        await h.complete(h.model.getValue().length - 1)
        await h.hover(h.model.getValue().length - 1)
        const hints = await h.signature()
        const documentation = hints!.value.signatures[0].documentation as monaco.IMarkdownString
        expect(documentation.value).toContain('Function declared in this file.')
        expect(documentation.value).not.toContain('Include')
        expect(documentation.isTrusted).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
    })
    it('keeps explicit std:: lookup separate from an unqualified local name', async () => {
        const h = harness('int printf; void run() { std::pri', 'main.cpp')
        const item = (await h.complete())!.suggestions.find((item) => item.label === 'std::printf')!
        expect(item.detail).toContain('<cstdio>')
        expect(item.insertText).toBe('printf')
    })
    it('discards pending local suggestions after the model changes', async () => {
        let resolve: (
            value: Awaited<ReturnType<typeof catalog.sourceHelpEntries>>
        ) => void = () => {}
        const deferred = new Promise<Awaited<ReturnType<typeof catalog.sourceHelpEntries>>>(
            (done) => {
                resolve = done
            }
        )
        vi.spyOn(catalog, 'sourceHelpEntries').mockReturnValueOnce(deferred)
        const h = harness('int private_one; void run(void) { private_')
        const request = h.complete()
        h.edit('int renamed; void run(void) { private_')
        resolve([])
        expect(await request).toBeUndefined()
    })
    it('bounds scanning instead of blocking on very large Files', async () =>
        expect(
            await harness(' '.repeat(SOURCE_HELP_SCAN_LIMIT) + 'pri').complete()
        ).toBeUndefined())
})
