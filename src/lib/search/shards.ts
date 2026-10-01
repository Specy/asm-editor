import { splitLecture } from '$lib/content/lectureSections'
import { getCourse, getLectureContent } from '$lib/content/getters'
import { documentationFor } from '$lib/documentation/documentation'
import {
    entryDocument,
    entryEmbeddingText,
    lectureDocuments,
    windowEmbeddingText,
    type LectureRef
} from './documents'
import { SEARCH_MODEL } from './model'
import { createPayload, type ShardContent, type ShardPayload } from './payload'
import type { CourseSlug, DocumentationLanguage, ShardId } from './scope'
import { documentVectors } from './vectorCache'

/**
 * Builds one shard of the index: its search units from the Documentation or a Course, and their
 * vectors from the cache or the model. The build's endpoint (`/search/<shard>.json`) and the
 * golden-query tests both call this, so the tests search exactly what the browser downloads.
 * Node only.
 */

async function documentationContent(
    shard: ShardId,
    language: DocumentationLanguage
): Promise<ShardContent> {
    const chapters = await documentationFor(language)
    return {
        shard,
        entries: chapters.flatMap((chapter) =>
            chapter.entries.map((entry) => entryDocument(entry, chapter.title))
        ),
        sections: [],
        windows: []
    }
}

async function courseContent(shard: ShardId, slug: CourseSlug): Promise<ShardContent> {
    const course = await getCourse(slug)
    const content: ShardContent = { shard, entries: [], sections: [], windows: [] }
    for (const module of course.modules) {
        for (const lecture of module.lectures) {
            const ref: LectureRef = {
                course: course.slug,
                courseName: course.name,
                module: module.slug,
                lecture: lecture.slug,
                lectureName: lecture.name
            }
            const markdown = await getLectureContent(course.slug, module.slug, lecture.slug)
            const documents = lectureDocuments(ref, splitLecture(markdown))
            const offset = content.sections.length
            content.sections.push(...documents.sections)
            content.windows.push(
                ...documents.windows.map((window) => ({
                    ...window,
                    section: window.section + offset
                }))
            )
        }
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
    const texts = [
        ...content.entries.map(entryEmbeddingText),
        ...content.windows.map((window) =>
            windowEmbeddingText(content.sections[window.section], window)
        )
    ]
    const vectors = await documentVectors(texts)
    return createPayload(content, vectors, SEARCH_MODEL.revision)
}
