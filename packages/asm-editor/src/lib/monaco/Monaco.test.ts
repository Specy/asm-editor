import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'

const { install, openerDisposed, declareLanguage, registerOpener } = vi.hoisted(() => {
    const openerDisposed = vi.fn()
    return {
        install: vi.fn<(...args: unknown[]) => Promise<monaco.IDisposable[]>>(),
        openerDisposed,
        declareLanguage: vi.fn(),
        registerOpener: vi.fn(() => ({ dispose: openerDisposed }))
    }
})
vi.mock('$app/env', () => ({ browser: false }))
vi.mock('#lib/monaco/editorTheme.ts', () => ({ generateTheme: () => ({}) }))
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({ default: class {} }))
vi.mock('monaco-editor', () => ({
    editor: { defineTheme() {}, registerEditorOpener: registerOpener },
    languages: { register: declareLanguage }
}))
vi.mock('./assemblyLanguageRegistry', () => ({ registerAssemblyLanguage: install }))
vi.mock('#lib/languages/languageDetector.ts', () => ({ preloadLanguageDetector: vi.fn() }))

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

let Monaco: (typeof import('./Monaco'))['Monaco']
beforeEach(async () => {
    vi.resetModules()
    vi.resetAllMocks()
    registerOpener.mockImplementation(() => ({ dispose: openerDisposed }))
    install.mockResolvedValue([])
    vi.stubGlobal('self', {})
    Monaco = (await import('./Monaco')).Monaco
})
afterEach(() => {
    Monaco.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('assembly registration lifecycle', () => {
    it('does not declare a language or install an opener if disposed while Monaco is loading', async () => {
        const loading = deferred<MonacoType>()
        vi.spyOn(Monaco, 'load').mockReturnValue(loading.promise)
        const request = Monaco.registerLanguage('MIPS')
        Monaco.dispose()
        loading.resolve((await import('monaco-editor')) as MonacoType)
        await request
        expect(install).not.toHaveBeenCalled()
        expect(declareLanguage).not.toHaveBeenCalled()
        expect(registerOpener).not.toHaveBeenCalled()
    })

    it('disposes stale providers in reverse order and allows registration again', async () => {
        await Monaco.get()
        const pending = deferred<monaco.IDisposable[]>()
        install.mockReturnValueOnce(pending.promise)
        const request = Monaco.registerLanguage('MIPS')
        const isCurrent = install.mock.calls[0][2] as () => boolean
        expect(isCurrent()).toBe(true)
        Monaco.dispose()
        expect(isCurrent()).toBe(false)
        expect(openerDisposed).toHaveBeenCalledTimes(1)
        const disposed: number[] = []
        pending.resolve([0, 1].map((id) => ({ dispose: () => disposed.push(id) })))
        await request
        expect(disposed).toEqual([1, 0])
        await Monaco.registerLanguage('MIPS')
        expect(install).toHaveBeenCalledTimes(2)
        expect(registerOpener).toHaveBeenCalledTimes(2)
        // Monaco keeps language declarations across provider lifecycles.
        expect(declareLanguage).toHaveBeenCalledTimes(1)
        Monaco.dispose()
        expect(disposed).toEqual([1, 0])
    })

    it.each(['success', 'failure'] as const)(
        'keeps a newer pending registration when the disposed operation ends with %s',
        async (outcome) => {
            await Monaco.get()
            const old = deferred<monaco.IDisposable[]>()
            const fresh = deferred<monaco.IDisposable[]>()
            install.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
            const oldRequest = Monaco.registerLanguage('MIPS')
            const oldResult =
                outcome === 'failure'
                    ? expect(oldRequest).rejects.toThrow('old registration failed')
                    : oldRequest
            Monaco.dispose()
            const newRequest = Monaco.registerLanguage('MIPS')
            const oldDisposed = vi.fn()
            if (outcome === 'failure') old.reject(new Error('old registration failed'))
            else old.resolve([{ dispose: oldDisposed }])
            await oldResult
            const editorRequest = Monaco.registerLanguage('MIPS')
            expect(install).toHaveBeenCalledTimes(2)
            let editorFinished = false
            void editorRequest.then(() => {
                editorFinished = true
            })
            await Promise.resolve()
            expect(editorFinished).toBe(false)
            const newDisposed = vi.fn()
            fresh.resolve([{ dispose: newDisposed }])
            await Promise.all([newRequest, editorRequest])
            await Monaco.registerLanguage('MIPS')
            expect(install).toHaveBeenCalledTimes(2)
            expect(newDisposed).not.toHaveBeenCalled()
            Monaco.dispose()
            expect(newDisposed).toHaveBeenCalledTimes(1)
            expect(oldDisposed).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0)
        }
    )

    it('does not retain old providers when the newer registration finishes first', async () => {
        await Monaco.get()
        const old = deferred<monaco.IDisposable[]>()
        const oldDisposed = vi.fn()
        const newDisposed = vi.fn()
        install.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ dispose: newDisposed }])
        const oldRequest = Monaco.registerLanguage('X86')
        Monaco.dispose()
        await Monaco.registerLanguage('X86')
        old.resolve([{ dispose: oldDisposed }])
        await oldRequest
        expect(oldDisposed).toHaveBeenCalledTimes(1)
        expect(newDisposed).not.toHaveBeenCalled()
        await Monaco.registerLanguage('X86')
        expect(install).toHaveBeenCalledTimes(2)
        Monaco.dispose()
        expect(oldDisposed).toHaveBeenCalledTimes(1)
        expect(newDisposed).toHaveBeenCalledTimes(1)
    })

    it('shares a failure among concurrent callers and retries on the next request', async () => {
        await Monaco.get()
        const pending = deferred<monaco.IDisposable[]>()
        install.mockReturnValueOnce(pending.promise)
        const first = Monaco.registerLanguage('Z80')
        const second = Monaco.registerLanguage('Z80')
        const results = Promise.allSettled([first, second])
        pending.reject(new Error('registration failed'))
        expect(await results).toEqual([
            { status: 'rejected', reason: new Error('registration failed') },
            { status: 'rejected', reason: new Error('registration failed') }
        ])
        await Monaco.registerLanguage('Z80')
        expect(install).toHaveBeenCalledTimes(2)
    })

    it.each(['warm-up', 'editor'] as const)(
        'shares providers between overlapping warm-up and editor requests with %s first',
        async (first) => {
            const pending = deferred<monaco.IDisposable[]>()
            install.mockReturnValue(pending.promise)
            let idle!: () => void
            vi.stubGlobal('window', {
                requestIdleCallback: vi.fn((callback: () => void) => {
                    idle = callback
                    return 1
                }),
                cancelIdleCallback: vi.fn()
            })
            const { warmUpMonaco } = await import('./warmUp')
            const cancel = warmUpMonaco()
            let editorRequest: Promise<void> | undefined
            if (first === 'editor') {
                editorRequest = Monaco.registerLanguage('MIPS')
                await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1))
            }
            idle()
            await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(6))
            editorRequest ??= Monaco.registerLanguage('MIPS')
            const all = Monaco.registerLanguages()
            expect(install).toHaveBeenCalledTimes(6)
            const providerDisposed = vi.fn()
            pending.resolve([{ dispose: providerDisposed }])
            await Promise.all([editorRequest, all])
            await Monaco.registerLanguages()
            expect(install).toHaveBeenCalledTimes(6)
            Monaco.dispose()
            expect(providerDisposed).toHaveBeenCalledTimes(6)
            cancel()
        }
    )
})
