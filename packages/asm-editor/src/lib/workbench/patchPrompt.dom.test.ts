/**
 * "Patch instruction…" in the Workbench: offered on the running Executable's instructions only,
 * while the program is paused; its prompt previews the bytes and the instruction they decode as,
 * shows what is wrong, and writes one Poke, which the Listing then shows on its line
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { reactiveProps } from './__fixtures__/reactiveProps.svelte'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { lineOfAddress, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments, type ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import { ListingPatcher } from '#lib/listing/listingPatcher.svelte.ts'
import { withoutComment } from '#lib/listing/patchResolver.ts'
import PatchPromptView from '#cmp/specific/workbench/PatchPrompt.svelte'
import ListingNotice from '#cmp/specific/workbench/ListingNotice.svelte'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'
import { PatchPrompt } from './patchPrompt.svelte'
import type { WorkbenchSessionHost } from './WorkbenchSession.svelte'

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackmeBytes = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
const crackme = Buffer.from(crackmeBytes).toString('base64')

let decoder: ListingDecoder
beforeAll(async () => {
    decoder = await loadDecoder()
})

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

/**
 * Short and near `je`, `jne` and `jmp` to a number, as NASM encodes them, and anything else
 * refused: what the prompt sees of the assembler.
 */
function fakeAssemble(text: string, address: bigint): { bytes: Uint8Array } | { error: string } {
    const match = /^(je|jne|jmp) 0x([\da-f]+)$/.exec(text)
    if (!match) return { error: `Cannot assemble ${text}` }
    const target = BigInt(`0x${match[2]}`)
    const short = { je: 0x74, jne: 0x75, jmp: 0xeb }[match[1]]!
    const delta = target - address - 2n
    if (delta >= -128n && delta < 128n) return { bytes: Uint8Array.of(short, Number(delta) & 0xff) }
    const near = match[1] === 'jmp' ? [0xe9] : [0x0f, short + 0x10]
    const rel = Number(target - address - BigInt(near.length + 4))
    const bytes = new Uint8Array(near.length + 4)
    bytes.set(near)
    new DataView(bytes.buffer).setInt32(near.length, rel, true)
    return { bytes }
}

async function setup(host: Partial<WorkbenchSessionHost> = {}) {
    const fixture = editorGroupsFixture(
        'X86',
        {
            entry: 'crackme',
            files: {
                crackme: { encoding: 'base64', content: crackme },
                'notes.txt': { encoding: 'plain', content: 'password?' }
            }
        },
        host
    )
    disposers.push(fixture.dispose)
    const { emulator, session, project } = fixture
    const store = new ListingDocuments((order) =>
        Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
    )
    emulator.listings = store
    //memory: the Executable's bytes where its Listing has them, and whatever was poked over them
    const poked = new Map<number, number>()
    const pokes: { address: bigint; bytes: number[] }[] = []
    const fake = emulator as unknown as {
        canPoke: boolean
        patcher: ListingPatcher
    }
    fake.canPoke = true
    let program: ListingDocument | undefined
    const patcher = new ListingPatcher({
        executable: () =>
            emulator.canExecute && program ? { path: 'crackme', document: program } : undefined,
        readMemory: (address, length) => {
            const listing = program!.listing!
            return Uint8Array.from({ length }, (_, k) => {
                const link = Number(address) - listing.base + k
                const line = lineOfAddress(listing, link)
                return (
                    poked.get(link) ??
                    crackmeBytes[listing.lines.offsets[line] + link - listing.lines.addresses[line]]
                )
            })
        },
        poke: (address, bytes) => {
            if (!fake.canPoke) return false
            const base = program!.listing!.base
            bytes.forEach((byte, k) => poked.set(Number(address) - base + k, byte))
            pokes.push({ address, bytes: [...bytes] })
            patcher.touched(address, bytes.length)
            patcher.refresh()
            return true
        },
        decoder: () => decoder,
        loadDecoder: async () => decoder,
        assemble: async (text, address) => fakeAssemble(text, address)
    })
    fake.patcher = patcher

    /** A Build of crackme stopped at the password check, shown in its running Listing. */
    async function startSession() {
        const files: typeof project.files = JSON.parse(JSON.stringify(project.files))
        emulator.buildSources = { entry: 'crackme', files }
        emulator.canExecute = true
        program = store.openExecutable('crackme', files.crackme)!
        await program.ready
        store.setSession('crackme', program)
        const listing = program.listing!
        const check = lineOf(listing, 'jne .LAB_2', lineOf(listing, 'call strcmp@plt'))
        await session.revealSourceLocation('crackme', check)
        flushSync()
        return { listing, check, group: session.groups[0] }
    }
    return { ...fixture, emulator: fixture.emulator, startSession, patcher, pokes, fake }
}

function lineOf(listing: Listing, text: string, after = 0): number {
    const line = listing.text
        .split('\n')
        .findIndex((candidate, k) => k >= after && withoutComment(candidate).trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}

describe('where Patch instruction… is offered', () => {
    it('on an instruction of the running Executable’s Listing, while the program is paused', async () => {
        const { session, startSession, fake, emulator } = await setup()
        session.selectFile('crackme')
        flushSync()
        //outside a Debug session the Listing is the File's, and nothing runs to patch
        expect(session.patchSite(session.groups[0], 10)).toBeUndefined()

        const { listing, check, group } = await startSession()
        expect(group.sourceSelection.sourceKind).toBe('build')
        expect(session.patchSite(group, check)).toMatchObject({
            path: 'crackme',
            line: check,
            length: 2,
            text: 'jne .LAB_2'
        })
        //a label, a blank or a header line holds no instruction
        expect(session.patchSite(group, lineOf(listing, 'main:'))).toBeUndefined()
        expect(session.patchSite(group, 0)).toBeUndefined()

        //while a Run or a Step owns the program
        session.running = true
        expect(session.patchSite(group, check)).toBeUndefined()
        session.running = false
        //waiting for input, or ended: no Poke is possible
        fake.canPoke = false
        flushSync()
        expect(session.patchSite(group, check)).toBeUndefined()
        fake.canPoke = true
        flushSync()
        expect(session.patchSite(group, check)).toBeDefined()

        //after Stop, the Listing is the File's again
        emulator.listings!.clearSession()
        emulator.canExecute = false
        emulator.buildSources = undefined
        session.clearExecution()
        flushSync()
        expect(session.patchSite(group, check)).toBeUndefined()
    })

    it('not on a library’s Listing, the File shown live, or a read-only Project', async () => {
        const { session, startSession, emulator } = await setup()
        const { check, group } = await startSession()
        const library = emulator.listings!.open({
            name: 'libc.so.6',
            base: 0x7ffff7c00000,
            content: 'libc',
            bytes: () => crackmeBytes
        })
        await library.ready
        emulator.listings!.setSession('@lib/libc.so.6', library, true)
        await session.revealSourceLocation('@lib/libc.so.6', check)
        flushSync()
        expect(group.displayedLibraryListing).toBe(true)
        expect(session.patchSite(group, check)).toBeUndefined()
        expect(session.openPatchPrompt(group, check)).toBe(false)
        //the Executable's File as the Project holds it, rather than as the Build runs it
        session.selectFile('crackme')
        group.sourceSelection = { sourceKind: 'live', path: 'crackme' }
        flushSync()
        expect(session.patchSite(group, check)).toBeUndefined()

        const readonly = await setup({ readonly: true })
        const shown = await readonly.startSession()
        expect(readonly.session.patchSite(shown.group, shown.check)).toBeUndefined()
    })
})

describe('the Patch instruction prompt', () => {
    async function opened() {
        const fixture = await setup()
        const shown = await fixture.startSession()
        expect(fixture.session.openPatchPrompt(shown.group, shown.check)).toBe(true)
        const prompt = shown.group.openPatchPrompt!
        await prompt.update()
        const host = document.createElement('div')
        document.body.append(host)
        const closed: string[] = []
        const props = reactiveProps({
            prompt,
            available: true,
            onapply: () => {
                closed.push('apply')
                fixture.session.applyPatch(shown.group)
            },
            onclose: () => {
                closed.push('close')
                fixture.session.closePatchPrompt(shown.group)
            }
        })
        const view = mount(PatchPromptView, { target: host, props })
        disposers.push(() => {
            void unmount(view)
            host.remove()
        })
        flushSync()
        const input = host.querySelector<HTMLInputElement>('input')!
        const button = (label: string) =>
            [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!
        const type = async (text: string) => {
            input.value = text
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await prompt.update()
            flushSync()
        }
        return {
            ...fixture,
            ...shown,
            prompt,
            host,
            input,
            button,
            type,
            closed,
            setAvailable: (value: boolean) => {
                props.available = value
                flushSync()
            }
        }
    }

    it('starts from the line’s instruction, which memory already holds', async () => {
        const { host, input, button, check, listing } = await opened()
        expect(input.value).toBe('jne .LAB_2')
        const address = (listing.lines.addresses[check] + listing.base).toString(16)
        expect(host.textContent).toContain(`Patch the instruction at 0x${address}`)
        expect(host.textContent).toContain('2 bytes')
        expect(host.textContent).toContain('Decodes as jne .LAB_2')
        expect(host.textContent).toContain('Memory already holds these bytes.')
        expect(button('Patch').disabled).toBe(true)
    })

    it('previews the bytes and the instruction they decode as, then writes one Poke', async () => {
        const { host, type, button, group, check, pokes, prompt, listing } = await opened()
        await type('je .LAB_2')
        expect(prompt.current?.ok).toBe(true)
        const text = host.querySelector('.patch-preview')!.textContent!.replace(/\s+/g, ' ')
        expect(text).toMatch(/Decodes as je \.LAB_2 Bytes 74 ([\da-f]{2}) \(was 75 \1\)/)
        expect(button('Patch').disabled).toBe(false)

        host.querySelector('form')!.requestSubmit()
        flushSync()
        expect(pokes).toHaveLength(1)
        expect(pokes[0].address).toBe(BigInt(listing.lines.addresses[check] + listing.base))
        expect(pokes[0].bytes[0]).toBe(0x74)
        //written, the prompt closes and the line shows the patch, marked, with the text unchanged elsewhere
        expect(group.openPatchPrompt).toBeUndefined()
        expect(group.displayedPatches?.lines.has(check)).toBe(true)
        const lines = group.displayedCode.split('\n')
        expect(lines[check]).toBe('    je .LAB_2')
        expect(lines).toHaveLength(listing.text.split('\n').length)
    })

    it('shows what is wrong, and writes nothing', async () => {
        const { host, type, button, pokes } = await opened()
        await type('je strcmp@plt')
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
            'The new instruction needs 6 bytes, the instruction it replaces has 2; it would overwrite the next instruction'
        )
        expect(button('Patch').disabled).toBe(true)
        await type('je .LAB_9')
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
            'There is no .LAB_9 in main: a bare .LAB_n names a block of the function the line is in'
        )
        await type('je s_Nothing')
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
            'There is no label named s_Nothing in this Listing'
        )
        host.querySelector('form')!.requestSubmit()
        flushSync()
        expect(pokes).toEqual([])
    })

    it('waits while the program runs, and closes on Escape or Cancel', async () => {
        const { host, type, button, input, setAvailable, closed, group, pokes } = await opened()
        await type('je .LAB_2')
        setAvailable(false)
        expect(host.textContent).toContain('Patching needs the program paused')
        expect(button('Patch').disabled).toBe(true)
        host.querySelector('form')!.requestSubmit()
        flushSync()
        expect(pokes).toEqual([])
        setAvailable(true)
        expect(button('Patch').disabled).toBe(false)

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        flushSync()
        expect(closed).toEqual(['close'])
        expect(group.openPatchPrompt).toBeUndefined()
    })

    it('is a modal dialog named by its title, which Escape closes from any of its controls', async () => {
        const { host, button, closed } = await opened()
        const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
        expect(dialog.getAttribute('aria-modal')).toBe('true')
        const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)
        expect(title?.textContent).toMatch(/^Patch the instruction at 0x[\da-f]+$/)
        const cancel = button('Cancel')
        cancel.focus()
        cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        flushSync()
        expect(closed).toEqual(['close'])
    })

    it('keeps Tab among its own controls', async () => {
        const { input, button, type } = await opened()
        await type('je .LAB_2')
        const patch = button('Patch')
        expect(patch.disabled).toBe(false)
        patch.focus()
        const tab = (shiftKey: boolean) => {
            const event = new KeyboardEvent('keydown', {
                key: 'Tab',
                shiftKey,
                bubbles: true,
                cancelable: true
            })
            document.activeElement!.dispatchEvent(event)
            return event.defaultPrevented
        }
        //past the last control, back to the first, and the other way round
        expect(tab(false)).toBe(true)
        expect(document.activeElement).toBe(input)
        expect(tab(true)).toBe(true)
        expect(document.activeElement).toBe(patch)
        //between its controls, the browser's own Tab
        button('Cancel').focus()
        expect(tab(false)).toBe(false)
    })

    it('gives the keyboard back when it goes away holding it', async () => {
        const fixture = await setup()
        const shown = await fixture.startSession()
        fixture.session.openPatchPrompt(shown.group, shown.check)
        const host = document.createElement('div')
        document.body.append(host)
        const released: string[] = []
        const view = mount(PatchPromptView, {
            target: host,
            props: {
                prompt: shown.group.openPatchPrompt!,
                available: true,
                onapply: () => undefined,
                onclose: () => undefined,
                onrelease: () => released.push('release')
            }
        })
        flushSync()
        host.querySelector('input')!.focus()
        void unmount(view)
        host.remove()
        expect(released).toEqual(['release'])
    })

    it('closes when the Debug session it was opened in ends', async () => {
        const { session, emulator, group } = await opened()
        expect(group.openPatchPrompt).toBeDefined()
        emulator.listings!.clearSession()
        emulator.canExecute = false
        session.clearExecution()
        flushSync()
        expect(group.openPatchPrompt).toBeUndefined()
    })

    it('does not come back with the next Build of the same Executable', async () => {
        const { session, emulator, group, type, startSession, pokes } = await opened()
        await type('je .LAB_2')
        //Stop with the prompt open, then Build again: the same Listing, a new Debug session
        emulator.listings!.clearSession()
        emulator.canExecute = false
        session.clearExecution()
        flushSync()
        const again = await startSession()
        expect(again.group).toBe(group)
        expect(group.patchPrompt).toBeUndefined()
        expect(group.openPatchPrompt).toBeUndefined()
        expect(session.applyPatch(group)).toBe(false)
        expect(pokes).toEqual([])
    })

    it('belongs to the Build it was opened in', async () => {
        const { session, group, check, patcher } = await opened()
        const prompt = group.openPatchPrompt!
        expect(prompt.buildGeneration).toBe(session.buildGeneration)
        //a prompt of an earlier Build, left on the group, is never the open one
        group.patchPrompt = new PatchPrompt(prompt.site, patcher, session.buildGeneration - 1)
        expect(group.openPatchPrompt).toBeUndefined()
        expect(session.openPatchPrompt(group, check)).toBe(true)
        expect(group.openPatchPrompt?.buildGeneration).toBe(session.buildGeneration)
    })

    it('Cancel leaves memory as it is', async () => {
        const { type, button, closed, pokes } = await opened()
        await type('je .LAB_2')
        button('Cancel').click()
        flushSync()
        expect(closed).toEqual(['close'])
        expect(pokes).toEqual([])
    })
})

describe('the Listing notice during a Debug session', () => {
    it('says how to patch the running Executable', async () => {
        const store = new ListingDocuments((order) =>
            Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
        )
        const listing = store.open({
            name: 'crackme',
            base: 0x555555554000,
            content: crackme,
            bytes: () => crackmeBytes
        })
        await listing.ready
        const host = document.createElement('div')
        const notice = mount(ListingNotice, {
            target: host,
            props: { document: listing, patchable: true }
        })
        flushSync()
        expect(host.textContent?.trim()).toBe('read-only')
        expect(tooltipText(host.querySelector('[role="status"] [aria-describedby]'))).toBe(
            'Generated Listing of crackme: read-only. While the program is paused, Space or the context menu patches the instruction on a line, in memory only.'
        )
        void unmount(notice)
        //a touch screen has no Space, and its context menu opens on a long press
        const touch = mount(ListingNotice, {
            target: host,
            props: { document: listing, patchable: true, touch: true }
        })
        flushSync()
        expect(host.textContent?.trim()).toBe('read-only')
        expect(tooltipText(host.querySelector('[role="status"] [aria-describedby]'))).toBe(
            'Generated Listing of crackme: read-only. While the program is paused, a long press on a line offers to patch its instruction, in memory only.'
        )
        void unmount(touch)
    })
})
