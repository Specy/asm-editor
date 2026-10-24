import { describe, expect, it } from 'vite-plus/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Code } from 'mdast'
import { documentationFor, entriesOf } from '#lib/documentation/documentation.ts'
import { fenceLanguage } from './fenceLanguage'

describe('fence languages', () => {
    it.each([
        ['m68k', 'M68K'],
        ['mips', 'MIPS'],
        ['riscv', 'RISC-V'],
        ['risc-v', 'RISC-V'],
        ['riscv64', 'RISC-V-64'],
        ['x86', 'X86'],
        ['Z80', 'Z80'],
        ['m68k|playground|memory', 'M68K']
    ])('reads %s as assembly', (info, language) => {
        expect(fenceLanguage(info)).toEqual({ kind: 'assembly', language })
    })

    it.each(['c', 'C', 'h', 'cpp', 'C++', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'c|file=src/value.h'])(
        'reads %s as C/C++, as Monaco names it',
        (info) => {
            expect(fenceLanguage(info)).toEqual({ kind: 'c-cpp' })
        }
    )

    it('leaves a bare asm to no architecture', () => {
        expect(fenceLanguage('asm')).toEqual({ kind: 'other', name: 'asm' })
    })

    it.each([
        ['text', 'text'],
        ['Python', 'python'],
        ['testcase', 'testcase']
    ])('passes %s on by name', (info, name) => {
        expect(fenceLanguage(info)).toEqual({ kind: 'other', name })
    })

    it.each([undefined, '', '   '])('reads %j as naming nothing', (info) => {
        expect(fenceLanguage(info)).toEqual({ kind: 'none' })
    })
})

/** Every file under `directory` whose name ends with `suffix`. */
function filesUnder(directory: string, suffix: string): string[] {
    return readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((path) => path.endsWith(suffix))
        .map((path) => join(directory, path))
}

/** The info strings of a Markdown text's fences, read as the renderer reads them. */
function fenceInfos(markdown: string): string[] {
    const infos: string[] = []
    visit(unified().use(remarkParse).use(remarkGfm).parse(markdown), 'code', (node: Code) => {
        infos.push([node.lang, node.meta].filter(Boolean).join(' '))
    })
    return infos
}

/**
 * What an authored code block may name: a language one of our own highlighters colours, `text`,
 * or a Playground's `testcase`. A Lecture, a Blog post or a Documentation entry has no Monaco to
 * colour anything else, so another name would render plain where the author meant colour.
 */
function unexpectedFence(info: string): boolean {
    const language = fenceLanguage(info)
    if (language.kind !== 'other') return false
    return language.name !== 'text' && language.name !== 'testcase'
}

describe('authored code blocks', () => {
    it('name only languages the pages colour', async () => {
        const root = process.cwd()
        const found: string[] = []
        const sources = [
            ...filesUnder(join(root, 'src/content'), '.md'),
            ...filesUnder(join(root, 'src/blog'), 'index.md'),
            ...filesUnder(join(root, 'src/lib/documentation'), '.md')
        ]
        for (const path of sources) {
            for (const info of fenceInfos(readFileSync(path, 'utf8'))) {
                if (unexpectedFence(info)) found.push(`${relative(root, path)}: ${info}`)
            }
        }
        for (const language of ['m68k', 'mips', 'risc-v', 'x86', 'z80'] as const) {
            for (const entry of entriesOf(await documentationFor(language))) {
                const view = entry.view
                const texts = [
                    view.type === 'instruction' ? view.document().description : view.markdown,
                    entry.instructionContent?.description
                ]
                for (const text of texts) {
                    for (const info of fenceInfos(text ?? '')) {
                        if (unexpectedFence(info)) found.push(`${entry.id}: ${info}`)
                    }
                }
            }
        }
        expect(found).toEqual([])
    }, 120000)
})
