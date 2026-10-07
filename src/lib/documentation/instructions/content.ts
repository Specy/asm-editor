import type { AvailableLanguages } from '$lib/Project.svelte'
import type { RegisterFormat } from '$lib/languages/commonLanguageFeatures.svelte'

/** Authored content supplements a Core's instruction forms without changing them. */
export type InstructionContent = {
    /** Optional authored Markdown. Existing Core descriptions are used when absent. */
    description?: string
    example?: InstructionExample
}

export type InstructionExample = {
    target: AvailableLanguages
    code: string
    /** Presentation only: every machine-state dependency belongs in the source. */
    presentation?: {
        showMemory?: boolean
        showConsole?: boolean
        showPc?: boolean
        showFlags?: boolean
        initialRegisterFile?: string
        initialRegisterFormat?: RegisterFormat
    }
}

export type InstructionExampleMetadata = Omit<InstructionExample, 'code'>

export function instructionDescription(
    content: InstructionContent | undefined,
    coreDescription: string
): string {
    return content?.description?.trim() ? content.description : coreDescription
}

/**
 * Raw assembly files are the authored programs; a language's registry names their execution
 * Target and presentation. This helper neither loads Cores nor infers instruction semantics.
 */
export function instructionContentFromFiles(
    files: Record<string, string>,
    metadata: Record<string, InstructionExampleMetadata>,
    descriptions: Record<string, string> = {}
): Record<string, InstructionContent> {
    const content: Record<string, InstructionContent> = Object.create(null)
    for (const [path, code] of Object.entries(files)) {
        const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.asm$/, '')
        const config = metadata[name]
        if (!config) throw new Error(`Instruction example ${name} has no metadata`)
        if (content[name]) throw new Error(`Duplicate instruction example ${name}`)
        if (!code.trim()) throw new Error(`Instruction example ${name} is empty`)
        content[name] = { example: { ...config, code } }
    }
    for (const name of Object.keys(metadata)) {
        if (!content[name]) throw new Error(`Instruction example ${name} has no source`)
    }
    for (const [name, description] of Object.entries(descriptions)) {
        content[name] = { ...content[name], description }
    }
    return content
}
