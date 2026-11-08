/**
 * A number Project Setting: only a value that changes is a decision, an emptied or negative field
 * is put back, and a fraction is taken as the Setting takes one.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ProjectSetting from './ProjectSetting.svelte'
import { PROJECT_SETTINGS } from '#lib/projectSettings.ts'

const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

function setup() {
    const target = document.createElement('div')
    document.body.append(target)
    const decided: unknown[] = []
    const props = $state({ value: 64 as unknown, decided: false })
    const setting = mount(ProjectSetting, {
        target,
        props: {
            declaration: PROJECT_SETTINGS.screenHistoryBudgetMb,
            get value() {
                return props.value as number
            },
            get decided() {
                return props.decided
            },
            onDecide: (value: unknown) => {
                decided.push(value)
                props.value = value
                props.decided = true
            },
            onReset: () => {}
        }
    })
    mounted.push(() => unmount(setting))
    flushSync()
    const field = target.querySelector<HTMLInputElement>(
        'input[aria-label="Screen undo history budget (MB)"]'
    )!
    const commit = (text: string) => {
        field.value = text
        field.dispatchEvent(new Event('input', { bubbles: true }))
        field.dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
    }
    return { decided, field, commit, target }
}

describe('a number Project Setting', () => {
    it('decides only a value that changes, and puts an emptied or negative field back', () => {
        const setting = setup()
        setting.commit('')
        expect(setting.field.value).toBe('64')
        setting.commit('64')
        setting.commit('-3')
        expect(setting.field.value).toBe('64')
        expect(setting.decided).toEqual([])
        //no Reset until something is decided
        expect(setting.target.querySelector('button[aria-label="Reset"]')).toBeNull()
        setting.commit('1.5')
        expect(setting.decided).toEqual([1.5])
        expect(setting.field.value).toBe('1.5')
    })
})
