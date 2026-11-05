import { error } from '@sveltejs/kit'
import type { DocumentationLanguage } from '#lib/search/scope.ts'
import { DOCUMENTATION_LANGUAGES } from '#lib/search/scope.ts'
import { documentationFor } from '#lib/documentation/documentation.ts'
import {
    hasCodeName,
    type Chapter,
    type DocumentationEntry,
    type EntryField
} from '#lib/documentation/entries.ts'
import {
    DOCUMENTATION_ABOUT,
    DOCUMENTATION_INTRO,
    DOCUMENTATION_INTROS,
    DOCUMENTATION_SITES
} from '#lib/documentation/site.ts'
import {
    FLAG_MARK_MEANINGS,
    patternText,
    sectionHeading,
    type FlagMarks,
    type FlagStrip,
    type FormPattern,
    type InstructionDocument
} from '#lib/documentation/instructions/document.ts'
import {
    categoryLabel,
    groupByCategory,
    tagLabel
} from '#lib/documentation/instructions/categories.ts'
import { aliasTarget } from '#lib/documentation/instructions/aliases.ts'
import type { InstructionExample } from '#lib/documentation/instructions/content.ts'
import type { InstructionLesson } from '#lib/content/lectureInstructions.ts'
import { rewriteMarkdown, type LinkRewriter } from './rewrite'
import { twinLinks } from './links'
import { blocks, codeBlock, codeSpan, fenceName, link, linkText, oneLine } from './format'
import { absoluteUrl, documentationFullPathname, entryTwinPathname, twinPathname } from './urls'

/**
 * The **Markdown twins** of the Documentation, rendered from the Chapters and entries the pages
 * render ([ADR 0025](../../../../../docs/adr/0025-documentation-is-a-list-of-entries.md),
 * [ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)):
 * one renderer for each kind of entry view, as `EntryBody` has one, and the instruction document
 * as `InstructionDocumentView` lays it out.
 */

function twinUrl(pathname: string): string {
    return absoluteUrl(twinPathname(pathname) ?? pathname)
}

function languageTitle(language: DocumentationLanguage): string {
    return `${DOCUMENTATION_SITES[language].label} Documentation`
}

/** An entry's name as its row writes it: in code when it is code. */
function entryName(entry: DocumentationEntry): string {
    return hasCodeName(entry) ? codeSpan(entry.title) : linkText(entry.title)
}

/** Where a twin sits: its language and Chapter, linked, and the page a reader would open. */
function trail(
    language: DocumentationLanguage,
    chapter: Chapter | undefined,
    page: string
): string {
    const steps = [link(languageTitle(language), twinUrl(`/documentation/${language}`))]
    if (chapter) steps.push(link(linkText(chapter.title), twinUrl(chapter.href)))
    return `${steps.join(' › ')}\n\nWeb page: ${absoluteUrl(page)}`
}

function fieldList(fields: EntryField[], rewrite: LinkRewriter): string {
    return fields
        .map((field) => `- **${field.label}**: ${oneLine(rewriteMarkdown(field.value, rewrite))}`)
        .join('\n')
}

/** What one flag does, as the flag strip's legend says it. */
function flagEffects(marks: FlagMarks, notes?: Record<string, string>): string[] {
    return Object.entries(marks).map(([flag, mark]) => {
        const note = notes?.[flag] ? ` ${notes[flag]}` : ''
        return `${flag}: ${mark.title ?? FLAG_MARK_MEANINGS[mark.kind]}${note}`
    })
}

function flagsSection(flags: FlagStrip | undefined): string | undefined {
    if (!flags?.marks) return undefined
    const rows = flags.order
        .filter((flag) => flags.marks?.[flag])
        .map((flag) => {
            const mark = flags.marks![flag]
            const note = flags.notes?.[flag] ? ` ${flags.notes[flag]}` : ''
            return `| ${flag} | ${mark.title ?? FLAG_MARK_MEANINGS[mark.kind]}${note} |`
        })
    return blocks(
        '## Flags',
        ['| Flag | Effect |', '| --- | --- |', ...rows].join('\n'),
        flags.reads?.length && `Reads: ${flags.reads.join(', ')}`,
        flags.note
    )
}

function patternLine(
    pattern: FormPattern,
    note: string | undefined,
    rewrite: LinkRewriter
): string {
    const chips = pattern.chips.length
        ? ` (${pattern.chips.map((chip) => chip.label).join(', ')})`
        : ''
    const said = [
        ...pattern.facts,
        ...(pattern.flags ? [`Flags: ${flagEffects(pattern.flags).join(', ')}`] : []),
        ...(note ? [note] : [])
    ].join(' · ')
    const lines = [
        `- ${codeSpan(patternText(pattern))}${chips}${said ? ` · ${oneLine(rewriteMarkdown(said, rewrite))}` : ''}`
    ]
    const listsForms =
        pattern.forms.length > 1 ||
        pattern.forms.some((form) => form.expansion?.length || form.note || form.facts.length > 0)
    if (listsForms) {
        for (const form of pattern.forms) {
            const formSaid = [form.note, ...form.facts].filter(Boolean).join(' · ')
            const expansion = form.expansion?.length
                ? ` → ${form.expansion.map(codeSpan).join('; ')}`
                : ''
            lines.push(
                `  - ${codeSpan(form.code)}${formSaid ? `: ${oneLine(rewriteMarkdown(formSaid, rewrite))}` : ''}${expansion}`
            )
        }
    }
    for (const detail of pattern.details) {
        const name = detail.name ? ` (${detail.name})` : ''
        lines.push(`  - ${detail.label}: ${detail.values.join(', ')}${name}`)
    }
    return lines.join('\n')
}

export type InstructionExtras = {
    /** The program shown after everything else, with its code fence's language. */
    example?: { code: string; fence: string }
    aliases?: readonly string[]
    lessons?: readonly InstructionLesson[]
}

/** An instruction in the order its view shows it: header, flags, Forms, Operands, description, example. */
export function instructionMarkdown(
    document: InstructionDocument,
    extras: InstructionExtras,
    rewrite: LinkRewriter
): string {
    const showLongName = document.longName.toLowerCase() !== document.name.toLowerCase()
    const identity = [
        showLongName ? `**${document.longName}**` : undefined,
        document.tags.length ? document.tags.map(tagLabel).join(' · ') : undefined
    ].filter(Boolean)
    const sections = document.sections.map((section) =>
        blocks(
            `## ${sectionHeading(section.tags)}`,
            section.explanation && rewriteMarkdown(section.explanation, rewrite),
            ...section.groups.map((group) =>
                group.patterns.length === 1
                    ? patternLine(group.patterns[0], group.note, rewrite)
                    : blocks(
                          group.note && rewriteMarkdown(group.note, rewrite),
                          group.patterns
                              .map((pattern) => patternLine(pattern, undefined, rewrite))
                              .join('\n')
                      )
            )
        )
    )
    const operands = document.operands.map((operand) => {
        const symbol = codeSpan(operand.symbol)
        const named = operand.href ? link(symbol, rewrite(operand.href)) : symbol
        return `- ${named}: ${oneLine(rewriteMarkdown(operand.meaning, rewrite))}`
    })
    const lessons = (extras.lessons ?? []).map(
        (lesson) =>
            `${link(linkText(lesson.name), twinUrl(`/learn/courses/${lesson.courseSlug}/${lesson.moduleSlug}/${lesson.lectureSlug}`))} (${lesson.course})`
    )
    return blocks(
        identity.join(' · '),
        document.category && `Category: ${categoryLabel(document.category)}`,
        document.summary,
        document.headerFacts.length &&
            oneLine(rewriteMarkdown(document.headerFacts.join(' · '), rewrite)),
        extras.aliases?.length && `Also written as: ${extras.aliases.map(codeSpan).join(', ')}`,
        document.reference && link(linkText(document.reference.label), document.reference.href),
        lessons.length && `Used in: ${lessons.join(', ')}`,
        flagsSection(document.flags),
        ...sections,
        operands.length && blocks('## Operands', operands.join('\n')),
        document.description &&
            blocks('## Description', rewriteMarkdown(document.description, rewrite)),
        extras.example && blocks('## Example', codeBlock(extras.example.code, extras.example.fence))
    )
}

/** An entry's body, by the kind of its view, as `EntryBody` draws it. */
function entryBody(entry: DocumentationEntry, rewrite: LinkRewriter): string {
    const view = entry.view
    const fence = fenceName(entry.language)
    const content = entry.instructionContent
    if (view.type === 'instruction') {
        const example = content?.example
            ? { code: content.example.code, fence: fenceName(content.example.target) }
            : view.example
              ? { code: view.example, fence }
              : undefined
        return instructionMarkdown(view.document, { example }, rewrite)
    }
    const markdown = (text: string | undefined) => text && rewriteMarkdown(text, rewrite)
    const own = (() => {
        switch (view.type) {
            case 'markdown':
                return markdown(view.markdown)
            case 'fields':
                return blocks(
                    markdown(view.markdown),
                    view.fields.length && fieldList(view.fields, rewrite),
                    view.example && blocks('Example:', codeBlock(view.example, fence)),
                    view.after?.length && fieldList(view.after, rewrite)
                )
            case 'swatches':
                return blocks(
                    markdown(view.markdown),
                    view.swatches
                        .map((swatch) => {
                            const colour = swatch.color === swatch.value ? '' : ` (${swatch.color})`
                            return `- ${swatch.name}: ${codeSpan(swatch.value)}${colour}`
                        })
                        .join('\n')
                )
        }
    })()
    return blocks(
        markdown(content?.description),
        own,
        content?.example && codeBlock(content.example.code, fenceName(content.example.target))
    )
}

async function chaptersOf(language: DocumentationLanguage): Promise<Chapter[]> {
    return documentationFor(language)
}

function isDocumentationLanguage(value: string): value is DocumentationLanguage {
    return (DOCUMENTATION_LANGUAGES as string[]).includes(value)
}

async function chapterAt(language: string, page: string): Promise<Chapter> {
    if (!isDocumentationLanguage(language)) error(404, 'No such language')
    const href = `/documentation/${language}/${page}`
    const chapter = (await chaptersOf(language)).find((chapter) => chapter.href === href)
    if (!chapter) error(404, 'No such Chapter')
    return chapter
}

/** An entry's twin on its own: where it sits, its name, and its body. */
async function entryMarkdown(entry: DocumentationEntry, chapter: Chapter): Promise<string> {
    const links = await twinLinks()
    const page = entry.href.split('#')[0]
    const signature = entry.signature ? `\n\n${codeSpan(entry.signature)}` : ''
    return blocks(
        `# ${entryName(entry)}${signature}`,
        trail(entry.language, chapter, entry.href),
        entryBody(entry, links.rewriter(page))
    )
}

/** `/documentation/<language>/<page>/<anchor>.md`: one entry of a Chapter page. */
export async function entryTwin(language: string, page: string, anchor: string): Promise<string> {
    const chapter = await chapterAt(language, page)
    const entry = chapter.entries.find(
        (entry) => entry.href.includes('#') && entry.anchor === anchor
    )
    if (!entry) error(404, 'No such entry')
    return entryMarkdown(entry, chapter)
}

/** One row of a Chapter's list: the entry's name, what follows it, and its summary. */
function entryLine(entry: DocumentationEntry): string {
    const signature = entry.signature ? ` ${codeSpan(entry.signature)}` : ''
    const tags = entry.tags?.length ? ` (${entry.tags.map(tagLabel).join(', ')})` : ''
    return `- ${link(entryName(entry), absoluteUrl(entryTwinPathname(entry)))}${signature}${tags}: ${oneLine(entry.summary)}`
}

/** `/documentation/<language>/<page>.md`: a Chapter, listing its entries, instructions by category. */
export async function chapterTwin(language: string, page: string): Promise<string> {
    const chapter = await chapterAt(language, page)
    const grouped = chapter.entries.every((entry) => entry.category)
        ? groupByCategory(chapter.entries, (entry) => entry.category).map((group) =>
              blocks(`## ${categoryLabel(group.category)}`, group.items.map(entryLine).join('\n'))
          )
        : [chapter.entries.map(entryLine).join('\n')]
    return blocks(
        `# ${DOCUMENTATION_SITES[chapter.language].label} ${linkText(chapter.title)}`,
        trail(chapter.language, undefined, chapter.href),
        chapter.description,
        `${chapter.entries.length} entries, each with its own page of markdown:`,
        ...grouped
    )
}

/** `/documentation/<language>.md`: a language's introduction and its Chapters. */
export async function languageTwin(language: string): Promise<string> {
    if (!isDocumentationLanguage(language)) error(404, 'No such language')
    const links = await twinLinks()
    const chapters = await chaptersOf(language)
    const intro = DOCUMENTATION_INTROS[language]
    return blocks(
        `# ${languageTitle(language)}`,
        `> ${DOCUMENTATION_ABOUT[language]}`,
        `Web page: ${absoluteUrl(`/documentation/${language}`)}`,
        intro && rewriteMarkdown(intro, links.rewriter(`/documentation/${language}`)),
        '## Chapters',
        chapters
            .map(
                (chapter) =>
                    `- ${link(linkText(chapter.title), twinUrl(chapter.href))}: ${oneLine(chapter.description)} (${chapter.entries.length} entries)`
            )
            .join('\n'),
        '## Optional',
        `- ${link(`The whole ${languageTitle(language)}`, absoluteUrl(documentationFullPathname(language)))}: every entry of every Chapter in one file, to search through`
    )
}

/** `/documentation.md`: the languages. */
export async function documentationIndexTwin(): Promise<string> {
    const links = await twinLinks()
    return blocks(
        '# Documentation',
        `Web page: ${absoluteUrl('/documentation')}`,
        rewriteMarkdown(DOCUMENTATION_INTRO, links.rewriter('/documentation')),
        DOCUMENTATION_LANGUAGES.map(
            (language) =>
                `- ${link(languageTitle(language), twinUrl(`/documentation/${language}`))}: ${DOCUMENTATION_ABOUT[language]}`
        ).join('\n')
    )
}

/** What an instruction page's `load` returns, which its twin reads as the page does. */
export type InstructionPageData = {
    props: {
        document: InstructionDocument
        example?: InstructionExample
        aliases?: string[]
        lessons: readonly InstructionLesson[]
    }
}

/**
 * `/documentation/<language>/instruction/<name>.md`: the instruction from what its page's own `load`
 * returned. Another spelling's page shows the main instruction whole; its twin says which one it is.
 */
export async function instructionTwin(
    language: DocumentationLanguage,
    name: string,
    data: InstructionPageData
): Promise<string> {
    const links = await twinLinks()
    const page = `/documentation/${language}/instruction/${name}`
    const chapter = (await chaptersOf(language)).find((chapter) => chapter.id === 'instructions')
    const main = aliasTarget(language, name)
    const { document, example, aliases, lessons } = data.props
    const heading = `# ${codeSpan(name)}`
    if (main) {
        const mainPage = `/documentation/${language}/instruction/${main}`
        return blocks(
            heading,
            trail(language, chapter, page),
            `${codeSpan(name)} is another spelling of ${link(codeSpan(main), twinUrl(mainPage))}.`
        )
    }
    return blocks(
        heading,
        trail(language, chapter, page),
        instructionMarkdown(
            document,
            {
                example: example && { code: example.code, fence: fenceName(example.target) },
                aliases,
                lessons
            },
            links.rewriter(page)
        )
    )
}

/** Every Chapter page's entries as twins have them, for the routes' `entries`. */
export async function documentationEntryParams(): Promise<
    { language: DocumentationLanguage; page: string; anchor: string }[]
> {
    const out: { language: DocumentationLanguage; page: string; anchor: string }[] = []
    for (const language of DOCUMENTATION_LANGUAGES) {
        for (const chapter of await chaptersOf(language)) {
            for (const entry of chapter.entries) {
                const [path, hash] = entry.href.split('#')
                if (hash === undefined) continue
                out.push({ language, page: path.split('/').at(-1)!, anchor: entry.anchor })
            }
        }
    }
    return out
}

/** Every Chapter page, for the routes' `entries`. */
export async function chapterParams(): Promise<
    { language: DocumentationLanguage; page: string }[]
> {
    const out: { language: DocumentationLanguage; page: string }[] = []
    for (const language of DOCUMENTATION_LANGUAGES) {
        for (const chapter of await chaptersOf(language)) {
            out.push({ language, page: chapter.href.split('/').at(-1)! })
        }
    }
    return out
}

/** `/documentation/<language>/llms-full.txt`: every entry's twin, Chapter by Chapter. */
export async function documentationFull(language: string): Promise<string> {
    if (!isDocumentationLanguage(language)) error(404, 'No such language')
    const parts = [await languageTwin(language)]
    for (const chapter of await chaptersOf(language)) {
        for (const entry of chapter.entries) parts.push(await entryMarkdown(entry, chapter))
    }
    return parts.join('\n---\n\n')
}
