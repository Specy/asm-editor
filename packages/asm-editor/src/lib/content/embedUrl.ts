import lzstring from 'lz-string'
import type { Testcase } from '#lib/Project.svelte.ts'
import { serializer } from '#lib/json.ts'
import { parsePlaygroundLanguage, type PlaygroundSettings } from './playgrounds'
import { encodePlaygroundProgram, type PlaygroundProgram } from './playgroundProgram'

/**
 * The address of an embed (`/embed`), written here for both pages that write one, a Playground of
 * a rendered Markdown text and the embed builder, and read back here by the embed. Other sites
 * frame the links the site has handed out, so a parameter keeps its name and the way it is read.
 */

/** What an embed shows, which its URL carries. */
export type EmbedSettings = Omit<PlaygroundSettings, 'registerFile'> & {
    /** Whether the memory, registers, flags, PC and Screen wait for the program to be built. */
    hideUntilBuilt: boolean
    /** The Register file the panel opens on, named as a Playground's flag names it, like `fpu`. */
    registerFile?: string
}

/** What an embed runs: its Testcases, and its Files when it has them, or else the one source. */
export type EmbedProgram = {
    code: string
    program?: PlaygroundProgram
    testcases: Testcase[]
}

/** Everything after `/embed?`, in the order the site has always written it. */
export function embedQuery(
    settings: EmbedSettings,
    { code, program, testcases }: EmbedProgram
): string {
    const flags = [
        settings.showMemory ? 'showMemory=true&' : '',
        settings.showConsole ? 'showConsole=true&' : '',
        settings.showTests ? 'showTests=true&' : 'showTests=false&',
        settings.showPc ? 'showPc=true&' : '',
        settings.showRegisters ? 'showRegisters=true&' : 'showRegisters=false&',
        settings.showFlags ? 'showFlags=true&' : 'showFlags=false&',
        settings.showScreen ? 'showScreen=true&' : '',
        settings.openScreen ? 'openScreen=true&' : '',
        settings.hideUntilBuilt ? 'hideUntilBuilt=true&' : '',
        settings.openButton ? 'openButton=true&' : '',
        settings.registerFile ? `registerFile=${settings.registerFile}&` : ''
    ].join('')
    const tests =
        testcases.length > 0
            ? `testcases=${lzstring.compressToEncodedURIComponent(serializer.stringify(testcases))}&`
            : ''
    const source = program
        ? `program=${encodePlaygroundProgram(program)}`
        : `code=${lzstring.compressToEncodedURIComponent(code)}`
    return `language=${settings.language}&${flags}${tests}${source}`
}

/** A URL's query, which is only read: a page's own is SvelteKit's read-only one. */
type QueryParams = Pick<URLSearchParams, 'get'>

/** The settings an embed's URL asks for; a parameter it leaves out takes its default. */
export function readEmbedSettings(params: QueryParams): EmbedSettings {
    //asking for the Screen open is asking for one, so a link needs only the one parameter
    const openScreen = params.get('openScreen') === 'true'
    return {
        showMemory: params.get('showMemory') === 'true',
        //a link written by hand may spell the language as a fence does, `riscv` or `x86`, and one
        //the editor has not got opens the default rather than an emulator that never loads
        language: parsePlaygroundLanguage(params.get('language') ?? undefined) ?? 'M68K',
        showConsole: params.get('showConsole') === 'true',
        showTests: (params.get('showTests') ?? 'true') === 'true',
        showPc: params.get('showPc') === 'true',
        showRegisters: params.get('showRegisters') !== 'false',
        showFlags: params.get('showFlags') === 'true',
        showScreen: openScreen || params.get('showScreen') === 'true',
        openScreen,
        hideUntilBuilt: params.get('hideUntilBuilt') === 'true',
        openButton: params.get('openButton') === 'true',
        //the panel itself decides what to do with a file this language has not got, which is to
        //open on the CPU one
        registerFile: params.get('registerFile')?.trim().toLowerCase() || undefined
    }
}

/** The one source an embed's URL carries, when it carries one that reads. */
export function readEmbedCode(params: QueryParams): string | undefined {
    const code = params.get('code')
    if (!code) return undefined
    try {
        return lzstring.decompressFromEncodedURIComponent(code)
    } catch (e) {
        console.error(e)
        return undefined
    }
}

/** The Testcases an embed's URL carries, or none when they do not read. */
export function readEmbedTestcases(params: QueryParams): Testcase[] {
    const tests = params.get('testcases')
    if (!tests) return []
    try {
        return serializer.parse<Testcase[]>(lzstring.decompressFromEncodedURIComponent(tests))
    } catch (e) {
        console.error(e)
        return []
    }
}
