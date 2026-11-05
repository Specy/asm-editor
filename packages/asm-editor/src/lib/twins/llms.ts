import type { Course } from '#lib/content/getters.ts'
import { DOCUMENTATION_LANGUAGES } from '#lib/search/scope.ts'
import { documentationFor } from '#lib/documentation/documentation.ts'
import { DOCUMENTATION_ABOUT, DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
import { blocks, codeSpan, link, linkText, oneLine } from './format'
import {
    absoluteUrl,
    courseFullPathname,
    documentationFullPathname,
    entryTwinPathname,
    twinPathname
} from './urls'

/**
 * `/llms.txt`, in the format of [the llms.txt proposal](https://llmstxt.org/): what the site is,
 * how its **Markdown twins** are found, and a link to the twin of each part of it. Its opening is
 * the only text written for agents alone
 * ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md));
 * everything it lists, and every URL it shows as an example, comes from the sources.
 */

function twinUrl(pathname: string): string {
    return absoluteUrl(twinPathname(pathname) ?? pathname)
}

/** Real examples of each kind of twin URL, from the first entries that have them. */
async function urlExamples(): Promise<string[]> {
    const mips = await documentationFor('mips')
    const instruction = mips.find((chapter) => chapter.id === 'instructions')?.entries[0]
    const syscall = mips
        .find((chapter) => chapter.id === 'syscalls')
        ?.entries.find((entry) => entry.href.includes('#') && entry.signature)
    const chapter = mips.find((chapter) => chapter.id === 'syscalls')
    return [
        chapter &&
            `- A page: its URL with \`.md\` appended, such as ${absoluteUrl(twinPathname(chapter.href)!)}`,
        instruction &&
            `- An instruction: \`/documentation/<language>/instruction/<mnemonic>.md\`, such as ${absoluteUrl(entryTwinPathname(instruction))}`,
        syscall &&
            `- Any other Documentation entry: one level below its Chapter's page, at the entry's anchor, such as ${absoluteUrl(entryTwinPathname(syscall))}`
    ].filter((line): line is string => Boolean(line))
}

export async function llmsTxt(courses: Course[]): Promise<string> {
    return blocks(
        '# ASM Editor',
        '> An assembly editor and emulator that runs in the browser, for M68K, MIPS, RISC-V, x86-64 and Z80. This site holds its reference Documentation for each language, Courses of Lectures with runnable programs and exercises, a blog, and example programs.',
        'Every link below leads to markdown that lists the next level down, with a line about each item, down to single Documentation entries and Lectures. Each page of the website has the same content in markdown at a URL of its own:',
        (await urlExamples()).join('\n'),
        '## Documentation',
        DOCUMENTATION_LANGUAGES.map(
            (language) =>
                `- ${link(`${DOCUMENTATION_SITES[language].label} Documentation`, twinUrl(`/documentation/${language}`))}: ${DOCUMENTATION_ABOUT[language]}`
        ).join('\n'),
        '## Courses',
        [
            `- ${link('All Courses', twinUrl('/learn/courses'))}`,
            ...courses.map(
                (course) =>
                    `- ${link(linkText(course.name), twinUrl(`/learn/courses/${course.slug}`))}: ${oneLine(course.description)}`
            )
        ].join('\n'),
        '## Blog',
        `- ${link('Blog', twinUrl('/blog'))}: guides to the editor and articles about how it is built`,
        '## Examples',
        `- ${link('Examples', twinUrl('/examples'))}: the example programs, with a link to open each in the editor and its Project archive`,
        '## Optional',
        [
            `- ${link('Changelog', twinUrl('/changelog'))}: what each version changed`,
            ...DOCUMENTATION_LANGUAGES.map(
                (language) =>
                    `- ${link(`The whole ${DOCUMENTATION_SITES[language].label} Documentation`, absoluteUrl(documentationFullPathname(language)))}: every entry in one file, to search through with ${codeSpan('grep')}`
            ),
            ...courses.map(
                (course) =>
                    `- ${link(`The whole ${linkText(course.name)} course`, absoluteUrl(courseFullPathname(course.slug)))}: every Lecture in one file`
            )
        ].join('\n')
    )
}
