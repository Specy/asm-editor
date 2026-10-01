import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * The **Search scope** ([CONTEXT.md](../../../CONTEXT.md)): what one search looks through, set by the
 * place it is made from. The index is cut into shards, one per language's Documentation and one per
 * Course, so a scope is the list of shards it reads and the browser caches each shard once for every
 * scope that shares it ([the plan](../../../docs/design/documentation-search-plan.md)).
 */

/** The languages that have Documentation. A RISC-V-64 Project reads the RISC-V Documentation. */
export type DocumentationLanguage = 'm68k' | 'mips' | 'risc-v' | 'x86' | 'z80'

export const DOCUMENTATION_LANGUAGES: DocumentationLanguage[] = [
    'm68k',
    'mips',
    'risc-v',
    'x86',
    'z80'
]

/** The General course's slug; every other Course is named after its language. */
export const GENERAL_COURSE = 'assembly-basics'

export type CourseSlug = typeof GENERAL_COURSE | DocumentationLanguage

export const COURSES: CourseSlug[] = [GENERAL_COURSE, ...DOCUMENTATION_LANGUAGES]

export type ShardId = `docs-${DocumentationLanguage}` | `lectures-${CourseSlug}`

export const ALL_SHARDS: ShardId[] = [
    ...DOCUMENTATION_LANGUAGES.map((language) => `docs-${language}` as const),
    ...COURSES.map((course) => `lectures-${course}` as const)
]

export type SearchScope =
    /**
     * A language's Documentation, its Language course and the General course. Without lectures it is
     * an Exam's scope, the Documentation alone, so no Example hands a student a finished program.
     */
    | { kind: 'language'; language: DocumentationLanguage; lectures: boolean }
    /** The General course's pages and the list of Courses: every Course, no Documentation. */
    | { kind: 'courses' }

export function languageScope(language: DocumentationLanguage, lectures = true): SearchScope {
    return { kind: 'language', language, lectures }
}

export const COURSES_SCOPE: SearchScope = { kind: 'courses' }

export function shardsOf(scope: SearchScope): ShardId[] {
    if (scope.kind === 'courses') return COURSES.map((course) => `lectures-${course}` as const)
    const shards: ShardId[] = [`docs-${scope.language}`]
    if (scope.lectures) shards.push(`lectures-${scope.language}`, `lectures-${GENERAL_COURSE}`)
    return shards
}

export function scopeKey(scope: SearchScope): string {
    return scope.kind === 'courses'
        ? 'courses'
        : `${scope.language}:${scope.lectures ? 'all' : 'docs'}`
}

export function isShardId(value: string): value is ShardId {
    return (ALL_SHARDS as string[]).includes(value)
}

const DOCUMENTATION_LANGUAGE_OF: Record<AvailableLanguages, DocumentationLanguage> = {
    M68K: 'm68k',
    MIPS: 'mips',
    'RISC-V': 'risc-v',
    'RISC-V-64': 'risc-v',
    X86: 'x86',
    Z80: 'z80'
}

/** The Documentation a Project's language reads. */
export function documentationLanguageOf(language: AvailableLanguages): DocumentationLanguage {
    return DOCUMENTATION_LANGUAGE_OF[language]
}

/** A Course's language, or none for the General course. */
export function courseLanguage(course: string): DocumentationLanguage | null {
    return (DOCUMENTATION_LANGUAGES as string[]).includes(course)
        ? (course as DocumentationLanguage)
        : null
}

/**
 * Where an agent runs, as far as its search tool cares: the language its place fixes, if any, and
 * whether the place is an Exam.
 */
export type AgentSearchPlace = {
    language: DocumentationLanguage | null
    lectures: boolean
}

/**
 * The scope of the agents' `search_documentation` tool ([the design record](../../../docs/design/documentation-search.md),
 * Settled while planning): the place's language when it has one, then the language the agent asked
 * for, then the language it is coding in, and the General course's scope when none of them is
 * known. An Exam stays the Documentation alone whatever the agent asks, and since the
 * Documentation is per language, an Exam with no language known has nothing to search: `null`.
 */
export function scopeForAgent(
    place: AgentSearchPlace,
    requested: DocumentationLanguage | null,
    editor: DocumentationLanguage | null
): SearchScope | null {
    const language = place.language ?? requested ?? editor
    if (language) return languageScope(language, place.lectures)
    return place.lectures ? COURSES_SCOPE : null
}
