/**
 * Types for `lib.mjs`: the Entry questions logic that `src/lib/documentation/entryQuestions.test.ts`
 * tests.
 */
export type Language = 'm68k' | 'mips' | 'risc-v' | 'x86' | 'z80'

/** The fields of a built shard's entry that the script reads. */
export type ShardEntry = {
    id: string
    chapter: string
    chapterTitle: string
    entryKind: string
    title: string
    names: string[]
    signature: string
    category?: string
    summary: string
    text: string
    detail?: string
    code?: string
}

export type StoredQuestions = { hash: string; questions: string[] }
export type QuestionsFile = Record<string, StoredQuestions>

export type LanguageCheck = {
    language: Language
    entries: number
    written: number
    missing: ShardEntry[]
    stale: string[]
    orphaned: string[]
    invalid: { id: string; problems: string[] }[]
}

export type Packet = {
    language: Language
    chapter: string
    chapterTitle: string
    part?: number
    parts?: number
    entries: {
        id: string
        kind: string
        title: string
        names: string[]
        signature: string
        category?: string
        summary: string
        text: string
        detail?: string
        code?: string
        currentQuestions?: string[]
    }[]
    others: { id: string; title: string; names: string[]; summary: string }[]
}

export const LANGUAGES: Language[]
export const MIN_QUESTIONS: number
export const MAX_QUESTIONS: number
export const MAX_QUESTION_LENGTH: number
export const LANGUAGE_NAMES: Record<Language, string[]>

export function takesQuestions(entry: Pick<ShardEntry, 'entryKind'>): boolean
export function entryHash(entry: Pick<ShardEntry, 'summary' | 'text' | 'detail'>): string
export function otherLanguageNames(question: string, language: Language): string[]
export function namesEntry(question: string, names: string[]): boolean
export function questionKey(question: string): string
export function tidyQuestion(question: string): string
export function questionProblems(
    questions: unknown,
    entry: Pick<ShardEntry, 'names'>,
    language: Language
): string[]
export function readShard(dir: string, language: Language): ShardEntry[] | null
export function readQuestions(dir: string, language: Language): QuestionsFile
export function checkLanguage(
    language: Language,
    entries: ShardEntry[],
    questions: QuestionsFile
): LanguageCheck
export function checkAll(
    shardsDir: string,
    questionsDir: string
): (LanguageCheck | { language: Language; error: string })[]
export function formatCheck(reports: ReturnType<typeof checkAll>): string
export function validateResult(
    result: unknown,
    entries: ShardEntry[]
):
    | { fatal: string }
    | {
          fatal?: undefined
          accepted: Record<string, string[]>
          rejected: Record<string, string[]>
          warnings: string[]
      }
export function mergeQuestions(
    file: QuestionsFile,
    accepted: Record<string, string[]>,
    entries: ShardEntry[]
): QuestionsFile
export function serializeQuestions(file: QuestionsFile): string
export function chaptersOf(entries: ShardEntry[]): { chapter: string; chapterTitle: string }[]
export function buildPackets(
    language: Language,
    entries: ShardEntry[],
    questions: QuestionsFile,
    options?: { chapter?: string; missing?: boolean; stale?: boolean; size?: number }
): { name: string; packet: Packet }[]
