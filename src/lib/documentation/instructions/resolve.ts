import { summaryOf, type DocumentationEntry } from '../entries'
import { instructionDescription, type InstructionContent } from './content'

/** Pages, the panel and search receive the same authored supplement on the existing entry. */
export function withInstructionContent(
    entry: DocumentationEntry,
    content: InstructionContent | undefined
): DocumentationEntry {
    if (!content) return entry
    return {
        ...entry,
        instructionContent: content,
        summary: content.description
            ? summaryOf(instructionDescription(content, entry.summary))
            : entry.summary,
        searchText: [...new Set([content.description, entry.searchText].filter(Boolean))].join(
            '\n'
        ),
        code:
            [...new Set([entry.code, content.example?.code].filter(Boolean))].join('\n') ||
            undefined
    }
}
