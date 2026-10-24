import { aliasTarget } from '#lib/documentation/instructions/aliases.ts'
import { INSTRUCTION_PAGES, instructionPathname } from '#lib/documentation/instructions/pages.ts'
import {
    courseLanguage,
    documentationLanguageOf,
    type DocumentationLanguage
} from '#lib/search/scope.ts'
import { tokenizeAssembly } from './assemblyHighlight'
import { fenceLanguage } from './fenceLanguage'
import { getAllCourses, getCourse, getLectureContent } from './getters'

/**
 * Which documented instructions each Lecture's code uses, and which Lectures use each instruction:
 * the links between a Lecture and the instruction pages, in both directions. Read at build time
 * from the code blocks of the Lectures' markdown, the mnemonic of each line as the code block
 * highlighter reads it, so a label, a comment, a directive and an M68K size suffix are already set
 * apart from it. A mnemonic with no page of its own (a macro, a directive the highlighter cannot
 * tell from one) is dropped, and another spelling of an instruction counts as that instruction.
 * Node only, like `getters.ts`.
 */

/** One documented instruction a Lecture uses, and the page that documents it. */
export type LectureInstruction = { name: string; pathname: string }

/** The instructions of one language that a Lecture uses, in the order the Lecture first uses them. */
export type LectureInstructionGroup = {
    language: DocumentationLanguage
    instructions: LectureInstruction[]
}

/** A Lecture as an instruction page lists it. */
export type InstructionLesson = {
    name: string
    course: string
    courseSlug: string
    moduleSlug: string
    lectureSlug: string
}

/**
 * The fenced code blocks of a Lecture, each with the info string of its fence. Read by lines rather
 * than with remark, which the renderer and the search index use: the fences are all this needs, and
 * remark takes more than a second to read every Lecture where this takes milliseconds, a wait the
 * first instruction page of a build, and every test that loads one, would sit through. Over the
 * Lectures the two find the same blocks. A fence indented inside a list item is still a fence, and
 * its lines lose that indentation, as remark reads them.
 */
function codeBlocks(markdown: string): { info: string; code: string }[] {
    const blocks: { info: string; code: string }[] = []
    const lines = markdown.split('\n')
    for (let start = 0; start < lines.length; start++) {
        const open = /^(\s*)(`{3,}|~{3,})([^`]*)$/.exec(lines[start])
        if (!open) continue
        const [, indent, fence, info] = open
        const code: string[] = []
        let end = start + 1
        for (; end < lines.length; end++) {
            const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[end])
            if (close && close[1][0] === fence[0] && close[1].length >= fence.length) break
            const line = lines[end]
            code.push(line.startsWith(indent) ? line.slice(indent.length) : line.trimStart())
        }
        blocks.push({ info: info.trim(), code: code.join('\n') })
        start = end
    }
    return blocks
}

/** The name of the page that documents `mnemonic`, or undefined when it has none. */
function documentedName(language: DocumentationLanguage, mnemonic: string): string | undefined {
    const name = mnemonic.toLowerCase()
    if (!INSTRUCTION_PAGES[language].has(name)) return undefined
    return aliasTarget(language, name) ?? name
}

/**
 * The documented instructions in a Lecture's assembly code blocks, grouped by the language each
 * block is written in. A fence that names no assembly language (C, a testcase, program output) is
 * not read; one in RISC-V-64 reads the RISC-V Documentation, as a Project does.
 */
export function lectureInstructions(markdown: string): LectureInstructionGroup[] {
    const groups = new Map<DocumentationLanguage, Map<string, LectureInstruction>>()
    for (const block of codeBlocks(markdown)) {
        const fence = fenceLanguage(block.info.split(/\s/)[0])
        if (fence.kind !== 'assembly') continue
        const language = documentationLanguageOf(fence.language)
        for (const line of tokenizeAssembly(block.code, fence.language)) {
            // the last, since a prefix reads as one too: `rep movsb`, `lock xadd`
            const mnemonic = line.filter((token) => token.kind === 'mnemonic').at(-1)
            const name = mnemonic && documentedName(language, mnemonic.text)
            if (!name) continue
            let group = groups.get(language)
            if (!group) groups.set(language, (group = new Map()))
            if (!group.has(name)) {
                group.set(name, { name, pathname: instructionPathname(language, name) })
            }
        }
    }
    return [...groups].map(([language, instructions]) => ({
        language,
        instructions: [...instructions.values()]
    }))
}

/** Every Course's Lectures, in course order, by the instructions they use: `language:name`. */
async function buildIndex(): Promise<Map<string, InstructionLesson[]>> {
    const index = new Map<string, InstructionLesson[]>()
    for (const { slug } of await getAllCourses()) {
        const course = await getCourse(slug)
        for (const module of course.modules) {
            for (const lecture of module.lectures) {
                const markdown = await getLectureContent(slug, module.slug, lecture.slug)
                const lesson: InstructionLesson = {
                    name: lecture.name,
                    course: course.name,
                    courseSlug: slug,
                    moduleSlug: module.slug,
                    lectureSlug: lecture.slug
                }
                for (const group of lectureInstructions(markdown)) {
                    for (const { name } of group.instructions) {
                        const key = `${group.language}:${name}`
                        const lessons = index.get(key)
                        if (lessons) lessons.push(lesson)
                        else index.set(key, [lesson])
                    }
                }
            }
        }
    }
    return index
}

// Built once and shared by every page the prerender asks: one instruction page alone would read
// every Lecture.
let index: Promise<Map<string, InstructionLesson[]>> | undefined

/**
 * The Lectures whose code uses an instruction, at most `limit` of them: the language's own Course
 * first, then the others that show it (the General course), each in its own order. Another
 * spelling of an instruction is answered with the instruction's Lectures.
 */
export async function instructionLessons(
    language: DocumentationLanguage,
    mnemonic: string,
    limit = 10
): Promise<InstructionLesson[]> {
    const name = documentedName(language, mnemonic)
    if (!name) return []
    index ??= buildIndex()
    const lessons = (await index).get(`${language}:${name}`) ?? []
    const own = lessons.filter((lesson) => courseLanguage(lesson.courseSlug) === language)
    const others = lessons.filter((lesson) => courseLanguage(lesson.courseSlug) !== language)
    return [...own, ...others].slice(0, limit)
}
