import { describe, expect, it } from 'vite-plus/test'
import { cosine } from './embedding'
import { VECTOR_DIMS } from './model'
import {
    createPayload,
    isOtherFormat,
    isPayload,
    payloadVectors,
    PAYLOAD_FORMAT,
    unitCount,
    type EntryDocument
} from './payload'

function entry(name: string): EntryDocument {
    return {
        id: `mips/instructions/${name}`,
        language: 'mips',
        chapter: 'instructions',
        chapterTitle: 'Instructions',
        entryKind: 'instruction',
        title: name,
        names: [name],
        signature: '',
        summary: `The ${name} instruction.`,
        text: '',
        code: '',
        href: `/documentation/mips/instruction/${name}`
    }
}

/** A unit vector whose values all have one sign pattern, told apart by `seed`. */
function vector(seed: number): Float32Array {
    const out = new Float32Array(VECTOR_DIMS)
    for (let i = 0; i < VECTOR_DIMS; i++) out[i] = Math.sin((i + 1) * (seed + 1)) / 8
    const length = Math.hypot(...out)
    return out.map((value) => value / length)
}

describe('shard payloads', () => {
    it("keeps each entry's first vector, then its further windows, through JSON", () => {
        const content = {
            shard: 'docs-mips' as const,
            entries: [entry('add'), { ...entry('syscall'), questions: ['How do I exit?'] }],
            sections: [],
            windows: [],
            entryWindows: [{ entry: 1 }, { entry: 1 }],
            wordLikeNames: ['add']
        }
        const vectors = [0, 1, 2, 3].map(vector)
        expect(unitCount(content)).toBe(4)
        const payload = JSON.parse(JSON.stringify(createPayload(content, vectors, 'test')))
        expect(isPayload(payload)).toBe(true)
        expect(payload).toMatchObject({
            format: PAYLOAD_FORMAT,
            entryWindows: [{ entry: 1 }, { entry: 1 }],
            wordLikeNames: ['add']
        })
        expect(payload.entries[1].questions).toEqual(['How do I exit?'])
        const back = payloadVectors(payload)!
        expect(back).toHaveLength(4)
        back.forEach((restored, i) => expect(cosine(restored, vectors[i])).toBeGreaterThan(0.99))
    })

    it('counts the vectors it needs, and refuses a different number', () => {
        const content = {
            shard: 'docs-mips' as const,
            entries: [entry('add')],
            sections: [],
            windows: []
        }
        expect(() => createPayload(content, [vector(0), vector(1)], 'test')).toThrow(/2 vectors/)
        expect(createPayload(content, null, null)).toMatchObject({
            vectors: null,
            entryWindows: [],
            wordLikeNames: []
        })
    })

    it('refuses a shard of another format, and says so', () => {
        const current = createPayload(
            { shard: 'docs-mips', entries: [entry('add')], sections: [], windows: [] },
            null,
            null
        )
        // as format 1 wrote it: no entry windows, no word-like names
        const formatOne: Record<string, unknown> = { ...current, format: 1 }
        delete formatOne.entryWindows
        delete formatOne.wordLikeNames
        expect(isPayload(formatOne)).toBe(false)
        expect(isOtherFormat(formatOne)).toBe(true)
        expect(isOtherFormat(current)).toBe(false)
        expect(isOtherFormat({ hello: 'world' })).toBe(false)
    })
})
