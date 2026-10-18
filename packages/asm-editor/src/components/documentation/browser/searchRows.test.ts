import { describe, expect, it } from 'vite-plus/test'
import { render } from 'svelte/server'
import DOMPurify from 'isomorphic-dompurify'
import type { EntryDocument } from '#lib/search/payload.ts'
import EntryRow from './EntryRow.svelte'
import { fromIndex } from './fromIndex'

const document: EntryDocument = {
    id: 'mips/instructions/add',
    language: 'mips',
    chapter: 'instructions',
    chapterTitle: 'Instructions',
    entryKind: 'instruction',
    title: 'add',
    names: ['add'],
    signature: '$t1, $t2, $t3',
    category: 'arithmetic',
    summary: 'Adds two registers.',
    text: 'Adds two registers.',
    code: 'add $t1,$t2,$t3',
    href: '/documentation/mips/instruction/add'
}

function row(showCategory: boolean): HTMLElement {
    const result = render(EntryRow, {
        props: { entry: fromIndex(document), expanded: false, ontoggle: () => {}, showCategory }
    })
    return DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
}

describe('a search result row', () => {
    it('keeps the category of an entry rebuilt from the index', () => {
        expect(fromIndex(document).category).toBe('arithmetic')
        expect('category' in fromIndex({ ...document, category: undefined })).toBe(false)
    })

    it('names the category beside the signature while searching, and not while browsing', () => {
        const searching = row(true)
        expect(searching.querySelector('.line .signature + .category')?.textContent).toBe(
            'Arithmetic'
        )
        expect(row(false).querySelector('.category')).toBeNull()
    })
})
