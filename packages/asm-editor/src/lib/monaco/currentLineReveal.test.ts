import { describe, expect, it } from 'vite-plus/test'
import { CurrentLineReveal } from './currentLineReveal'

/** Monaco's `editor.ScrollType`. */
const SCROLL = { Smooth: 0, Immediate: 1 } as const

describe("the current line's reveal", () => {
    it('jumps the first time in each model and slides within it', () => {
        const calls: [number, number | undefined][] = []
        const editor = {
            revealLineInCenter: (line: number, scroll?: number) => void calls.push([line, scroll])
        }
        const reveal = new CurrentLineReveal()
        //a Build's model: the size of the editor changes as it opens, which a smooth scroll
        //would not survive
        reveal.reveal(editor, SCROLL, 'build-1/crackme#listing', 179)
        //Steps within it
        reveal.reveal(editor, SCROLL, 'build-1/crackme#listing', 180)
        reveal.reveal(editor, SCROLL, 'build-1/crackme#listing', 181)
        //into another File, and back
        reveal.reveal(editor, SCROLL, 'build-1/@lib/libc.so.6#listing', 9)
        reveal.reveal(editor, SCROLL, 'build-1/crackme#listing', 182)
        //the next Build's model
        reveal.reveal(editor, SCROLL, 'build-2/crackme#listing', 179)
        expect(calls).toEqual([
            [179, SCROLL.Immediate],
            [180, SCROLL.Smooth],
            [181, SCROLL.Smooth],
            [9, SCROLL.Immediate],
            [182, SCROLL.Immediate],
            [179, SCROLL.Immediate]
        ])
    })
})
