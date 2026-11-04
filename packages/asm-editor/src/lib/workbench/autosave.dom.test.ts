/**
 * Autosave waits for the Project to stop changing for `AUTOSAVE_DELAY` before it saves, since a
 * save writes the whole Project, and nothing waiting is lost: it saves at once as the page is
 * hidden or closed, as the Workbench goes, on Save, and when the host asks before it reads the
 * stored Project ([ADR 0076](../../../../../docs/adr/0076-a-project-holds-64-mib-of-files.md)).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { AUTOSAVE_DELAY, type WorkbenchSessionHost } from './WorkbenchSession.svelte'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { encodeBase64 } from '#lib/projectFiles.ts'

const disposers: (() => void)[] = []
function setup(host: Partial<WorkbenchSessionHost> = {}) {
    const fixture = editorGroupsFixture('RISC-V', {}, host)
    //what the session's `mount` takes down as the Workbench goes
    Object.assign(fixture.emulator, { dispose: () => {} })
    disposers.push(fixture.dispose)
    flushSync()
    return fixture
}

beforeEach(() => {
    preferencesStore.values.autoSave.value = true
    vi.useFakeTimers()
})

afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    vi.useRealTimers()
    vi.restoreAllMocks()
    preferencesStore.values.autoSave.value = true
})

describe('autosave', () => {
    it('waits for the Project to stop changing, each change starting the wait again', () => {
        const onChange = vi.fn()
        const onSave = vi.fn()
        const { session } = setup({ onChange, onSave })
        //a key a second for five seconds: the host hears of each at once, and nothing is saved
        for (let key = 0; key < 5; key++) {
            session.fileEdited('main.s', `nop\n${'x'.repeat(key)}`)
            vi.advanceTimersByTime(1000)
        }
        expect(onChange).toHaveBeenCalledTimes(5)
        expect(onSave).not.toHaveBeenCalled()
        vi.advanceTimersByTime(AUTOSAVE_DELAY - 1000 - 1)
        expect(onSave).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: true })
        vi.advanceTimersByTime(AUTOSAVE_DELAY * 2)
        expect(onSave).toHaveBeenCalledOnce()
    })

    it('waits as long for a change that is not to the Files', () => {
        const onSave = vi.fn()
        const { session, project } = setup({ onSave })
        session.rename('Renamed')
        expect(project.name).toBe('Renamed')
        expect(onSave).not.toHaveBeenCalled()
        vi.advanceTimersByTime(AUTOSAVE_DELAY)
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: true })
    })

    it('saves at once on Save, which leaves autosave nothing to save after it', () => {
        const onSave = vi.fn()
        const { session } = setup({ onSave })
        session.fileEdited('main.s', 'nop\nnop\nnop')
        session.save()
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: false })
        vi.advanceTimersByTime(AUTOSAVE_DELAY * 2)
        expect(onSave).toHaveBeenCalledOnce()
    })

    it('saves at once when the host asks, and only what waits', () => {
        const onSave = vi.fn()
        const { session } = setup({ onSave })
        session.saveNow()
        expect(onSave).not.toHaveBeenCalled()
        session.fileEdited('main.s', 'nop\nnop\nnop')
        session.saveNow()
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: true })
        session.saveNow()
        vi.advanceTimersByTime(AUTOSAVE_DELAY * 2)
        expect(onSave).toHaveBeenCalledOnce()
    })

    it('saves at once when the page is hidden or closed', () => {
        const onSave = vi.fn()
        const { session } = setup({ onSave })
        const visibility = vi.spyOn(document, 'visibilityState', 'get')
        session.fileEdited('main.s', 'nop\nnop\nnop')
        visibility.mockReturnValue('hidden')
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: true })
        session.fileEdited('main.s', 'nop')
        window.dispatchEvent(new Event('pagehide'))
        expect(onSave).toHaveBeenCalledTimes(2)
        vi.advanceTimersByTime(AUTOSAVE_DELAY * 2)
        expect(onSave).toHaveBeenCalledTimes(2)
    })

    it('saves at once as the Workbench goes, with what a Hex editor still holds typed', () => {
        const onSave = vi.fn()
        const { session, project } = setup({ onSave })
        const unmount = session.mount()
        session.fileEdited('main.s', 'nop\nnop\nnop')
        //a Hex editor's typing, which it hands over only as it goes
        let typed: string | undefined = 'nop\nnop\nnop\nnop'
        session.registerTypingFlush(() => {
            if (typed) project.fileSystem.writeText('value.h', typed)
            typed = undefined
        })
        unmount()
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: true })
        expect(project.files['value.h'].content).toBe('nop\nnop\nnop\nnop')
        vi.advanceTimersByTime(AUTOSAVE_DELAY * 2)
        expect(onSave).toHaveBeenCalledOnce()
    })

    it('saves nothing on its own without autosave, which leaves the changes for Save', () => {
        preferencesStore.values.autoSave.value = false
        const onChange = vi.fn()
        const onSave = vi.fn()
        const { session } = setup({ onChange, onSave })
        const unmount = session.mount()
        session.fileEdited('main.s', 'nop\nnop\nnop')
        expect(onChange).toHaveBeenCalledOnce()
        session.saveNow()
        window.dispatchEvent(new Event('pagehide'))
        vi.advanceTimersByTime(AUTOSAVE_DELAY * 2)
        unmount()
        expect(onSave).not.toHaveBeenCalled()
    })

    it('saves nothing waiting once autosave is turned off during the wait', () => {
        const onSave = vi.fn()
        const { session } = setup({ onSave })
        session.fileEdited('main.s', 'nop\nnop\nnop')
        preferencesStore.values.autoSave.value = false
        vi.advanceTimersByTime(AUTOSAVE_DELAY)
        expect(onSave).not.toHaveBeenCalled()
    })
})

describe('a keystroke in a large Project', () => {
    it('writes the File typed into, and checks none of the others again', () => {
        const { session, project } = setup()
        project.fileSystem.writeBytes('blob.bin', new Uint8Array([0xff, 0, 1, 2, 3]))
        expect(project.files['blob.bin'].content).toBe(encodeBase64(Uint8Array.of(255, 0, 1, 2, 3)))
        const kept = project.files
        const atob = vi.spyOn(globalThis, 'atob')
        const encode = vi.spyOn(TextEncoder.prototype, 'encode')
        session.fileEdited('main.s', 'nop\naddi a0, a0, 1')
        //no File's bytes are decoded or its text encoded, the typed one's included
        const contents = new Set([
            ...Object.values(kept).map((file) => file.content),
            'nop\naddi a0, a0, 1'
        ])
        expect(atob).not.toHaveBeenCalled()
        expect(encode.mock.calls.filter(([text]) => contents.has(text ?? ''))).toEqual([])
        for (const path of ['blob.bin', 'main.c', 'value.h'])
            expect(project.files[path]).toBe(kept[path])
        expect(project.files['main.s'].content).toBe('nop\naddi a0, a0, 1')
    })

    it('hands live checking and the Emulator the Files map itself, never a copy', () => {
        const { session, project, emulator } = setup()
        const given: unknown[] = []
        emulator.setSources = (sources) => void given.push(sources.files)
        session.fileEdited('main.s', 'nop\nnop\nnop')
        flushSync()
        expect(session.sourceInput.files).toBe(project.files)
        expect(project.toObject().files).toBe(project.files)
        expect(given.at(-1)).toBe(project.files)
    })
})
