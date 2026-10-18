import { describe, expect, it } from 'vite-plus/test'
import {
    X86_FLAG_ORDER,
    X86_INSTRUCTION_FLAGS,
    type X86FlagKind,
    type X86InstructionFlags
} from './generated/x86Flags'
import { x86DocumentedNames } from './X86-documentation'

const STATUS = ['CF', 'PF', 'AF', 'ZF', 'SF', 'OF'] as const

function flagsOf(name: string): X86InstructionFlags {
    const flags = X86_INSTRUCTION_FLAGS[name]
    if (!flags) throw new Error(`no flags for ${name}`)
    return flags
}

/** `{ CF: 'changed', … }`, without the notes. */
function kinds(name: string): Record<string, X86FlagKind> {
    return Object.fromEntries(
        Object.entries(flagsOf(name).marks).map(([flag, mark]) => [flag, mark.kind])
    )
}

describe('the flags XED gives each documented instruction', () => {
    it('covers the documented set, but for the three XED does not know', () => {
        const missing = x86DocumentedNames.filter((name) => !X86_INSTRUCTION_FLAGS[name])
        // `ibts` and `xbts` are a 386 A-step pair Intel withdrew, `jmpe` is the IA-64 escape.
        expect(missing.sort()).toEqual(['ibts', 'jmpe', 'xbts'])
        const documented = new Set(x86DocumentedNames)
        expect(Object.keys(X86_INSTRUCTION_FLAGS).filter((name) => !documented.has(name))).toEqual(
            []
        )
    })

    it('changes all six status flags on add', () => {
        for (const flag of STATUS) expect(kinds('add')[flag], flag).toBe('changed')
        expect(kinds('add').DF).toBe('unchanged')
        expect(flagsOf('add').reads).toEqual([])
    })

    it('leaves the carry alone on inc', () => {
        expect(kinds('inc').CF).toBe('unchanged')
        for (const flag of ['PF', 'AF', 'ZF', 'SF', 'OF']) {
            expect(kinds('inc')[flag], flag).toBe('changed')
        }
    })

    it('reads the flags on cmovle and writes none, under every spelling of the condition', () => {
        for (const flag of STATUS) expect(kinds('cmovle')[flag], flag).toBe('unchanged')
        expect(flagsOf('cmovle').reads).toEqual(['ZF', 'SF', 'OF'])
        expect(flagsOf('cmovng')).toEqual(flagsOf('cmovle'))
        expect(flagsOf('cmovng').xed).toEqual(['CMOVLE'])
        expect(flagsOf('jle').reads).toEqual(['ZF', 'SF', 'OF'])
        expect(flagsOf('setne').reads).toEqual(['ZF'])
    })

    it('clears the carry on clc and sets it on stc', () => {
        expect(kinds('clc').CF).toBe('cleared')
        expect(kinds('stc').CF).toBe('set')
        expect(kinds('cld').DF).toBe('cleared')
        expect(kinds('std').DF).toBe('set')
        expect(kinds('and')).toMatchObject({ CF: 'cleared', OF: 'cleared', AF: 'undefined' })
    })

    it('says when a shift defines OF, and that a count of 0 changes nothing', () => {
        const shl = flagsOf('shl')
        expect(shl.marks.OF).toEqual({ kind: 'undefined', note: 'defined only for a count of 1' })
        expect(shl.marks.CF).toEqual({ kind: 'changed' })
        expect(shl.marks.AF.kind).toBe('undefined')
        expect(shl.note).toBe('A count of 0 leaves every flag unchanged.')
        // `sal` is the same instruction, which XED files under SHL.
        expect(flagsOf('sal')).toEqual(shl)
        expect(flagsOf('rcl').reads).toEqual(['CF'])
        expect(kinds('rol')).toMatchObject({ CF: 'changed', ZF: 'unchanged', OF: 'undefined' })
    })

    it('touches nothing on mov', () => {
        expect(Object.values(kinds('mov'))).toEqual(Array(7).fill('unchanged'))
        expect(flagsOf('mov').reads).toEqual([])
        expect(flagsOf('mov').note).toBeUndefined()
    })

    it('says where a loaded flag comes from', () => {
        expect(flagsOf('sahf').marks.ZF).toEqual({ kind: 'changed', note: 'loaded from AH' })
        expect(flagsOf('popf').marks.DF).toEqual({
            kind: 'changed',
            note: 'loaded from the stack'
        })
        expect(flagsOf('lahf').reads).toEqual(['CF', 'PF', 'AF', 'ZF', 'SF'])
    })

    it('shows what a program here sees after syscall, not what the kernel saw', () => {
        expect(Object.values(kinds('syscall'))).toEqual(Array(7).fill('unchanged'))
        expect(flagsOf('syscall').note).toContain('r11')
    })

    it('keeps every strip in the order of the registers panel, TF and IF only when written', () => {
        for (const [name, flags] of Object.entries(X86_INSTRUCTION_FLAGS)) {
            const order = Object.keys(flags.marks)
            expect(order, name).toEqual(X86_FLAG_ORDER.filter((flag) => order.includes(flag)))
            for (const flag of [...STATUS, 'DF'] as const)
                expect(flags.marks[flag], name).toBeDefined()
            for (const flag of ['TF', 'IF'] as const) {
                const mark = flags.marks[flag]
                if (mark) expect(mark.kind, name).not.toBe('unchanged')
            }
            expect(flags.reads, name).toEqual(X86_FLAG_ORDER.filter((f) => flags.reads.includes(f)))
        }
        expect(kinds('cli').IF).toBe('changed')
        expect(kinds('add').IF).toBeUndefined()
    })
})
