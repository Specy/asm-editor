/**
 * A share link refuses a Project that cannot fit in its 32,000 characters at once, before it
 * compresses it: compressing a 16 MiB Project held the page for seconds before it said no, and a
 * 64 MiB one ended in a RangeError ([ADR 0076](../../../../docs/adr/0076-a-project-holds-64-mib-of-files.md)).
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import lzstring from 'lz-string'
import { makeProject } from './Project.svelte'
import { serializer } from './json'
import {
    createSharePayload,
    SHARE_CONTENT_LIMIT,
    SHARE_PAYLOAD_LIMIT,
    ShareTooLargeError
} from './utils'

afterEach(() => vi.restoreAllMocks())

/** Text lz-string can do little with: base64 of bytes from a simple generator. */
function noise(length: number) {
    let state = 12345
    const bytes = new Uint8Array(Math.ceil((length * 3) / 4))
    for (let index = 0; index < bytes.length; index++) {
        state = (state * 1103515245 + 12345) >>> 0
        bytes[index] = state >>> 24
    }
    let raw = ''
    for (let index = 0; index < bytes.length; index += 8192)
        raw += String.fromCharCode(...bytes.subarray(index, index + 8192))
    return btoa(raw).slice(0, length)
}

describe('a share link', () => {
    it('refuses a Project whose Files hold more than 1 MiB without compressing it', () => {
        const compress = vi.spyOn(lzstring, 'compressToEncodedURIComponent')
        const project = makeProject({
            language: 'RISC-V',
            files: { 'main.s': { encoding: 'plain', content: 'nop\n'.repeat(5 * 1024 * 1024) } }
        })
        const started = performance.now()
        expect(() => createSharePayload(project)).toThrow(ShareTooLargeError)
        expect(() => createSharePayload(project)).toThrow(
            'This Project is too large to share as a link'
        )
        expect(compress).not.toHaveBeenCalled()
        expect(performance.now() - started).toBeLessThan(500)
    })

    it('refuses a smaller one once the start of it alone passes the limit', () => {
        const compress = vi.spyOn(lzstring, 'compressToEncodedURIComponent')
        const content = noise(SHARE_CONTENT_LIMIT / 2)
        const project = makeProject({
            language: 'RISC-V',
            files: { 'main.s': { encoding: 'plain', content } }
        })
        expect(() => createSharePayload(project)).toThrow(ShareTooLargeError)
        //only the start was compressed, not the whole of it
        expect(compress).toHaveBeenCalledOnce()
        expect(compress.mock.calls[0][0].length).toBeLessThan(content.length / 2)
    })

    it('still carries a large Project that compresses into a link', () => {
        const project = makeProject({
            language: 'RISC-V',
            files: { 'main.s': { encoding: 'plain', content: 'nop\n'.repeat(150_000) } }
        })
        const payload = createSharePayload(project)
        expect(payload.length).toBeLessThanOrEqual(SHARE_PAYLOAD_LIMIT)
        const shared = serializer.parse<{ files: Record<string, { content: string }> }>(
            lzstring.decompressFromEncodedURIComponent(payload)!
        )
        expect(shared.files['main.s'].content).toBe(project.files['main.s'].content)
    })
})
