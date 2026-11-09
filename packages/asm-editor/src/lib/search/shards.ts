import { splitLecture, type LectureSection } from '#lib/content/lectureSections.ts'
import { getCourse, getLectureContent } from '#lib/content/getters.ts'
import { documentationFor } from '#lib/documentation/documentation.ts'
import {
    entryDocument,
    entryEmbeddingTexts,
    lectureDocuments,
    windowEmbeddingText,
    type LectureRef
} from './documents'
import { SEARCH_MODEL } from './model'
import { createPayload, type ShardContent, type ShardPayload } from './payload'
import { COURSES, type CourseSlug, type DocumentationLanguage, type ShardId } from './scope'
import { englishWords } from './stemming'
import { documentVectors } from './vectorCache'

/**
 * Builds one shard of the index: its search units from the Documentation or a Course, and their
 * vectors from the cache or the model. The build's endpoint (`/search/<shard>.json`) and the
 * golden-query tests both call this, so the tests search exactly what the browser downloads.
 * Node only.
 */

/**
 * Times the Lectures must use an entry's name as an ordinary word for the name to be word-like
 * ([the design record](../../../../../docs/design/documentation-search.md), Matching).
 */
const WORD_LIKE_USES = 3

/** A language's committed Entry questions, keyed by entry id (`scripts/entry-questions/README.md`). */
type QuestionsFile = Record<string, { hash: string; questions: string[] }>

const QUESTION_FILES = import.meta.glob<QuestionsFile>('../documentation/questions/*.json', {
    import: 'default'
})

/**
 * A language's Entry questions by entry id, or none when it has no file yet
 * ([ADR 0079](../../../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md)). The
 * hash is the script's, to tell it which questions are stale: a stale entry's questions are still
 * read, since an edit rarely changes what an entry answers, and an orphan's are never asked for.
 */
async function entryQuestions(language: DocumentationLanguage): Promise<Map<string, string[]>> {
    const load = QUESTION_FILES[`../documentation/questions/${language}.json`]
    const file = load ? await load() : {}
    return new Map(Object.entries(file).map(([id, { questions }]) => [id, questions]))
}

async function documentationContent(
    shard: ShardId,
    language: DocumentationLanguage
): Promise<ShardContent> {
    const chapters = await documentationFor(language)
    const questions = await entryQuestions(language)
    const entries = chapters.flatMap((chapter) =>
        chapter.entries.map((entry) => {
            const document = entryDocument(entry, chapter.title)
            const own = questions.get(document.id)
            return own?.length ? { ...document, questions: own } : document
        })
    )
    return { shard, entries, sections: [], windows: [], wordLikeNames: await wordLike(entries) }
}

/**
 * The entries' names that the Lectures of every Course use at least `WORD_LIKE_USES` times as
 * ordinary words, in their prose without code (`stop`, `loop`, `test`, `if`): worked out here so
 * that nobody keeps the list. A name in capitals in prose is a mnemonic, not a word, and is not
 * counted.
 */
async function wordLike(entries: ShardContent['entries']): Promise<string[]> {
    const uses = await lectureWordUses()
    const names = new Set(entries.flatMap((entry) => entry.names))
    return [...names].filter((name) => (uses.get(name) ?? 0) >= WORD_LIKE_USES).sort()
}

let wordUses: Promise<Map<string, number>> | undefined

/** How often each ordinary word appears in every Course's Lectures, counted once per build. */
function lectureWordUses(): Promise<Map<string, number>> {
    wordUses ??= (async () => {
        const uses = new Map<string, number>()
        for (const course of COURSES) {
            for await (const { sections } of lecturesOf(course)) {
                for (const section of sections) {
                    for (const word of englishWords(section.words)) {
                        uses.set(word, (uses.get(word) ?? 0) + 1)
                    }
                }
            }
        }
        return uses
    })()
    return wordUses
}

/** A Course's Lectures in order, each cut into its Lecture sections. */
async function* lecturesOf(
    slug: CourseSlug
): AsyncGenerator<{ ref: LectureRef; sections: LectureSection[] }> {
    const course = await getCourse(slug)
    for (const module of course.modules) {
        for (const lecture of module.lectures) {
            const markdown = await getLectureContent(course.slug, module.slug, lecture.slug)
            yield {
                ref: {
                    course: course.slug,
                    courseName: course.name,
                    module: module.slug,
                    lecture: lecture.slug,
                    lectureName: lecture.name
                },
                sections: splitLecture(markdown)
            }
        }
    }
}

async function courseContent(shard: ShardId, slug: CourseSlug): Promise<ShardContent> {
    const content: ShardContent = { shard, entries: [], sections: [], windows: [] }
    for await (const { ref, sections } of lecturesOf(slug)) {
        const documents = lectureDocuments(ref, sections)
        const offset = content.sections.length
        content.sections.push(...documents.sections)
        content.windows.push(
            ...documents.windows.map((window) => ({
                ...window,
                section: window.section + offset
            }))
        )
    }
    return content
}

export async function shardContent(shard: ShardId): Promise<ShardContent> {
    if (shard.startsWith('docs-')) {
        return documentationContent(shard, shard.slice('docs-'.length) as DocumentationLanguage)
    }
    return courseContent(shard, shard.slice('lectures-'.length) as CourseSlug)
}

export async function buildShard(shard: ShardId): Promise<ShardPayload> {
    const content = await shardContent(shard)
    const entryTexts = content.entries.map(entryEmbeddingTexts)
    const texts = [
        ...entryTexts.map((own) => own[0]),
        ...entryTexts.flatMap((own) => own.slice(1)),
        ...content.windows.map((window) =>
            windowEmbeddingText(content.sections[window.section], window)
        )
    ]
    const entryWindows = entryTexts.flatMap((own, entry) => own.slice(1).map(() => ({ entry })))
    const vectors = await documentVectors(texts)
    return createPayload({ ...content, entryWindows }, vectors, SEARCH_MODEL.revision)
}
