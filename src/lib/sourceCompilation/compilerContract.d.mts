import type { TranslationProfile } from '@specy/x86/compiler-output'
import type { AvailableLanguages } from '../Project.svelte'
import type { CompilationTarget, Optimization, SourceCompiler, SourceLanguage } from './records'

export function defaultSourceCompiler(target: AvailableLanguages): SourceCompiler
export function compilerPreset(
    target: CompilationTarget,
    language: SourceLanguage,
    compiler?: SourceCompiler,
    profile?: TranslationProfile
): { id: string; architecture: string }
export function compilerCodeFlags(
    compiler: SourceCompiler,
    optimization: Optimization,
    sourceAnnotations?: boolean,
    profile?: TranslationProfile
): string
export function compilerLanguageFlags(
    language: SourceLanguage,
    profile?: TranslationProfile
): string
export const RUNTIME_TARGETS: Record<
    string,
    {
        arch: string
        language: CompilationTarget
        core: string
        width: number
        compilers: Record<SourceLanguage, string>
        flags: string
    }
>
export function prepareCompilerLines(
    lines: readonly { text: string }[],
    target: CompilationTarget,
    sourceAnnotations?: boolean
): { index: number; text: string }[]
