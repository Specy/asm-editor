/**
 * A hover's link into the Documentation, which Monaco hands its link openers as a file's path
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision 6).
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { openDocumentationLink, registerDocumentationLinks } from './navigation'

const link = (path: string, fragment = '', scheme = 'file', authority = '') => ({
    scheme,
    authority,
    path,
    fragment
})

const unregister: (() => void)[] = []
afterEach(() => unregister.splice(0).forEach((done) => done()))

describe('a link into the Documentation', () => {
    it('goes to the Workbench registered last, with its section', () => {
        const first = vi.fn(() => true)
        const last = vi.fn(() => true)
        unregister.push(registerDocumentationLinks(first), registerDocumentationLinks(last))
        expect(openDocumentationLink(link('/documentation/x86/executables', 'pseudocode'))).toBe(
            true
        )
        expect(last).toHaveBeenCalledWith('/documentation/x86/executables#pseudocode')
        expect(first).not.toHaveBeenCalled()
        //and to the one before it once it is gone
        unregister.pop()!()
        expect(openDocumentationLink(link('/documentation/x86/instruction/mov'))).toBe(true)
        expect(first).toHaveBeenCalledWith('/documentation/x86/instruction/mov')
    })

    it("is this site's own address, as a hover's link must be", () => {
        vi.stubGlobal('location', {
            host: 'asm-editor.example',
            origin: 'https://asm-editor.example'
        })
        try {
            const open = vi.fn(() => true)
            unregister.push(registerDocumentationLinks(open))
            const page = link(
                '/documentation/x86/executables',
                'listing',
                'https',
                'asm-editor.example'
            )
            expect(openDocumentationLink(page)).toBe(true)
            expect(open).toHaveBeenCalledWith('/documentation/x86/executables#listing')
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('is left to Monaco when no Workbench opens it, or when it leads elsewhere', () => {
        expect(openDocumentationLink(link('/documentation/x86/executables'))).toBe(false)
        const open = vi.fn(() => true)
        unregister.push(registerDocumentationLinks(open))
        expect(
            openDocumentationLink(link('/documentation/x86/syscall', '', 'https', 'example.com'))
        ).toBe(false)
        expect(openDocumentationLink(link('/projects/1'))).toBe(false)
        expect(open).not.toHaveBeenCalled()
    })
})
