import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import RegisterFilesPanel from './RegisterFilesPanel.svelte'
import {
    makeRegister,
    type RegisterFile,
    type RegisterFileDescriptor,
    type RegisterPoke,
    RegisterSize,
    resolveRegisterFileLayout
} from '$lib/languages/commonLanguageFeatures.svelte'

//the panel reaches `$lib/utils`, which reaches the projects store, which opens its IndexedDB
//because this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's rejection
//would fail the run, so the database is stubbed away
vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/**
 * What the panel around a poked row does to the open input
 * ([the design record](../../../../../docs/design/pokes.md)): a chunk input is opened over one lane
 * of one reading of one file, so the Format strip, the grouping strip and the tabs all take it
 * away rather than leaving it over a lane it was not typed for.
 */

function makeFile(descriptor: RegisterFileDescriptor, values: [string, bigint][]): RegisterFile {
    return {
        ...descriptor,
        layout: resolveRegisterFileLayout(descriptor),
        registers: values.map(([name, value]) => makeRegister(name, value, descriptor.size)),
        flags: [],
        blanks: []
    }
}

function render() {
    const pokes: { fileId: string; writes: RegisterPoke[] }[] = []
    const target = document.createElement('div')
    document.body.appendChild(target)
    const cpu = makeFile(
        {
            id: 'cpu',
            label: 'CPU',
            size: RegisterSize.Long,
            formats: ['hex'],
            registers: [{ name: 't0' }]
        },
        [['t0', 0x11223344n]]
    )
    const fpu = makeFile(
        {
            id: 'fpu',
            label: 'FPU',
            size: RegisterSize.Double,
            formats: ['hex', 'double'],
            registers: [{ name: 'f0', kind: 'float' }]
        },
        [['f0', 0n]]
    )
    const app = mount(RegisterFilesPanel, {
        target,
        props: {
            files: [cpu, fpu],
            systemSize: RegisterSize.Long,
            language: 'MIPS' as const,
            pokeable: true,
            onPoke: (fileId: string, writes: RegisterPoke[]) => pokes.push({ fileId, writes })
        }
    })
    flushSync()
    const buttons = (selector: string) => [...target.querySelectorAll<HTMLElement>(selector)]
    const click = (label: string) => {
        const button = buttons('.segmented-control-button').find(
            (candidate) => candidate.textContent?.trim() === label
        )
        if (!button) throw new Error(`no "${label}" button in the panel header`)
        button.click()
        flushSync()
    }
    return {
        pokes,
        click,
        chunks: () => buttons('.chunk-button'),
        input: () => target.querySelector<HTMLInputElement>('.chunk-input'),
        openFirstChunk: () => {
            buttons('.chunk-button')[0].click()
            flushSync()
        },
        close: () => {
            unmount(app)
            target.remove()
        }
    }
}

function type(input: HTMLInputElement, text: string) {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
}

describe('the Register file panel around an open chunk input', () => {
    it('closes the input when the file picks another Format', () => {
        const panel = render()
        panel.click('FPU')
        panel.openFirstChunk()
        type(panel.input()!, 'ffff')
        //the chunks of the Double Format are lanes, not hex groups, so the index the input was
        //opened at names something else entirely there
        panel.click('Double')
        expect(panel.input()).toBe(null)
        expect(panel.pokes).toEqual([])
        panel.close()
    })

    it('closes the input when the grouping changes', () => {
        const panel = render()
        panel.openFirstChunk()
        expect(panel.input()!.value).toBe('1122')
        type(panel.input()!, 'ffff')
        //`W` is four bytes to MIPS, so the row goes from two groups to one
        panel.click('W')
        expect(panel.input()).toBe(null)
        expect(panel.pokes).toEqual([])
        panel.close()
    })

    it('closes the input when another file is picked, and does not bring it back', () => {
        const panel = render()
        panel.openFirstChunk()
        type(panel.input()!, 'ffff')
        //no row of the FPU file is named `t0`, so an input keyed by the register name alone would
        //simply not be drawn here and would come back, with its stale text, on the way out
        panel.click('FPU')
        expect(panel.input()).toBe(null)
        panel.click('CPU')
        expect(panel.input()).toBe(null)
        expect(panel.chunks()[0].textContent).toContain('1122')
        expect(panel.pokes).toEqual([])
        panel.close()
    })
})
