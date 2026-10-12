import type { PatchPreview, PatchSite } from '#lib/listing/listingPatcher.svelte.ts'

/** How long typing waits before the text is assembled again for the preview. */
export const PATCH_PREVIEW_DELAY_MS = 150

/** What the prompt needs of the patcher: a preview of some text, and writing one. */
export type PatchPromptPatcher = {
    preview(site: PatchSite, text: string): Promise<PatchPreview>
    apply(preview: PatchPreview): boolean
}

/**
 * The prompt "Patch instruction…" opens over a Listing line
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13, and the plan's
 * planning decision 12): the line's instruction to retype, and a preview, made as the person
 * types, of the bytes the text assembles to and the instruction those bytes decode as. Only a
 * preview of the text as it stands is applied, so nothing is written that was not shown.
 */
export class PatchPrompt {
    text = $state('')
    /** The newest preview, which may be of an earlier text: see {@link current}. */
    preview = $state.raw<PatchPreview | undefined>()
    /** Whether a preview is being made. */
    assembling = $state(false)
    /** Why the last Patch failed, when writing it threw. */
    failure = $state<string | undefined>()
    private requested = 0
    private timer: ReturnType<typeof setTimeout> | undefined

    constructor(
        readonly site: PatchSite,
        private readonly patcher: PatchPromptPatcher,
        /** The Build whose Debug session it was opened in: it belongs to no other. */
        readonly buildGeneration = 0
    ) {
        this.text = site.text
    }

    /** The preview of the text as it stands, once made. */
    get current(): PatchPreview | undefined {
        return this.preview?.text === this.text ? this.preview : undefined
    }

    /** Whether Patch would write something: a preview of this text that changes memory. */
    get applicable(): boolean {
        const preview = this.current
        return !!preview?.ok && !preview.unchanged
    }

    /** New text from the person, previewed once they pause typing. */
    input(text: string): void {
        this.text = text
        this.failure = undefined
        clearTimeout(this.timer)
        this.timer = setTimeout(() => void this.update(), PATCH_PREVIEW_DELAY_MS)
    }

    /** Makes the preview of the text as it stands now. */
    async update(): Promise<PatchPreview> {
        clearTimeout(this.timer)
        const text = this.text
        const request = ++this.requested
        this.assembling = true
        try {
            const preview = await this.patcher.preview(this.site, text)
            if (request === this.requested) this.preview = preview
            return preview
        } finally {
            if (request === this.requested) this.assembling = false
        }
    }

    /** Writes the previewed bytes as one Poke; false when there is nothing current to write. */
    apply(): boolean {
        const preview = this.current
        if (!preview?.ok || preview.unchanged) return false
        return this.patcher.apply(preview)
    }

    dispose(): void {
        clearTimeout(this.timer)
        ++this.requested
    }
}
