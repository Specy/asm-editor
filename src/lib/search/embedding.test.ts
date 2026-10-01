import { describe, expect, it } from 'vitest'
import {
    cosine,
    dequantize,
    fromBase64,
    quantize,
    shorten,
    toBase64,
    truncateTokens
} from './embedding'
import { hasModelFiles, nodeEmbedder } from './embeddingNode'
import { VECTOR_DIMS } from './model'

describe('embedding helpers', () => {
    it('cuts a long token sequence and keeps the closing separator', () => {
        expect(truncateTokens([1, 2, 3, 4, 5], 3, 9)).toEqual([1, 2, 9])
        expect(truncateTokens([1, 2], 3, 9)).toEqual([1, 2])
    })

    it('keeps the first dimensions and scales them to length 1', () => {
        const vector = new Float32Array(768).fill(0.5)
        const short = shorten(vector)
        expect(short).toHaveLength(VECTOR_DIMS)
        expect(cosine(short, short)).toBeCloseTo(1)
        expect(Math.hypot(...short)).toBeCloseTo(1)
    })

    it('survives int8 and base64 with little loss', () => {
        const vectors = [0, 1, 2].map((seed) => {
            const vector = new Float32Array(VECTOR_DIMS)
            for (let i = 0; i < VECTOR_DIMS; i++) vector[i] = Math.sin(i * (seed + 1))
            return shorten(vector)
        })
        const bytes = quantize(vectors)
        const text = toBase64(new Uint8Array(bytes.buffer))
        const back = fromBase64(text)
        const restored = dequantize(new Int8Array(back.buffer))
        restored.forEach((vector, i) => expect(cosine(vector, vectors[i])).toBeGreaterThan(0.999))
    })
})

/**
 * The spike of 2026-10-01, kept as a check that the model, the tokenizer and ONNX Runtime still
 * fit together: each question finds its M68K answer first. Runs only where `.cache/` holds the model
 * (`npm run search:model`).
 */
describe.runIf(hasModelFiles())('the model', () => {
    const documents = [
        'TRAP #15 task 3: Display the signed number in D1.L in decimal.',
        'MOVE: Copies the source operand to the destination operand. Sizes byte, word, long.',
        'DBRA: Decrement the data register and branch if it is not -1. Used for counted loops.',
        'Double buffering: the program draws into a hidden image and presents it with a single call, so the screen never shows a half drawn frame.',
        'Print a string: put the address of a null terminated string in A1 and call trap #15 with task 14.',
        'MULS: Signed multiply of two 16 bit values giving a 32 bit result.',
        'The stack grows downward; JSR pushes the return address and RTS pops it.'
    ]
    const questions: [string, number][] = [
        ['how do I print a number', 0],
        ['move', 1],
        ['loop a fixed number of times', 2],
        ['avoid flicker when drawing', 3],
        ['call a subroutine and return', 6],
        ['multiply negative numbers', 5]
    ]

    it('ranks the right answer first', { timeout: 60_000 }, async () => {
        const embedder = await nodeEmbedder()
        const docs = await embedder.embed(documents, 'document')
        const queries = await embedder.embed(
            questions.map(([question]) => question),
            'query'
        )
        expect(docs[0]).toHaveLength(VECTOR_DIMS)
        questions.forEach(([question, answer], i) => {
            const scores = docs.map((doc) => cosine(queries[i], doc))
            const best = scores.indexOf(Math.max(...scores))
            expect(best, question).toBe(answer)
        })
    })
})
