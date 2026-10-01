import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, tick, unmount } from 'svelte'
import TestcasesList from './TestcasesList.svelte'
import TestcasesSummary from './TestcasesSummary.svelte'
import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
import { Prompt } from '$stores/promptStore.svelte'

//nothing here goes near the database, but a shared component on the way could reach the projects
//store, which opens IndexedDB, which jsdom has not got
vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/**
 * The Testcases panel: the outcome of the last run on each row and inside it, a result going stale
 * when its Testcase is edited, and the values typed in place. The parsing and formatting under it
 * are tested on their own in `$lib/testcases.test.ts`; this file is named `.svelte.` so that the
 * Testcases can be `$state`, as the Project's are.
 */

function testcaseWith(part: Partial<Testcase>): Testcase {
    return {
        input: [],
        expectedOutput: '',
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: [],
        ...part
    }
}

const mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
    mounted.splice(0).forEach((component) => unmount(component))
    document.body.innerHTML = ''
})

function render(testcases: Testcase[], results: TestcaseResult[] = [], editable = true) {
    const props = $state({ testcases, testcasesResult: results })
    const target = document.createElement('div')
    document.body.appendChild(target)
    mounted.push(
        mount(TestcasesList, {
            target,
            props: {
                get testcases() {
                    return props.testcases
                },
                set testcases(value) {
                    props.testcases = value
                },
                get testcasesResult() {
                    return props.testcasesResult
                },
                registerNames: ['D0', 'D1', 'A0'],
                startingRegisterNames: ['D0', 'D1', 'A0'],
                systemSize: RegisterSize.Long,
                language: 'M68K',
                editable
            }
        })
    )
    flushSync()
    return { target, props }
}

function headers(target: HTMLElement) {
    return [...target.querySelectorAll<HTMLButtonElement>('.header')].map((header) => ({
        title: header.querySelector('.title')?.textContent?.trim(),
        status: header.querySelector('.status')?.textContent?.trim()
    }))
}

function type(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
}

function press(element: Element, key: string) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    flushSync()
}

function click(element: Element | null | undefined) {
    if (!element) throw new Error('nothing to click')
    ;(element as HTMLElement).click()
    flushSync()
}

/** Lets an awaited prompt answer reach the code waiting on it, then draws what it did. */
async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync()
}

function columns(target: HTMLElement) {
    return [...target.querySelectorAll('article')[0].querySelectorAll('.registers thead th')].map(
        (cell) => cell.textContent?.trim()
    )
}

function byLabel<T extends HTMLElement>(target: HTMLElement, label: string): T {
    const element = target.querySelector<T>(`[aria-label="${label}"]`)
    if (!element) throw new Error(`no element labelled ${label}`)
    return element
}

describe('TestcasesList', () => {
    const sum = testcaseWith({
        name: 'Sum two inputs',
        startingRegisters: { D0: 0x10n },
        expectedRegisters: { D0: 0x20n },
        input: ['10', '20'],
        expectedOutput: '30'
    })
    const zero = testcaseWith({ input: ['0'], expectedOutput: '0' })
    const overflow = testcaseWith({ name: 'Overflow at $FFFF' })
    const results: TestcaseResult[] = [
        {
            passed: false,
            testcase: structuredClone(sum),
            errors: [
                { type: 'wrong-register', register: 'D0', expected: 0x20n, got: 0x1en },
                { type: 'wrong-output', expected: '30', got: '30\n' }
            ]
        },
        { passed: true, testcase: structuredClone(zero), errors: [] }
    ]

    it("shows each Testcase's outcome in the last run", () => {
        const { target } = render(
            [structuredClone(sum), structuredClone(zero), structuredClone(overflow)],
            results
        )
        expect(headers(target)).toEqual([
            { title: 'Sum two inputs', status: '2 mismatches' },
            { title: 'Testcase 2', status: '1 check passed' },
            { title: 'Overflow at $FFFF', status: 'not run' }
        ])
        //the first one is open: its register row shows what the run found, in red
        const actual = target.querySelector('td.actual')
        expect(actual?.classList.contains('mismatch')).toBe(true)
        expect(actual?.textContent?.trim()).toBe('$001E')
        expect(target.querySelector('.verdict')?.textContent?.trim()).toBe('✗ differs')
        expect(target.querySelector('.difference')?.textContent).toBe(
            'First difference at character 3: expected the end, got "\\n".'
        )
    })

    it('reads a Testcase edited since the run as not run, and a renamed one as run', () => {
        const { target, props } = render([structuredClone(sum), structuredClone(zero)], results)
        props.testcases[1].name = 'Zero'
        flushSync()
        expect(headers(target)[1]).toEqual({ title: 'Zero', status: '1 check passed' })
        expect(columns(target)).toEqual(['Name', 'Start', 'Expected', 'Actual', 'Remove'])
        const output = target.querySelector<HTMLTextAreaElement>('textarea.output')!
        type(output, '31')
        expect(props.testcases[0].expectedOutput).toBe('31')
        expect(headers(target)[0].status).toBe('not run')
        //what a run found is only shown for a Testcase that has run
        expect(columns(target)).toEqual(['Name', 'Start', 'Expected', 'Remove'])
        expect(target.querySelector('td.actual')).toBeNull()
    })

    it('takes a register value in hex or decimal and shows it in hex', () => {
        const { target, props } = render([structuredClone(sum)])
        const expected = byLabel<HTMLInputElement>(target, 'D0 expected at the end')
        expect(expected.value).toBe('$0020')
        type(expected, '48')
        press(expected, 'Enter')
        expect(props.testcases[0].expectedRegisters).toEqual({ D0: 48n })
        expect(expected.value).toBe('$0030')
        type(expected, '0x31')
        press(expected, 'Enter')
        expect(props.testcases[0].expectedRegisters.D0).toBe(0x31n)
        type(expected, '-1')
        press(expected, 'Enter')
        expect(props.testcases[0].expectedRegisters.D0).toBe(-1n)
        expect(expected.value).toBe('$FFFFFFFF')
    })

    it('keeps text that is not a number out of the Testcase, and Escape puts the value back', () => {
        const { target, props } = render([structuredClone(sum)])
        const start = byLabel<HTMLInputElement>(target, 'D0 at the start')
        type(start, 'FF')
        press(start, 'Enter')
        expect(start.getAttribute('aria-invalid')).toBe('true')
        expect(start.title).toBe('write $FF for a hexadecimal number')
        expect(props.testcases[0].startingRegisters.D0).toBe(0x10n)
        press(start, 'Escape')
        expect(start.value).toBe('$0010')
        expect(start.getAttribute('aria-invalid')).toBe('false')
    })

    it('adds a register row before it has a value, and removes the register with its row', () => {
        const { target, props } = render([structuredClone(sum)])
        click(
            [...target.querySelectorAll('button')].find((b) =>
                b.textContent?.includes('Add register')
            )
        )
        const start = byLabel<HTMLInputElement>(target, 'D1 at the start')
        expect(start.value).toBe('')
        type(start, '$7')
        press(start, 'Enter')
        expect(props.testcases[0].startingRegisters).toEqual({ D0: 0x10n, D1: 7n })
        click(byLabel(target, 'Remove D0'))
        expect(props.testcases[0].startingRegisters).toEqual({ D1: 7n })
        expect(props.testcases[0].expectedRegisters).toEqual({})
    })

    it('gives every input request a box of its own', async () => {
        const { target, props } = render([structuredClone(sum)])
        const second = byLabel<HTMLInputElement>(target, 'Answer to input request 2')
        press(second, 'Enter')
        await tick()
        expect(props.testcases[0].input).toEqual(['10', '20', ''])
        const third = byLabel<HTMLInputElement>(target, 'Answer to input request 3')
        expect(document.activeElement).toBe(third)
        type(third, '5')
        expect(props.testcases[0].input).toEqual(['10', '20', '5'])
        type(third, '')
        press(third, 'Backspace')
        await tick()
        expect(props.testcases[0].input).toEqual(['10', '20'])
        expect(document.activeElement).toBe(second)
        click(byLabel(target, 'Remove answer 1'))
        expect(props.testcases[0].input).toEqual(['20'])
    })

    it('writes a memory value in the form under the table', () => {
        const { target, props } = render([structuredClone(sum)])
        click(
            [...target.querySelectorAll('button')].find((b) =>
                b.textContent?.includes('Add memory value')
            )
        )
        const form = target.querySelector('.memory-form')!
        const [address, value] = form.querySelectorAll<HTMLInputElement>('input')
        type(address, '$2000')
        type(value, '200')
        expect(form.querySelector('.echo')?.textContent).toBe('= $C8')
        type(value, '300')
        expect(form.querySelector('.error')?.textContent).toBe('300 does not fit 1 byte')
        type(value, '$C8')
        expect(form.querySelector('.echo')?.textContent).toBe('= 200')
        click([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save'))
        expect(props.testcases[0].startingMemory).toEqual([
            { type: 'number', address: 0x2000n, bytes: 1, expected: 200n }
        ])
        const row = target.querySelector('.memory button.row')!
        expect(row.textContent?.replace(/\s+/g, ' ').trim()).toBe('Start $2000 Number • 1B $C8')
    })

    it('moves a memory value to the other side, and writes a string with escapes', () => {
        const { target, props } = render([
            testcaseWith({
                startingMemory: [{ type: 'string-chunk', address: 0x3000n, expected: 'hi' }]
            })
        ])
        click(target.querySelector('.memory button.row'))
        const form = target.querySelector('.memory-form')!
        click([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Expect'))
        const [, text] = form.querySelectorAll<HTMLInputElement>('input')
        expect(text.value).toBe('hi')
        type(text, 'hi\\n')
        expect(form.querySelector('.echo')?.textContent).toBe('= 3 bytes')
        press(text, 'Enter')
        expect(props.testcases[0].startingMemory).toEqual([])
        expect(props.testcases[0].expectedMemory).toEqual([
            { type: 'string-chunk', address: 0x3000n, expected: 'hi\n' }
        ])
    })

    it('adds, duplicates and deletes Testcases, asking before it deletes', async () => {
        const { target, props } = render([structuredClone(sum)])
        click(target.querySelector('.new-testcase'))
        expect(props.testcases).toHaveLength(2)
        //the new one opens with the cursor in its name, the first field of its body
        const name = target.querySelectorAll('article')[1].querySelector('.body input')
        expect(document.activeElement).toBe(name)
        click(
            [...target.querySelectorAll('button')].find(
                (b) => b.textContent?.trim() === 'Duplicate'
            )
        )
        expect(props.testcases.map((testcase) => testcase.name)).toEqual([
            'Sum two inputs',
            'Sum two inputs (copy)',
            undefined
        ])
        expect(props.testcases[1].expectedRegisters).toEqual({ D0: 0x20n })
        expect(props.testcases[1]).not.toBe(props.testcases[0])
        const remove = () =>
            click(
                [...target.querySelectorAll('button')].find(
                    (b) => b.textContent?.trim() === 'Delete testcase'
                )
            )
        remove()
        expect(Prompt.question).toBe('Delete the testcase "Sum two inputs"?')
        Prompt.answerConfirm(false)
        await settle()
        expect(props.testcases).toHaveLength(3)
        remove()
        Prompt.answerConfirm(true)
        await settle()
        expect(props.testcases.map((testcase) => testcase.name)).toEqual([
            'Sum two inputs (copy)',
            undefined
        ])
    })

    it('shows a read-only Testcase without anything to edit', () => {
        const { target } = render([structuredClone(sum)], results, false)
        expect(target.querySelector('input, textarea, select')).toBeNull()
        expect(target.querySelector('.new-testcase')).toBeNull()
        expect(target.querySelector('.memory')).toBeNull()
        expect(target.querySelector('td.actual')?.textContent?.trim()).toBe('$001E')
    })
})

describe('TestcasesSummary', () => {
    const testcase = testcaseWith({ name: 'Sum', expectedOutput: '30' })

    function renderSummary(results: TestcaseResult[]) {
        const calls: string[] = []
        const target = document.createElement('div')
        document.body.appendChild(target)
        mounted.push(
            mount(TestcasesSummary, {
                target,
                props: {
                    testcases: [testcase],
                    results,
                    onRun: () => calls.push('run'),
                    onClear: () => calls.push('clear')
                }
            })
        )
        flushSync()
        const button = (label: string) =>
            [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
        return { target, calls, button }
    }

    it('counts the Testcases until a run, and has nothing to clear', () => {
        const { target, calls, button } = renderSummary([])
        expect(target.querySelector('.count')?.textContent?.trim()).toBe('1 testcase')
        expect(button('Clear').disabled).toBe(true)
        click(button('Run all'))
        expect(calls).toEqual(['run'])
    })

    it('says how many passed and clears the results', () => {
        const { target, calls, button } = renderSummary([
            { passed: true, errors: [], testcase: structuredClone(testcase) }
        ])
        expect(target.querySelector('.count')?.textContent?.trim()).toBe('1/1 passing')
        click(button('Clear'))
        expect(calls).toEqual(['clear'])
    })
})
