<script lang="ts">
    import type { PatchPrompt } from '#lib/workbench/patchPrompt.svelte.ts'
    import PromptTray from './PromptTray.svelte'

    /**
     * "Patch instruction…" over a Listing line
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13): the line's
     * instruction to retype, and before anything is written, the bytes the text assembles to and
     * the instruction those bytes decode as, which is what the line will show. Enter or Patch
     * writes them as one Poke; Escape or Cancel leaves memory as it is.
     */
    let {
        prompt,
        available,
        onapply,
        onclose,
        onrelease
    }: {
        prompt: PatchPrompt
        /** Whether a Poke is possible now: the program paused, not waiting for input, not ended. */
        available: boolean
        onapply: () => void
        onclose: () => void
        /**
         * Gives the keyboard back, to the editor, when the prompt goes away while it holds it
         * without being closed: the Debug session it was opened in ended.
         */
        onrelease?: () => void
    } = $props()

    const uid = $props.id()
    const titleId = `patch-prompt-title-${uid}`

    const hex = (bytes: Uint8Array) =>
        Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
    /** The preview of the text as typed, or while that is being made, the one before it, dimmed. */
    const shown = $derived(prompt.current ?? prompt.preview)
    const stale = $derived(prompt.current === undefined)
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

    function submit() {
        if (!available) return
        if (prompt.applicable) onapply()
        else if (!prompt.current) void prompt.update()
    }
</script>

<PromptTray
    class="patch-prompt"
    {titleId}
    {prompt}
    action="Patch"
    submittable={available && prompt.applicable}
    onsubmit={submit}
    {onclose}
    {onrelease}
>
    <div class="patch-title">
        <span id={titleId}
            >Patch the instruction at <code>0x{prompt.site.address.toString(16)}</code></span
        >
        <span class="patch-size">{plural(prompt.site.length, 'byte')}</span>
    </div>
    <input
        class="patch-input"
        value={prompt.text}
        oninput={(event) => prompt.input(event.currentTarget.value)}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        aria-label="Instruction"
    />
    <div class="patch-preview" class:stale aria-live="polite">
        {#if !available}
            <p class="patch-note">
                Patching needs the program paused: not running, not waiting for input and not ended.
            </p>
        {:else if prompt.failure}
            <p class="patch-error" role="alert">{prompt.failure}</p>
        {:else if shown?.ok}
            <div class="patch-decoded">
                Decodes as <code
                    >{shown.line.instruction}{shown.line.comments.length
                        ? ` ; ${shown.line.comments.join(', ')}`
                        : ''}</code
                >
            </div>
            <div class="patch-bytes">
                Bytes <code>{hex(shown.bytes)}</code>
                <span class="patch-was">(was <code>{hex(shown.was)}</code>)</span>
            </div>
            {#if shown.unchanged}
                <p class="patch-note">Memory already holds these bytes.</p>
            {/if}
        {:else if shown}
            <p class="patch-error" role="alert">{shown.error}</p>
        {:else}
            <p class="patch-note">Assembling…</p>
        {/if}
    </div>
</PromptTray>

<style lang="scss">
    code,
    .patch-input {
        font-family: 'Fira Code', monospace;
    }

    .patch-title {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding: 0 0.2rem;
    }

    .patch-size {
        opacity: 0.7;
    }

    .patch-input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.45rem 0.6rem;
        border: 1px solid var(--tray-line);
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-size: 0.9rem;
    }

    .patch-input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -1px;
    }

    .patch-preview {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-height: 2.6rem;
        padding: 0 0.2rem;
        overflow-wrap: anywhere;
        transition: opacity 0.15s;
    }

    .patch-preview.stale {
        opacity: 0.55;
    }

    .patch-preview p {
        margin: 0;
    }

    .patch-was,
    .patch-note {
        opacity: 0.75;
    }

    .patch-error {
        color: var(--red);
    }
</style>
