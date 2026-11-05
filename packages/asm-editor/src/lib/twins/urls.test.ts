import { describe, expect, it } from 'vite-plus/test'
import { entryTwinPathname, twinPathname } from './urls'

describe('twinPathname', () => {
    it.each([
        ['/documentation', '/documentation.md'],
        ['/documentation/mips', '/documentation/mips.md'],
        ['/documentation/mips/', '/documentation/mips.md'],
        ['/documentation/mips/syscall', '/documentation/mips/syscall.md'],
        ['/documentation/z80/io', '/documentation/z80/io.md'],
        ['/documentation/x86/instruction/add', '/documentation/x86/instruction/add.md'],
        ['/learn/courses', '/learn/courses.md'],
        ['/learn/courses/mips', '/learn/courses/mips.md'],
        [
            '/learn/courses/mips/think-in-assembly/the-stack-and-sp',
            '/learn/courses/mips/think-in-assembly/the-stack-and-sp.md'
        ],
        ['/blog', '/blog.md'],
        ['/blog/posts/getting-started', '/blog/posts/getting-started.md'],
        ['/blog/tags/guide', '/blog/tags/guide.md'],
        ['/examples', '/examples.md'],
        ['/changelog', '/changelog.md']
    ])('%s has its twin at %s', (page, twin) => {
        expect(twinPathname(page)).toBe(twin)
    })

    it.each([
        '/',
        '/projects',
        '/projects/create',
        '/embed',
        '/exam',
        '/chat',
        '/apps/mars',
        '/donate',
        '/documentation/mips/all',
        '/documentation/cobol',
        '/documentation/mips/nothing',
        '/learn/courses/examples',
        '/learn/courses/examples/m68k/fibonacci',
        '/learn/courses/mips/think-in-assembly'
    ])('%s has no twin', (page) => {
        expect(twinPathname(page)).toBeUndefined()
    })
})

describe('entryTwinPathname', () => {
    it('puts an entry with its own page beside the page, and any other below its Chapter page', () => {
        expect(
            entryTwinPathname({ href: '/documentation/mips/instruction/addi', anchor: 'addi' })
        ).toBe('/documentation/mips/instruction/addi.md')
        expect(
            entryTwinPathname({
                href: '/documentation/mips/syscall#service-1',
                anchor: 'service-1'
            })
        ).toBe('/documentation/mips/syscall/service-1.md')
    })
})
