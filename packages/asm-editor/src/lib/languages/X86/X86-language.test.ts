import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { X86LanguageConfiguration } from './X86-grammar'
import { createX86CompletionProvider, createX86HoverProvider } from './X86-language'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = {
    Range,
    languages: {
        CompletionItemKind: {
            Function: 'Function',
            Snippet: 'Snippet',
            Keyword: 'Keyword',
            Value: 'Value',
            Module: 'Module',
            Reference: 'Reference',
            Variable: 'Variable',
            TypeParameter: 'TypeParameter'
        },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 }
    }
} as unknown as MonacoType

/** The word Monaco reports: the pattern match that touches the column, as its wordHelper picks it. */
function wordAt(line: string, column: number) {
    const pattern = new RegExp(X86LanguageConfiguration.wordPattern!.source, 'g')
    for (const match of line.matchAll(pattern)) {
        const start = match.index
        const end = start + match[0].length
        if (start <= column - 1 && column - 1 <= end) {
            return { word: match[0], startColumn: start + 1, endColumn: end + 1 }
        }
    }
    return null
}

function model(line: string) {
    return {
        uri: undefined,
        getValue: () => line,
        getLineContent: () => line,
        getWordAtPosition: (position: monaco.Position) => wordAt(line, position.column)
    } as unknown as monaco.editor.ITextModel
}

/** The hover's blocks, in order. */
async function hover(line: string, at: string) {
    const result = await createX86HoverProvider(monacoStub).provideHover(
        model(line),
        { lineNumber: 1, column: line.indexOf(at) + 1 } as monaco.Position,
        {} as monaco.CancellationToken
    )
    return result ? result.contents.map((content) => content.value) : []
}

describe('x86 hovers', () => {
    it('names the category and the tags every form has on the italic line', async () => {
        const [sysret] = await hover('    sysret', 'sysret')
        expect(sysret).toMatch(/^\*\*sysret\*\*/)
        expect(sysret.split('\n\n')[1]).toMatch(/^\*System · Privileged · .+ and later\*$/)
    })

    it('leaves a tag only some forms have off the line', async () => {
        // Eight of `mov`'s forms reach the control and debug registers, which are privileged.
        const [mov] = await hover('    mov rax, rbx', 'mov')
        expect(mov.split('\n\n')[1]).toMatch(/^\*Data movement · .+ and later\*$/)
        expect(mov).not.toContain('Privileged')
    })

    it("links the instruction's Documentation by the page's address", async () => {
        //Monaco renders a link without a scheme as plain text, so a hover's are absolute
        vi.stubGlobal('location', { origin: 'https://asm.example' })
        onTestFinished(() => void vi.unstubAllGlobals())
        expect(await hover('    mov rax, rbx', 'mov')).toContain(
            "[Documentation](https://asm.example/documentation/x86/instruction/mov) · [Intel's reference: MOV](https://intel.github.io/SDM/instruction/MOV.html)"
        )
    })

    it("links Intel's page from a vector instruction's hover too, which has no page here", async () => {
        expect(await hover('    vaddps ymm0, ymm1, ymm2', 'vaddps')).toContain(
            "[Intel's reference: ADDPS](https://intel.github.io/SDM/instruction/ADDPS.html)"
        )
    })

    it('says nothing about the words of a comment', async () => {
        expect(await hover('    ret ; mov the result to rax', 'mov')).toEqual([])
        expect(await hover('    ret ; mov the result to rax', 'rax')).toEqual([])
        // A `;` in a string starts no comment.
        expect(await hover("    db ';', 0 ; mov", 'db')).not.toEqual([])
    })
})

/** The suggestions at the end of `line`, under `text`, as `label kind detail sortText insertText`. */
async function completions(line: string, text = '') {
    const result = await createX86CompletionProvider(monacoStub).provideCompletionItems(
        {
            uri: undefined,
            getValueInRange: () => line,
            getValue: () => `${text}${line}`
        } as unknown as monaco.editor.ITextModel,
        { lineNumber: 1, column: line.length + 1 } as monaco.Position,
        {} as monaco.languages.CompletionContext,
        {} as monaco.CancellationToken
    )
    return (result?.suggestions ?? []).map((item) =>
        [
            typeof item.label === 'string' ? item.label : item.label.label,
            item.kind,
            item.detail,
            item.sortText,
            item.insertText
        ].join(' ')
    )
}

describe('x86 completion', () => {
    it('offers directives alone after a percent sign', async () => {
        expect(await completions('    %de')).toEqual([
            '%defalias Keyword NASM directive 020%defalias %defalias',
            '%define Keyword NASM directive 020%define %define',
            '%defstr Keyword NASM directive 020%defstr %defstr',
            '%deftok Keyword NASM directive 020%deftok %deftok',
            '%depend Keyword NASM directive 020%depend %depend'
        ])
        expect(await completions('    SEC')).toEqual([
            'section Keyword NASM directive 020section SECTION',
            'sectalign Keyword NASM directive 020sectalign SECTALIGN'
        ])
    })

    it('offers every section and every bit width whatever has been typed', async () => {
        expect(await completions('segment .d')).toEqual([
            '.text Module Section 010.text .text',
            '.data Module Section 010.data .data',
            '.bss Module Section 010.bss .bss',
            '.rodata Module Section 010.rodata .rodata'
        ])
        expect(await completions('bits 6')).toEqual([
            '16 Value 16-bit mode 01016 16',
            '32 Value 32-bit mode 01032 32',
            '64 Value 64-bit mode 01064 64'
        ])
    })

    it("offers a jump the file's labels, in the case typed", async () => {
        expect(await completions('    jne LO', 'start:\nloop: nop\nLoopTwo:\n')).toEqual([
            'loop Reference Jump target 010loop LOOP',
            'LoopTwo Reference Jump target 010LoopTwo LOOPTWO'
        ])
    })

    it('offers registers, then size specifiers outside an address, then labels', async () => {
        expect(await completions('    mov eax, q', 'quit:\n')).toEqual([
            'qword TypeParameter Size specifier 020qword qword',
            'quit Reference Label 030quit quit'
        ])
        expect(await completions('    mov [rs', 'rsum:\n')).toEqual([
            'rsp Variable Address register 010rsp rsp',
            'rsi Variable Address register 010rsi rsi',
            'rsum Reference Label 030rsum rsum'
        ])
        expect(await completions('    mov RS', 'rsum:\n')).toEqual([
            'rsp Variable Register 010rsp RSP',
            'rsi Variable Register 010rsi RSI',
            'rsum Reference Label 030rsum RSUM'
        ])
    })
})
