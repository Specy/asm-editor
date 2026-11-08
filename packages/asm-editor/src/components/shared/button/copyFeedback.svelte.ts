import { PILL_DURATION } from '#stores/toastStore.ts'

/**
 * Whether a copy button says "Copied" (CopyLabel): from a copy that worked for as long as the pill
 * saying so shows, then its own label again. A copy that failed leaves its label, and its toast
 * says why. `CopyButton` keeps one; a button of another look keeps its own beside a CopyLabel.
 */
export class CopyFeedback {
    copied = $state(false)
    #timer: ReturnType<typeof setTimeout> | undefined

    /** Runs `copy`, which answers whether the text reached the clipboard. */
    async run(copy: () => boolean | Promise<boolean>) {
        const worked = await copy()
        clearTimeout(this.#timer)
        this.copied = worked
        if (worked) this.#timer = setTimeout(() => (this.copied = false), PILL_DURATION)
    }
}
