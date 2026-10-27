import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import StdOutRenderer from './StdOutRenderer.svelte'
import { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
import { ExecutionController } from '#lib/languages/ExecutionController.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'

let app: ReturnType<typeof mount> | null = null

afterEach(() => {
    if (app) void unmount(app)
    app = null
    document.body.innerHTML = ''
})

function render(diagnostics: Diagnostic[]) {
    //the mark flies in, which jsdom cannot animate
    Element.prototype.animate = (() => ({
        cancel() {},
        finish() {},
        onfinish: null,
        finished: Promise.resolve()
    })) as unknown as typeof Element.prototype.animate
    Element.prototype.getAnimations ??= () => []
    const terminal = new Terminal({ executionController: new ExecutionController(() => {}) })
    app = mount(StdOutRenderer, {
        target: document.body,
        props: { terminal, diagnostics, onDiagnosticSelect: () => {} }
    })
    flushSync()
}

const warning: Diagnostic = {
    severity: 'warning',
    lineIndex: 0,
    column: 1,
    message: 'unused label',
    formatted: 'unused label'
}

describe("the console's compiler mark", () => {
    it('marks what the compiler found, beside the list that shows it, and offers no toggle', () => {
        render([warning])
        const mark = document.querySelector<HTMLElement>('.floating-std-icon')!
        expect(mark.tagName).toBe('SPAN')
        expect(mark.getAttribute('role')).toBe('img')
        expect(tooltipText(mark)).toBe('Compiler warnings')
        expect(document.body.textContent).toContain('unused label')
        expect(document.querySelector('button.floating-std-icon')).toBeNull()
    })
})
