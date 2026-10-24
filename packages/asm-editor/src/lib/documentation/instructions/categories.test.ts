import { describe, expect, it } from 'vite-plus/test'
import {
    INSTRUCTION_CATEGORIES,
    categoryLabel,
    categoryProblems,
    groupByCategory,
    mnemonicTags,
    tagLabel
} from './categories'
import { withInstructionCategory } from './resolve'
import type { DocumentationEntry } from '../entries'

describe('instruction categories', () => {
    it('names every category and tag for the reader', () => {
        expect(categoryLabel('load-and-store')).toBe('Load and store')
        expect(categoryLabel('input-output')).toBe('Input/output')
        expect(tagLabel('pseudo')).toBe('Pseudo-instruction')
        expect(tagLabel('rv64-only')).toBe('RV64 only')
        expect(new Set(INSTRUCTION_CATEGORIES.map((c) => c.id)).size).toBe(13)
    })

    it('shows beside a name only the tags every form has', () => {
        expect(mnemonicTags([['pseudo'], ['pseudo', 'rv64-only']])).toEqual(['pseudo'])
        expect(mnemonicTags([['pseudo'], []])).toEqual([])
        expect(mnemonicTags([['undocumented', 'pseudo']])).toEqual(['pseudo', 'undocumented'])
        expect(mnemonicTags([])).toEqual([])
    })

    it('groups in the shared order and keeps the order inside each group', () => {
        const table: Record<string, 'arithmetic' | 'data-movement' | 'control-flow'> = {
            add: 'arithmetic',
            beq: 'control-flow',
            li: 'data-movement',
            sub: 'arithmetic',
            j: 'control-flow'
        }
        const groups = groupByCategory(['add', 'beq', 'j', 'li', 'sub', 'nope'], (n) => table[n])
        expect(groups).toEqual([
            { category: 'data-movement', items: ['li'] },
            { category: 'arithmetic', items: ['add', 'sub'] },
            { category: 'control-flow', items: ['beq', 'j'] }
        ])
    })

    it('finds a missing mnemonic, a stray key and a category the language does not use', () => {
        expect(categoryProblems({ add: 'arithmetic' }, ['add'], 'mips')).toEqual([])
        expect(
            categoryProblems(
                { add: 'arithmetic', fadd: 'floating-point', ghost: 'logic' },
                ['add', 'fadd', 'sub'],
                'z80'
            )
        ).toEqual([
            'sub has no category',
            'fadd is floating-point, which z80 does not use',
            'ghost is not a documented mnemonic'
        ])
    })

    it('puts the category and the shared tags on an entry without touching its text', () => {
        const entry: DocumentationEntry = {
            id: 'mips/instructions/li',
            language: 'mips',
            chapter: 'instructions',
            kind: 'instruction',
            title: 'li',
            names: ['li'],
            summary: 'Load immediate.',
            href: '/documentation/mips/instruction/li',
            anchor: 'li',
            view: { type: 'markdown', markdown: 'li' },
            searchText: 'Load immediate.'
        }
        const resolved = withInstructionCategory(entry, 'data-movement', [['pseudo'], ['pseudo']])
        expect(resolved.category).toBe('data-movement')
        expect(resolved.tags).toEqual(['pseudo'])
        expect(resolved.searchText).toBe(entry.searchText)
        const plain = withInstructionCategory(entry, 'data-movement', [['pseudo'], []])
        expect(plain.tags).toBeUndefined()
    })
})
