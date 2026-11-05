import { DOCUMENTATION_LANGUAGES } from '#lib/search/scope.ts'
import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
import { absoluteUrl, documentationFullPathname, LLMS_PATHNAME } from './urls'

/**
 * The message a reader sends to an AI assistant so it reads the site's **Markdown twins** before it
 * answers ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)),
 * copied from the "Documentation for agents" section of `/documentation`. Its URLs follow the same
 * rules as the twins, which the build's link check holds to the built files through `/llms.txt`.
 */

const languages = DOCUMENTATION_LANGUAGES.map((language) => DOCUMENTATION_SITES[language].label)

export const AGENT_MESSAGE = [
    `Before you answer, read the documentation of ASM Editor, an assembly editor and emulator that runs in the browser, for ${languages.slice(0, -1).join(', ')} and ${languages.at(-1)}.`,
    `Start at ${absoluteUrl(LLMS_PATHNAME)}. It links to markdown pages that list the Documentation of each language, the Courses, the blog and the example programs, and each of those pages lists the next level down.`,
    [
        `- Every page of the website has the same content in markdown at its URL with .md added, such as ${absoluteUrl('/documentation/mips/syscall.md')}.`,
        `- An instruction is at /documentation/<language>/instruction/<mnemonic>.md, such as ${absoluteUrl('/documentation/mips/instruction/addi.md')}.`,
        `- If you can run commands, each language's whole Documentation is one file you can search, such as ${absoluteUrl(documentationFullPathname('mips'))}.`
    ].join('\n'),
    'When you answer, link the website pages you used: the same URLs without .md.'
].join('\n\n')
