import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import TabStrip from './TabStrip.svelte'

const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

/** A strip of three tabs whose host picks and closes them as FileTabs' session does. */
function render(closable = false, activation: 'automatic' | 'manual' = 'automatic') {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const picked: string[] = []
    const props = $state({
        tabs: ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase() })),
        selected: 'b' as string | undefined,
        ariaLabel: 'Files',
        activation,
        panelId: (id: string) => `panel-${id}`,
        onselect: (id: string) => {
            picked.push(id)
            props.selected = id
        },
        onclose: closable
            ? (id: string) => {
                  const index = props.tabs.findIndex((tab) => tab.id === id)
                  props.tabs = props.tabs.filter((tab) => tab.id !== id)
                  if (props.selected === id)
                      props.selected = props.tabs[Math.min(index, props.tabs.length - 1)]?.id
              }
            : undefined
    })
    const strip = mount(TabStrip, { target, props })
    mounted.push(() => unmount(strip))
    flushSync()
    const tabs = () => [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const closes = () => [...target.querySelectorAll<HTMLButtonElement>('.tab-close')]
    return {
        props,
        picked,
        tabs,
        closes,
        list: target.querySelector('[role="tablist"]')!,
        press: (key: string) => {
            ;(document.activeElement as HTMLElement).dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
            )
            flushSync()
        }
    }
}

describe('a strip of tabs', () => {
    it('is a tablist the Tab key enters once, on the picked tab', () => {
        const strip = render()
        expect(strip.list.getAttribute('aria-label')).toBe('Files')
        expect(strip.tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual([
            'false',
            'true',
            'false'
        ])
        expect(strip.tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1])
        expect(strip.tabs().map((tab) => tab.textContent?.trim())).toEqual(['A', 'B', 'C'])
    })

    it('moves with the arrow keys, wrapping at the ends, and picks the tab it reaches', () => {
        const strip = render()
        strip.tabs()[1].focus()
        strip.press('ArrowRight')
        expect(document.activeElement).toBe(strip.tabs()[2])
        expect(strip.props.selected).toBe('c')
        strip.press('ArrowRight')
        expect(document.activeElement).toBe(strip.tabs()[0])
        strip.press('ArrowLeft')
        expect(document.activeElement).toBe(strip.tabs()[2])
        expect(strip.picked).toEqual(['c', 'a', 'c'])
        expect(strip.tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, 0])
    })

    it('goes to the first and the last tab with Home and End', () => {
        const strip = render()
        strip.tabs()[1].focus()
        strip.press('Home')
        expect(document.activeElement).toBe(strip.tabs()[0])
        strip.press('End')
        expect(document.activeElement).toBe(strip.tabs()[2])
        expect(strip.props.selected).toBe('c')
    })

    it('leaves a key with a modifier to the page, such as a shortcut', () => {
        const strip = render()
        strip.tabs()[1].focus()
        const event = new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        })
        strip.tabs()[1].dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
        expect(strip.props.selected).toBe('b')
    })

    it('names the panel each tab shows', () => {
        const strip = render()
        expect(strip.tabs().map((tab) => tab.getAttribute('aria-controls'))).toEqual([
            'panel-a',
            'panel-b',
            'panel-c'
        ])
    })

    it('picks a tab on a click', () => {
        const strip = render()
        strip.tabs()[0].click()
        flushSync()
        expect(strip.props.selected).toBe('a')
        expect(strip.tabs()[0].getAttribute('aria-selected')).toBe('true')
    })
})

describe('closable tabs', () => {
    it("reach the picked tab's close button after the tab, and no other", () => {
        const strip = render(true)
        expect(strip.closes().map((close) => close.tabIndex)).toEqual([-1, 0, -1])
        expect(strip.closes()[1].getAttribute('aria-label')).toBe('Close B')
    })

    it('close with Delete, handing the keyboard to the tab picked after it', async () => {
        const strip = render(true)
        strip.tabs()[1].focus()
        strip.press('Delete')
        await tick()
        flushSync()
        expect(strip.props.tabs.map((tab) => tab.id)).toEqual(['a', 'c'])
        expect(document.activeElement).toBe(strip.tabs()[1])
        expect(strip.tabs()[1].textContent?.trim()).toBe('C')
        expect(strip.tabs()[1].tabIndex).toBe(0)
    })

    it('close with a middle click and with their close button', () => {
        const strip = render(true)
        strip.tabs()[0].dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }))
        flushSync()
        expect(strip.props.tabs.map((tab) => tab.id)).toEqual(['b', 'c'])
        strip.closes()[1].click()
        flushSync()
        expect(strip.props.tabs.map((tab) => tab.id)).toEqual(['b'])
    })
})

describe('manual activation', () => {
    it('moves the keyboard with the arrow keys, Home and End without picking a tab', () => {
        const strip = render(false, 'manual')
        strip.tabs()[1].focus()
        strip.press('ArrowRight')
        expect(document.activeElement).toBe(strip.tabs()[2])
        strip.press('Home')
        expect(document.activeElement).toBe(strip.tabs()[0])
        strip.press('End')
        expect(document.activeElement).toBe(strip.tabs()[2])
        expect(strip.picked).toEqual([])
        expect(strip.props.selected).toBe('b')
        //the Tab key comes back to the tab the keyboard is on, not to the picked one
        expect(strip.tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, 0])
        expect(strip.tabs()[1].getAttribute('aria-selected')).toBe('true')
    })

    it('picks the tab the keyboard is on with its button, which Enter and Space press', () => {
        //jsdom does not turn Enter or Space on a button into a click as a browser does, so the
        //click stands for them here
        const strip = render(false, 'manual')
        strip.tabs()[1].focus()
        strip.press('ArrowLeft')
        expect(strip.picked).toEqual([])
        ;(document.activeElement as HTMLButtonElement).click()
        flushSync()
        expect(strip.picked).toEqual(['a'])
        expect(strip.tabs()[0].getAttribute('aria-selected')).toBe('true')
    })

    it('still closes the tab the keyboard is on with Delete', async () => {
        const strip = render(true, 'manual')
        strip.tabs()[1].focus()
        strip.press('ArrowRight')
        strip.press('Delete')
        await tick()
        flushSync()
        expect(strip.props.tabs.map((tab) => tab.id)).toEqual(['a', 'b'])
        expect(strip.props.selected).toBe('b')
        expect(document.activeElement).toBe(strip.tabs()[1])
    })
})
