import { describe, expect, it } from 'vite-plus/test'
import { chapters } from '../../documentation/x86/x86'
import { X86_DESCRIPTIONS } from './generated/x86Descriptions'

const descriptions = Object.entries(X86_DESCRIPTIONS)

/** The entries that hold `pattern`, for a failure that names them. */
function holding(pattern: RegExp): string[] {
    return descriptions
        .filter(([, entry]) => pattern.test(entry.description) || pattern.test(entry.title))
        .map(([name]) => name)
}

describe("the appendix's prose, converted", () => {
    it('leaves no NASM markup behind, even where the appendix wrapped it across lines', () => {
        expect(holding(/\\[A-Za-z]+\{/)).toEqual([])
        expect(X86_DESCRIPTIONS.mov.description).toContain('`MOV DS,EAX`')
        expect(X86_DESCRIPTIONS.lea.description).toContain('`LEA EAX,[EBX+ECX*4+100]`')
    })

    it('names an instruction once, as a link, instead of pointing at its entry after naming it', () => {
        expect(holding(/`([^`]+)`\s+(?:instructions?\s+)?\((?:see\s+)?`\1`\)/)).toEqual([])
        expect(X86_DESCRIPTIONS.inc.description).toContain(
            'See also [`DEC`](/documentation/x86/instruction/dec).'
        )
        // An instruction without a page of its own is named and not linked.
        expect(X86_DESCRIPTIONS.cmovle.description).toContain('the `CPUID`\ninstruction will')
    })

    it('sends the condition code references to the table that has them', () => {
        expect(holding(/see the condition codes/)).toEqual([])
        expect(X86_DESCRIPTIONS.jle.description).toContain(
            '[the condition code table](/documentation/x86/registers#condition-codes)'
        )
        expect(X86_DESCRIPTIONS.cmovle.description).toContain(
            '[the condition code table](/documentation/x86/registers#condition-codes)'
        )
    })

    it('drops the references to tables nothing here has', () => {
        expect(holding(/the SSE condition predicates|the register values|described in \)/)).toEqual(
            []
        )
        expect(X86_DESCRIPTIONS.pusha.description).toContain(
            'in order of their numeric values\nin opcodes.'
        )
    })

    it('links only to pages that exist', () => {
        const hrefs = new Set(
            chapters().flatMap((chapter) => chapter.entries.map((entry) => entry.href))
        )
        const links = descriptions.flatMap(([name, entry]) =>
            [...entry.description.matchAll(/\]\((\/documentation\/[^)]+)\)/g)].map(
                (match) => [name, match[1]] as const
            )
        )
        expect(links.length).toBeGreaterThan(100)
        expect(links.filter(([, href]) => !hrefs.has(href))).toEqual([])
    })
})
