/**
 * The read-only notice over a Listing, a Pseudocode or a Runtime library member
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision
 * 16): Monaco's find widget opens in the same corner, so the notice hides while it is open.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
import LibraryMemberNotice from './LibraryMemberNotice.svelte'
import ListingNotice from './ListingNotice.svelte'
import PseudocodeNotice from './PseudocodeNotice.svelte'

let dispose = () => {}
afterEach(() => dispose())

function render<Props extends Record<string, unknown>>(
    component: Component<Props>,
    props: Omit<Props, 'findOpen'>
) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    let findOpen = $state(false)
    const mounted = mount(component, {
        target,
        props: {
            ...props,
            get findOpen() {
                return findOpen
            }
        } as unknown as Props
    })
    flushSync()
    dispose = () => {
        unmount(mounted)
        target.remove()
    }
    const notice = target.querySelector<HTMLElement>('.read-only-notice[role="status"]')!
    return {
        notice,
        setFindOpen(open: boolean) {
            findOpen = open
            flushSync()
        }
    }
}

describe('the read-only notice', () => {
    const cases = [
        [
            'Listing',
            () =>
                render(ListingNotice, {
                    document: { name: 'crackme', status: 'ready' } as ListingDocument
                })
        ],
        [
            'Pseudocode',
            () =>
                render(PseudocodeNotice, {
                    group: {
                        displayedPath: 'crackme',
                        pseudocodeListing: undefined,
                        pseudocodeFunction: { name: 'main' }
                    } as unknown as EditorGroup
                })
        ],
        [
            'Runtime library member',
            () => render(LibraryMemberNotice, { path: '@lib/stdio.c', onShowSource: () => {} })
        ]
    ] as const

    for (const [over, renderNotice] of cases)
        it(`over a ${over} hides while the find widget is open, and comes back after`, () => {
            const { notice, setFindOpen } = renderNotice()
            const title = notice.title
            expect(notice.classList).not.toContain('find-open')
            setFindOpen(true)
            expect(notice.classList).toContain('find-open')
            expect(notice.title).toBe(title)
            setFindOpen(false)
            expect(notice.classList).not.toContain('find-open')
        })
})

describe('the "?" of the Listing\'s and the Pseudocode\'s notices', () => {
    const pseudocode = {
        displayedPath: 'crackme',
        pseudocodeListing: undefined,
        pseudocodeFunction: { name: 'main' }
    } as unknown as EditorGroup

    it('asks what the view is, and opens its Documentation', () => {
        for (const [question, renderNotice] of [
            [
                'What is the Listing?',
                (onHelp?: () => void) =>
                    render(ListingNotice, {
                        document: { name: 'crackme', status: 'ready' } as ListingDocument,
                        onHelp
                    })
            ],
            [
                'What is the Pseudocode?',
                (onHelp?: () => void) => render(PseudocodeNotice, { group: pseudocode, onHelp })
            ]
        ] as const) {
            const onHelp = vi.fn()
            const { notice } = renderNotice(onHelp)
            const help = notice.querySelector<HTMLButtonElement>('button')!
            expect(help.textContent).toBe('?')
            expect(help.getAttribute('aria-label')).toBe(question)
            expect(help.title).toBe(question)
            help.click()
            expect(onHelp).toHaveBeenCalledOnce()
            dispose()
            //and none where the Workbench has no Documentation panel
            expect(renderNotice().notice.querySelector('button')).toBeNull()
            dispose()
        }
    })
})
