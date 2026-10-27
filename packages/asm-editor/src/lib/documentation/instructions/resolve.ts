import type { DocumentationEntry } from '../entries'
import type { InstructionContent } from './content'
import { mnemonicTags, type InstructionCategory, type InstructionTag } from './categories'

/**
 * Pages, the panel and search receive the same authored supplement on the existing entry. An
 * authored description follows the entry's summary rather than restating it, so the summary stays
 * and the description joins what search reads.
 */
export function withInstructionContent(
    entry: DocumentationEntry,
    content: InstructionContent | undefined
): DocumentationEntry {
    if (!content) return entry
    return {
        ...entry,
        instructionContent: content,
        ...(content.description ? { detailText: content.description } : {}),
        code:
            [...new Set([entry.code, content.example?.code].filter(Boolean))].join('\n') ||
            undefined
    }
}

/**
 * An instruction entry with its **Instruction category** and the tags all of its forms share. The
 * category stays out of `searchText`: the index carries it as a field of its own, so it never
 * changes an entry's embedding.
 */
export function withInstructionCategory(
    entry: DocumentationEntry,
    category: InstructionCategory | undefined,
    formTags: readonly (readonly InstructionTag[])[] = []
): DocumentationEntry {
    const tags = mnemonicTags(formTags)
    return {
        ...entry,
        ...(category ? { category } : {}),
        ...(tags.length > 0 ? { tags } : {})
    }
}
