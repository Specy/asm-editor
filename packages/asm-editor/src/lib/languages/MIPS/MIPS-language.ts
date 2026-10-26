import type { MonacoType } from '#lib/monaco/Monaco.ts'
import type monaco from 'monaco-editor'
import {
    MIPSAddressingModes,
    mipsDirectivesMap,
    mipsInstructionMap,
    mipsVariantOperands,
    type MIPSInstruction
} from './MIPS-documentation'
import { MIPSNumericRegisterNames } from './MIPS-registers'
import type { AssemblyTextOptions } from '#lib/languages/service/assemblyText.ts'
import { mipsInstructionDocument } from '#lib/documentation/mars/instructionDocument.ts'
import {
    createMarsCompletion,
    createMarsHover,
    createMarsSignatureHelp,
    type MarsDialect
} from '#lib/languages/mars/marsLanguage.ts'

export const MIPS_TEXT_OPTIONS = {
    comment: '#',
    sectionPattern: /^\.(?:text|data|ktext|kdata|bss|sbss|rdata|sdata|section)$/i,
    blockPairs: [
        { start: /^\s*\.macro\b/i, end: /^\s*\.(?:end_macro|endmacro)\b/i },
        { start: /^\s*\.(?:if|ifdef|ifndef|ifb|ifnb)\b/i, end: /^\s*\.endif\b/i }
    ]
} satisfies AssemblyTextOptions

/**
 * MIPS writes its registers with a `$`, which Monaco's word leaves out: completion offers registers
 * once the `$` is typed and inserts the rest of the name, and a hover finds the register by the name
 * after it.
 */
const MIPS_DIALECT: MarsDialect<MIPSInstruction> = {
    textOptions: MIPS_TEXT_OPTIONS,
    triggerCharacters: ['.', ',', ' ', '$'],
    instructions: mipsInstructionMap,
    operands: mipsVariantOperands,
    directives: () => mipsDirectivesMap,
    registers: [
        ...MIPSNumericRegisterNames,
        ...Array.from({ length: 32 }, (_, index) => `$f${index}`)
    ],
    registerPrefix: (lastArg) => (lastArg.startsWith('$') ? lastArg.toLowerCase() : undefined),
    registerInsert: (register) => register.substring(1),
    hoverRegister: (word) => `$${word.toLowerCase()}`,
    addressingModes: MIPSAddressingModes,
    runtimeLanguage: 'MIPS',
    document: mipsInstructionDocument,
    docsPath: 'mips'
}

export function createMIPSCompletion(monaco: MonacoType): monaco.languages.CompletionItemProvider {
    return createMarsCompletion(monaco, MIPS_DIALECT)
}

export function createMIPSHoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return createMarsHover(monaco, MIPS_DIALECT)
}

export function createMIPSSignatureHelpProvider(
    _monaco: MonacoType
): monaco.languages.SignatureHelpProvider {
    return createMarsSignatureHelp(MIPS_DIALECT)
}
