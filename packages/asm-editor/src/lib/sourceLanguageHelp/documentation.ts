import type { HelpEntry } from './types'

/** Metadata is text, not HTML or trusted Monaco command links. */
export function escapeMarkdown(text: string): string {
    return text.replace(/[\\`*_{}[\]()<>!#|]/g, '\\$&')
}

export function entryDocumentation(entry: HelpEntry): string {
    const header = entry.headers.map((name) => `\`<${name}>\``).join(' or ')
    const link =
        entry.href && /^\/documentation\/[A-Za-z0-9_/#-]+$/.test(entry.href)
            ? `\n\n[Read the documentation](${entry.href})`
            : ''
    return `${escapeMarkdown(entry.summary)}\n\nInclude ${header}.${link}`
}

export function entryHover(entry: HelpEntry): string {
    return `\`\`\`cpp\n${entry.declaration.replace(/`/g, '')}\n\`\`\`\n\n${entryDocumentation(entry)}`
}
