import type monaco from 'monaco-editor'
import { assemblyOperandContext, type AssemblyTextOptions } from './assemblyText'

/** One form of an operation as the signature popup shows it. */
export type OperandSignature = {
    label: string
    documentation?: string
    parameters: readonly string[]
}

/**
 * Signature help for a language whose operands follow the operation, separated by commas: the
 * operation's forms, the first one that still has an operand at the cursor made active, and the
 * active operand clamped to that form's last one.
 */
export function operandSignatureHelp(
    options: AssemblyTextOptions,
    triggers: string[],
    signaturesFor: (operation: string) => readonly OperandSignature[] | undefined
): monaco.languages.SignatureHelpProvider {
    return {
        signatureHelpTriggerCharacters: triggers,
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const context = assemblyOperandContext(prefix, options)
            const forms = context ? signaturesFor(context.operation) : undefined
            if (!context || !forms?.length) return null
            const found = forms.findIndex((form) => form.parameters.length > context.activeOperand)
            const activeSignature = found < 0 ? 0 : found
            return {
                value: {
                    signatures: forms.map((form) => ({
                        label: form.label,
                        documentation: form.documentation,
                        parameters: form.parameters.map((label) => ({ label }))
                    })),
                    activeSignature,
                    activeParameter: Math.min(
                        context.activeOperand,
                        Math.max(0, forms[activeSignature].parameters.length - 1)
                    )
                },
                dispose() {}
            }
        }
    }
}
