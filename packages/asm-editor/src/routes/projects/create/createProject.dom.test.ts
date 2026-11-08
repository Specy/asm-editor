import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { db } from '#lib/storage/db.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type { ProjectTemplate } from '#lib/content/templates.ts'
import { goto } from '$app/navigation'

vi.mock('$app/navigation', () => ({ goto: vi.fn() }))

// jsdom has no Web Animations API, which the page's transitions use, nor the popover API, which
// the Template list opens in.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

const STORAGE_KEY = 'asm-editor_new-project-isa'

function template(language: AvailableLanguages, id: string, order: number): ProjectTemplate {
    return {
        id,
        name: id === 'barebones' ? 'Empty program' : `Program ${id}`,
        description: `What ${id} does in ${language}.`,
        language,
        code: `; ${id} in ${language}`,
        order
    }
}

/** Every set offers the empty program and a loop; x86 alone has no tune, as the real list has. */
const TEMPLATES = Object.fromEntries(
    (['M68K', 'MIPS', 'RISC-V', 'RISC-V-64', 'X86', 'Z80'] as const).map((language) => [
        language,
        [
            template(language, 'barebones', 0),
            template(language, 'loop', 1),
            ...(language === 'X86' ? [] : [template(language, 'tune', 2)])
        ]
    ])
)

async function page() {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount((await import('./+page.svelte')).default, {
        target,
        props: { data: { templates: TEMPLATES, gettingStarted: 'getting-started' } } as never
    })
    flushSync()
    const tiles = () => [
        ...target.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]')
    ]
    return {
        target,
        bar: () =>
            target.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Instruction set"]')!,
        tiles,
        picked: () =>
            tiles()
                .find((tile) => tile.getAttribute('aria-checked') === 'true')
                ?.textContent?.trim() ?? null,
        /** The simulator the set picked follows, or null for one that follows none. */
        compatible: () => target.querySelector('.compatible .simulator')?.textContent ?? null,
        /** Each capability as a screen reader reads it, those the set lacks said to be missing. */
        capabilities: () =>
            [...target.querySelectorAll('.capabilities li')].map((li) => li.textContent?.trim()),
        pick: (label: string) => {
            tiles()
                .find((tile) => tile.textContent?.trim() === label)!
                .click()
            flushSync()
        },
        dispose: async () => {
            await unmount(component)
            target.remove()
        }
    }
}

beforeEach(() => localStorage.clear())

afterEach(async () => {
    vi.restoreAllMocks()
    vi.mocked(goto).mockClear()
    await db.projects.clear()
    ProjectStore.unload()
})

const NOT = ', not available'

it('offers the instruction sets as one radio group, each marked with a colour that is not read out', async () => {
    const view = await page()
    try {
        expect(view.bar().querySelectorAll('[role="radio"]')).toHaveLength(6)
        const tiles = view.tiles()
        expect(tiles.map((tile) => tile.textContent?.trim())).toEqual([
            'M68K',
            'MIPS',
            'RISC-V',
            'RISC-V-64',
            'x86-64',
            'Z80'
        ])
        for (const tile of tiles) {
            const square = tile.querySelector<HTMLElement>('.language-square')!
            expect(square.getAttribute('aria-hidden')).toBe('true')
            expect(square.style.backgroundColor).not.toBe('')
        }
        expect(view.picked()).toBe('RISC-V-64')
        expect(tiles.map((tile) => tile.tabIndex)).toEqual([-1, -1, -1, 0, -1, -1])
        expect(view.compatible()).toBe('RARS')
        expect(view.capabilities()).toEqual([
            'Screen',
            'Keyboard',
            'Mouse',
            'Sound',
            'File system',
            'C/C++',
            'Disassemble' + NOT,
            'Ghidra decompile' + NOT
        ])
    } finally {
        await view.dispose()
    }
})

it('shows what the set picked can do and remembers it for the next project', async () => {
    const view = await page()
    try {
        view.pick('x86-64')
        expect(view.picked()).toBe('x86-64')
        expect(view.compatible()).toBeNull()
        expect(view.capabilities().filter((c) => c?.endsWith(NOT))).toEqual([])
        expect(localStorage.getItem(STORAGE_KEY)).toBe('X86')
        view.pick('M68K')
        expect(view.compatible()).toBe('EASy68K')
        expect(view.capabilities().filter((c) => c?.endsWith(NOT))).toEqual([
            'C/C++' + NOT,
            'Disassemble' + NOT,
            'Ghidra decompile' + NOT
        ])
        view.pick('Z80')
        expect(view.compatible()).toBeNull()
        expect(view.capabilities().filter((c) => c?.endsWith(NOT))).toEqual([
            'File system' + NOT,
            'C/C++' + NOT,
            'Disassemble' + NOT,
            'Ghidra decompile' + NOT
        ])
        expect(
            [
                ...(view.target
                    .querySelector('.summary')
                    ?.querySelectorAll('span:not([aria-hidden])') ?? [])
            ].map((span) => span.textContent?.trim())
        ).toEqual(['Z80', 'Empty program'])
        expect(localStorage.getItem(STORAGE_KEY)).toBe('Z80')
    } finally {
        await view.dispose()
    }
})

it('moves through the sets with the arrow keys, Home and End, picking each one it reaches', async () => {
    const view = await page()
    try {
        const press = (key: string) => {
            document.activeElement!.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
            )
            flushSync()
            const focused = (document.activeElement as HTMLElement).textContent?.trim()
            expect(focused).toBe(view.picked())
            return focused
        }
        view.tiles()[3].focus()
        expect(press('ArrowRight')).toBe('x86-64')
        expect(press('ArrowDown')).toBe('Z80')
        expect(press('ArrowRight')).toBe('M68K')
        expect(press('ArrowLeft')).toBe('Z80')
        expect(press('ArrowUp')).toBe('x86-64')
        expect(press('Home')).toBe('M68K')
        expect(press('End')).toBe('Z80')
        expect(view.tiles().filter((tile) => tile.tabIndex === 0)).toHaveLength(1)
        expect(localStorage.getItem(STORAGE_KEY)).toBe('Z80')
    } finally {
        await view.dispose()
    }
})

it('opens on the set picked last time, and ignores a stored value that is no set', async () => {
    localStorage.setItem(STORAGE_KEY, 'MIPS')
    let view = await page()
    try {
        expect(view.picked()).toBe('MIPS')
        expect(view.compatible()).toBe('MARS')
        expect(view.capabilities()).toContain('C/C++')
    } finally {
        await view.dispose()
    }
    localStorage.setItem(STORAGE_KEY, 'ARM')
    view = await page()
    try {
        expect(view.picked()).toBe('RISC-V-64')
    } finally {
        await view.dispose()
    }
})

it('describes the template picked, and falls back to the empty program where it is missing', async () => {
    const view = await page()
    try {
        const select = view.target.querySelector<HTMLButtonElement>('[role="combobox"]')!
        const description = () =>
            document.getElementById(select.getAttribute('aria-describedby')!)?.textContent?.trim()
        expect(select.textContent?.trim()).toBe('Empty program')
        expect(description()).toBe('What barebones does in RISC-V-64.')

        select.click()
        await tick()
        const tune = [...view.target.querySelectorAll<HTMLElement>('[role="option"]')].find(
            (option) => option.textContent?.includes('Program tune')
        )!
        tune.click()
        flushSync()
        expect(select.textContent?.trim()).toBe('Program tune')
        expect(description()).toBe('What tune does in RISC-V-64.')

        view.pick('x86-64')
        expect(select.textContent?.trim()).toBe('Empty program')
        expect(description()).toBe('What barebones does in X86.')
    } finally {
        await view.dispose()
    }
})

it('creates the Project with the set and template picked and opens it', async () => {
    vi.spyOn(toast, 'logPill').mockImplementation(() => undefined)
    const view = await page()
    try {
        view.pick('MIPS')
        const name = view.target.querySelector<HTMLInputElement>('input.text-field')!
        name.value = 'Sorting'
        name.dispatchEvent(new Event('input', { bubbles: true }))
        const create = [...view.target.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Create project'
        )!
        expect(create.type).toBe('submit')
        create.click()
        await vi.waitFor(async () => expect(await db.getProjects()).toHaveLength(1))
        const [project] = await db.getProjects()
        expect(project.name).toBe('Sorting')
        expect(project.language).toBe('MIPS')
        expect(Object.values(project.files)).toContainEqual(
            expect.objectContaining({ content: '; barebones in MIPS' })
        )
        await vi.waitFor(() => expect(goto).toHaveBeenCalledWith(`/projects/${project.id}`))
    } finally {
        await view.dispose()
    }
})

it('takes the keyboard through the set picked, the template, the name, the description, Cancel, Create, then the drop zone', async () => {
    const view = await page()
    try {
        const reachable = [
            ...view.target.querySelectorAll<HTMLElement>(
                '.create-project :is(a[href], button, input, textarea)'
            )
        ].filter((element) => element.tabIndex >= 0 && !element.hidden)
        const names = reachable.map(
            (element) =>
                element.ariaLabel ??
                element.closest('label')?.querySelector('span')?.textContent ??
                (element.getAttribute('role') === 'combobox' ? 'Template' : null) ??
                element.textContent?.trim().split(',')[0]
        )
        expect(names).toEqual([
            'Follow the getting-started guide',
            'RISC-V-64',
            'Template',
            'Name',
            'Description',
            'Cancel',
            'Create project',
            'Already have a program? Drop it here'
        ])
    } finally {
        await view.dispose()
    }
})
