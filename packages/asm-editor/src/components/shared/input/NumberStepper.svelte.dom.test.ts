/**
 * The number stepper: − and + step within its limits and disable at them, and a number typed is
 * the value as it is typed, brought within the limits once committed.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import NumberStepper from './NumberStepper.svelte'

const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

function setup(value: number, target: HTMLElement = document.createElement('div')) {
    document.body.append(target)
    const settled: number[] = []
    const props = $state({ value })
    const stepper = mount(NumberStepper, {
        target,
        props: {
            get value() {
                return props.value
            },
            set value(next: number) {
                props.value = next
            },
            min: 1,
            max: 4,
            ariaLabel: 'Size',
            onchange: (next: number) => settled.push(next)
        }
    })
    mounted.push(() => unmount(stepper))
    flushSync()
    const button = (label: string) =>
        target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    const field = target.querySelector<HTMLInputElement>('input[aria-label="Size"]')!
    return { props, settled, button, field }
}

describe('the number stepper', () => {
    it('steps with − and +, within its limits, which disable them', () => {
        const stepper = setup(3)
        stepper.button('More Size').click()
        flushSync()
        expect(stepper.props.value).toBe(4)
        expect(stepper.button('More Size').disabled).toBe(true)
        stepper.button('Less Size').click()
        stepper.button('Less Size').click()
        stepper.button('Less Size').click()
        flushSync()
        expect(stepper.props.value).toBe(1)
        expect(stepper.button('Less Size').disabled).toBe(true)
        expect(stepper.settled).toEqual([4, 3, 2, 1])
    })

    it('takes what is typed as it is typed, and within its limits once committed', () => {
        const stepper = setup(2)
        stepper.field.value = '9'
        stepper.field.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        //a form can say at once why the number will not do
        expect(stepper.props.value).toBe(9)
        expect(stepper.settled).toEqual([])
        stepper.field.dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        expect(stepper.props.value).toBe(4)
        expect(stepper.field.value).toBe('4')
        expect(stepper.settled).toEqual([4])
        //nothing a number keeps the value it had
        stepper.field.value = ''
        stepper.field.dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        expect(stepper.field.value).toBe('4')
    })

    it('is its field to a label around it, so the label never presses − or +', () => {
        const label = document.createElement('label')
        const text = document.createElement('span')
        text.textContent = 'Size'
        label.append(text)
        const stepper = setup(3, label)
        text.click()
        flushSync()
        expect(stepper.props.value).toBe(3)
        expect(stepper.settled).toEqual([])
    })
})
