import type { InstructionForm, Processor } from '@specy/s68k'
import { isM68kBitFieldForm } from '#lib/documentation/instructions/formTags.ts'

/**
 * A program's **Processor dialect**: the processor its `opt p=` line chose, the 68000 when it chose
 * none, and whether it has the 68020's bit fields, through `opt bit` or `opt p=68020`
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3). s68k's assembly
 * says it whether or not the source has an error, so live checking knows it as the code is typed.
 */
export type M68kDialect = { processor: Processor; bitFields: boolean }

/** What something of the M68K needs: the first processor that has it, and whether `opt bit` gives it. */
export type M68kNeeds = { processor: Processor; bitField?: boolean }

/** s68k's processors, oldest first, each with everything the one before it has. */
export const M68K_PROCESSORS: readonly Processor[] = ['68000', '68010', '68020']

/**
 * Whether a program written for `dialect` has what `needs` says, which is the one rule the
 * Workbench's Documentation panel, its search results and completion follow to leave out what a
 * later processor brought ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
 * decision 36): a 68010 program has the 68000's and the 68010's, and a bit field is there too
 * under `opt bit`.
 */
export function m68kDialectHas(dialect: M68kDialect, needs: M68kNeeds): boolean {
    return (
        M68K_PROCESSORS.indexOf(needs.processor) <= M68K_PROCESSORS.indexOf(dialect.processor) ||
        (!!needs.bitField && dialect.bitFields)
    )
}

/** Whether a program written for `dialect` can write a form of s68k's instruction table. */
export function m68kFormShown(
    form: Pick<InstructionForm, 'processor' | 'operands'>,
    dialect: M68kDialect
): boolean {
    return m68kDialectHas(dialect, {
        processor: form.processor,
        bitField: isM68kBitFieldForm(form)
    })
}

/**
 * A dialect as one word, `68000+bit`: an analysis on every keystroke makes a new object for the
 * same dialect, and what follows the dialect follows this instead.
 */
export function m68kDialectKey(dialect: M68kDialect): string {
    return dialect.bitFields && dialect.processor !== '68020'
        ? `${dialect.processor}+bit`
        : dialect.processor
}

/**
 * The switch for the "68000 · 68010 · 68020" choice in the Documentation panel's header, which lets
 * a reader look at what a later processor brought, or an earlier one has, without editing the code:
 * it follows the program's processor until the reader picks one
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36). Off, by the
 * owner's call, while the program's `opt p=` line stays the only place a processor is chosen; the
 * code it guards is kept so that turning it on need not rebuild it, and its tests turn it on.
 */
export const m68kProcessorSwitch = { enabled: false }

/**
 * The dialect the panel shows a reader who picked `processor` with the switch: that processor,
 * with the bit fields the 68020 has, and those `opt bit` gives the program when it is for an
 * earlier one.
 */
export function m68kLookAhead(program: M68kDialect, processor: Processor): M68kDialect {
    const optBit = program.bitFields && program.processor !== '68020'
    return { processor, bitFields: processor === '68020' || optBit }
}
