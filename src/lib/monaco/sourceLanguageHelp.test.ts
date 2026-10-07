import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const { install, disposed } = vi.hoisted(() => {
    const disposed = vi.fn()
    return { disposed, install: vi.fn(() => [{ dispose: disposed }]) }
})
vi.mock('$app/environment', () => ({ browser: false }))
vi.mock('$lib/monaco/editorTheme', () => ({ generateTheme: () => ({}) }))
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({ default: class {} }))
vi.mock('monaco-editor', () => ({ editor: { defineTheme() {} } }))
vi.mock('./assemblyLanguageRegistry', () => ({ registerAssemblyLanguage: vi.fn() }))
vi.mock('$lib/sourceLanguageHelp/register', () => ({ registerSourceLanguageHelp: install }))
import { Monaco } from './Monaco'

beforeAll(() => vi.stubGlobal('self', {}))
afterAll(() => vi.unstubAllGlobals())
afterEach(() => {
    Monaco.dispose()
    vi.clearAllMocks()
})
describe('source help loader lifecycle', () => {
    it('shares registration for simultaneous C and C++ panes and reinstalls after disposal', async () => {
        await Promise.all([
            Monaco.registerLanguage('c'),
            Monaco.registerLanguage('cpp'),
            Monaco.registerLanguage('cpp')
        ])
        expect(install).toHaveBeenCalledTimes(1)
        Monaco.dispose()
        expect(disposed).toHaveBeenCalledTimes(1)
        await Monaco.registerLanguage('cpp')
        expect(install).toHaveBeenCalledTimes(2)
    })
    it('recovers on another request when provider installation failed', async () => {
        install.mockImplementationOnce(() => {
            throw new Error('registration failed')
        })
        await expect(Monaco.registerLanguage('c')).rejects.toThrow('registration failed')
        await Monaco.registerLanguage('cpp')
        expect(install).toHaveBeenCalledTimes(2)
    })
    it('does not install a registration disposed while it was pending', async () => {
        const request = Monaco.registerLanguage('c')
        Monaco.dispose()
        await request
        expect(install).not.toHaveBeenCalled()
        await Monaco.registerLanguage('cpp')
        expect(install).toHaveBeenCalledTimes(1)
    })
})
