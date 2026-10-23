/**
 * The Explorer's Build outputs: Files Builds saved the programs they linked in, listed with the
 * Project's other Files and dimmed once their sources have changed
 * ([ADR 0056](../../../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import Explorer from './Explorer.svelte'
import type { BuildOutputState } from '#lib/buildOutput.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'

//an ELF stands in for the program a Build links
const program = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

//jsdom has no popovers, which the context menu opens as
beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
})

const disposers: (() => Promise<void> | void)[] = []
afterEach(async () => {
    for (const dispose of disposers.splice(0)) await dispose()
    vi.restoreAllMocks()
})

function explorer() {
    const fileSystem = new FileSystem({ 'main.asm': { encoding: 'plain', content: 'nop' } })
    fileSystem.writeBytes('main', program, false, 'base64')
    const target = document.createElement('div')
    document.body.append(target)
    const props = $state({
        files: fileSystem.files,
        fileSystem,
        language: 'X86' as const,
        programs: [{ entry: 'main.asm', label: 'main.asm', missing: false }],
        selectedProgram: 'main.asm',
        selectedPath: 'main.asm',
        locked: false,
        onSelect: vi.fn(),
        buildOutputs: new Map([['main', { entry: 'main.asm', stale: false }]]) as ReadonlyMap<
            string,
            BuildOutputState
        >
    })
    const component = mount(Explorer, { target, props })
    flushSync()
    disposers.push(async () => {
        await unmount(component)
        target.remove()
    })
    const row = (name: string) =>
        [...target.querySelectorAll<HTMLElement>('.tree-row.file')].find(
            (candidate) => candidate.querySelector('.ellipsis')?.textContent === name
        )
    return { props, target, row }
}

it('lists a Build output among the Files, with no section of its own', () => {
    const view = explorer()
    const row = view.row('main')!
    expect(row).toBeDefined()
    expect(row.classList.contains('built')).toBe(true)
    expect(row.title).toBe('main: built from main.asm')
    //a File like any other: dragged, renamed, downloaded
    expect(row.querySelector('[draggable="true"]')).not.toBeNull()
    expect(row.querySelector('[title="Download exact bytes"]')).not.toBeNull()
    expect(view.target.textContent).not.toContain('Build output')
    expect(view.target.textContent).not.toContain('Keep as File')
    row.querySelector<HTMLButtonElement>('.file-select')!.click()
    expect(view.props.onSelect).toHaveBeenCalledWith('main')
})

it('dims a Build output from an earlier Build', () => {
    const view = explorer()
    expect(view.row('main')?.textContent).not.toContain('From an earlier Build')
    view.props.buildOutputs = new Map([['main', { entry: 'main.asm', stale: true }]])
    flushSync()
    const row = view.row('main')!
    expect(row.classList.contains('stale')).toBe(true)
    expect(row.textContent).toContain('From an earlier Build')
    expect(row.title).toBe(
        'main: from an earlier Build of main.asm; its sources have changed since'
    )
    expect(view.row('main.asm')?.classList.contains('built')).toBe(false)
})

it('marks a File no Build output as nothing', () => {
    const view = explorer()
    view.props.buildOutputs = new Map()
    flushSync()
    const row = view.row('main')!
    expect(row.classList.contains('built')).toBe(false)
    expect(row.title).toBe('main')
})
