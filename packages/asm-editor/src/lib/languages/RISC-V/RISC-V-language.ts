import type { MonacoType } from '#lib/monaco/Monaco.ts'
import type monaco from 'monaco-editor'
import {
    RISCVAddressingModes,
    riscvDirectivesForProfile,
    type RISCVInstruction,
    riscvInstructionMap,
    riscvVariantOperands
} from './RISC-V-documentation'
import { RISCVLanguageRegisterNames as RISCVRegisterNames } from './RISC-V-registers'
import { modelSources } from '#lib/languages/service/sessionRegistry.ts'
import type { AssemblyTextOptions } from '#lib/languages/service/assemblyText.ts'
import { riscvInstructionDocument } from '#lib/documentation/mars/instructionDocument.ts'
import {
    createMarsCompletion,
    createMarsHover,
    createMarsSignatureHelp,
    type MarsDialect
} from '#lib/languages/mars/marsLanguage.ts'

export const RISCV_TEXT_OPTIONS = {
    comment: '#',
    sectionPattern: /^\.(?:text|data|ktext|kdata|bss|sbss|rodata|sdata|section)$/i,
    blockPairs: [
        { start: /^\s*\.macro\b/i, end: /^\s*\.(?:end_macro|endmacro)\b/i },
        { start: /^\s*\.(?:if|ifdef|ifndef|ifb|ifnb)\b/i, end: /^\s*\.endif\b/i }
    ]
} satisfies AssemblyTextOptions

function directivesForModel(model: monaco.editor.ITextModel) {
    return riscvDirectivesForProfile(modelSources(model)?.sources.assemblerProfile ?? 'rars')
}

/**
 * The dialect of RV32 or RV64. RV32 leaves out the forms only RV64 accepts, so it never offers or
 * documents a mnemonic RV64 only.
 */
function riscvDialect(is64: boolean): MarsDialect<RISCVInstruction> {
    const instructions = new Map<string, RISCVInstruction[]>()
    for (const [name, forms] of riscvInstructionMap) {
        const accepted = is64 ? forms : forms.filter((instruction) => !instruction.isRv64Only)
        if (accepted.length > 0) instructions.set(name, accepted)
    }
    return {
        textOptions: RISCV_TEXT_OPTIONS,
        triggerCharacters: ['.', ',', ' '],
        instructions,
        operands: riscvVariantOperands,
        directives: directivesForModel,
        registers: RISCVRegisterNames,
        registerPrefix: (lastArg) =>
            RISCVRegisterNames.some((r) => r.startsWith(lastArg.toLowerCase()))
                ? lastArg.toLowerCase()
                : undefined,
        registerInsert: (register) => register,
        hoverRegister: (word) => word.toLowerCase(),
        addressingModes: RISCVAddressingModes,
        runtimeLanguage: is64 ? 'RISC-V-64' : 'RISC-V',
        document: riscvInstructionDocument,
        docsPath: 'risc-v'
    }
}

const RV32_DIALECT = riscvDialect(false)
const RV64_DIALECT = riscvDialect(true)

export function createRISCVCompletion(
    monaco: MonacoType,
    is64 = false
): monaco.languages.CompletionItemProvider {
    return createMarsCompletion(monaco, is64 ? RV64_DIALECT : RV32_DIALECT)
}

export function createRISCVHoverProvider(
    monaco: MonacoType,
    is64 = false
): monaco.languages.HoverProvider {
    return createMarsHover(monaco, is64 ? RV64_DIALECT : RV32_DIALECT)
}

export function createRISCVSignatureHelpProvider(
    _monaco: MonacoType,
    is64 = false
): monaco.languages.SignatureHelpProvider {
    return createMarsSignatureHelp(is64 ? RV64_DIALECT : RV32_DIALECT)
}
