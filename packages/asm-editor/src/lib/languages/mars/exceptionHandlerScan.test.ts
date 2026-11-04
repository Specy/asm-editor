/**
 * The Hint on a File a Build leaves out, and the quick scan that finds an exception handler in a
 * MIPS File: a `.ktext` the GNU profile takes, outside a false `.if`, and the global label at its
 * start.
 */
import { describe, expect, it, vi } from 'vite-plus/test'
import { exceptionHandler, NOT_LINKED_MESSAGE, notLinkedMessage } from './exceptionHandlerScan'
import { mipsNotLinkedHint } from './marsCheck'
import { normalizeBuildInput } from '#lib/projectFiles.ts'

const named = (name: string) =>
    `${NOT_LINKED_MESSAGE} Its exception handler never runs. To include it, write \`SIM_LINK(${name});\` in one of your C files, outside any function.`
const unnamed = `${NOT_LINKED_MESSAGE} Its exception handler never runs. To include it, give the handler a name with \`.globl\`, then write \`SIM_LINK(that_name);\` in one of your C files, outside any function.`

describe('the Hint on a File the program does not use', () => {
    it('says it plainly', () => {
        expect(NOT_LINKED_MESSAGE).toBe("The program doesn't use this File, so it is left out.")
        expect(notLinkedMessage('\t.text\nhelper:\n\tjr $ra\n')).toBe(NOT_LINKED_MESSAGE)
        expect(notLinkedMessage(undefined)).toBe(NOT_LINKED_MESSAGE)
    })

    it('names the global label at the start of its .ktext', () => {
        expect(
            notLinkedMessage(
                '\t.globl\tkernel_entry\n\t.ktext\nkernel_entry:\n\tmfc0 $k0, $14\n\teret\n'
            )
        ).toBe(named('kernel_entry'))
        //as a compiler writes it: the directives between `.ktext` and the label start nothing,
        //and the `.globl` may come after the handler
        expect(
            notLinkedMessage(
                '\t.section .ktext,"ax",@progbits\n\t.align\t2\n\t.ent\thandler\nhandler:\n\teret\n\t.end\thandler\n\t.globl handler\n'
            )
        ).toBe(named('handler'))
        expect(notLinkedMessage('\t.ktext 0x80000180\nentry: eret\n\t.global entry')).toBe(
            named('entry')
        )
    })

    it('says to give it a name when the label at its start is not global, or there is none', () => {
        expect(notLinkedMessage('\t.ktext\nhandler:\n\teret\n')).toBe(unnamed)
        expect(
            notLinkedMessage('\t.globl later\n\t.ktext\n\tmfc0 $k0, $13\nlater:\n\teret\n')
        ).toBe(unnamed)
        //a MARS lab: its `.ktext` names the address the GNU profile places it at
        expect(notLinkedMessage('\t.text\nloop: j loop\n\t.ktext 0x80000180\n\teret\n')).toBe(
            unnamed
        )
    })

    it('leaves out a .ktext the GNU profile would refuse, or that a false .if or a macro holds', () => {
        //another address, two operands, a comment or a string
        expect(exceptionHandler('\t.ktext 0x80001000\nh: eret\n')).toBeUndefined()
        expect(exceptionHandler('\t.ktext 1, 2\nh: eret\n')).toBeUndefined()
        expect(exceptionHandler('# .ktext\n\t.asciiz "# .ktext"\n')).toBeUndefined()
        expect(exceptionHandler('\t.if 0\n\t.ktext\nh: eret\n\t.endif\n')).toBeUndefined()
        expect(exceptionHandler('\t.set ON, 0\n\t.if ON\n\t.ktext\n\t.endif\n')).toBeUndefined()
        expect(
            exceptionHandler('\t.ifdef NEVER\n\t.ktext\n\t.else\n\tnop\n\t.endif\n')
        ).toBeUndefined()
        expect(
            exceptionHandler('\t.if 1\n\t.if 0\n\t.else\n\t.endif\n\t.else\n\t.ktext\n\t.endif')
        ).toBeUndefined()
        expect(exceptionHandler('\t.macro handler\n\t.ktext\n\t.endm\n')).toBeUndefined()
    })

    it('takes a .ktext in a true .if, an .else after a false one, or a condition it cannot work out', () => {
        expect(exceptionHandler('\t.if 1\n\t.ktext\n\t.endif\n')).toEqual({})
        expect(
            exceptionHandler('\t.if 0\n\tnop\n\t.else\n\t.globl h\n\t.ktext\nh: eret\n\t.endif')
        ).toEqual({
            name: 'h'
        })
        expect(exceptionHandler('h:\n\t.ifdef h\n\t.ktext\n\t.endif\n')).toEqual({})
        expect(exceptionHandler('\t.if SOMETHING_ELSE + 1\n\t.ktext\n\t.endif\n')).toEqual({})
    })

    it('takes .section ".ktext" and .pushsection .ktext as the GNU profile does', () => {
        expect(exceptionHandler('\t.section ".ktext","ax"\nh: eret\n\t.globl h')).toEqual({
            name: 'h'
        })
        expect(exceptionHandler('\t.pushsection .ktext\nh: eret\n\t.popsection')).toEqual({})
        expect(exceptionHandler('\t.section .ktextual\nh: eret')).toBeUndefined()
    })

    it('leaves out a .ktext in a comment over several lines, or in a body repeated no time', () => {
        expect(exceptionHandler('/* the handler\n\t.ktext\nh: eret\n*/\n\tnop')).toBeUndefined()
        expect(exceptionHandler('\tnop /* .ktext */ \n')).toBeUndefined()
        expect(exceptionHandler('\t.rept 0\n\t.ktext\n\t.endr\n')).toBeUndefined()
        expect(exceptionHandler('\t.rept 2\n\tnop\n\t.endr\n\t.ktext\n')).toEqual({})
        expect(exceptionHandler('/* */\t.ktext\n')).toEqual({})
    })

    it('reads a File only once it may hold a .ktext', () => {
        const split = vi.spyOn(String.prototype, 'split')
        expect(exceptionHandler('main: nop\n'.repeat(1000))).toBeUndefined()
        expect(split).not.toHaveBeenCalled()
        split.mockRestore()
    })

    it('scans a File once a record, however many checks ask for its Hint', () => {
        const sources = normalizeBuildInput({
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'handler.s': { encoding: 'plain', content: '\t.globl h\n\t.ktext\nh: eret\n' }
            }
        })
        const split = vi.spyOn(String.prototype, 'split')
        const reads = () =>
            split.mock.contexts.filter(
                (text) => String(text) === sources.files['handler.s'].content
            ).length
        expect(mipsNotLinkedHint(sources, 'handler.s')).toBe(named('h'))
        expect(mipsNotLinkedHint(sources, 'handler.s')).toBe(named('h'))
        expect(reads()).toBe(1)
        split.mockRestore()
    })
})
