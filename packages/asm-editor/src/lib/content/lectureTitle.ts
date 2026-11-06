/**
 * A lecture's Markdown without the `# ` heading it may open with: the page shows the lecture's
 * name as its title already, so that heading would only repeat it. The source keeps it, for the
 * Markdown twin and anyone reading the file.
 */
export function withoutLeadingTitle(markdown: string): string {
    return markdown.replace(/^\s*# [^\n]*(\n\s*)?/, '')
}
