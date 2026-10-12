<script lang="ts">
    import { tick } from 'svelte'
    import type { PatchPrompt } from '#lib/workbench/patchPrompt.svelte.ts'

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
    let dialog = $state<HTMLElement>()
    let input = $state<HTMLInputElement>()
    //the keyboard goes to the instruction, selected, each time a prompt opens
    $effect(() => {
        void prompt
        void tick().then(() => {
            input?.focus()
            input?.select()
        })
    })
    /**
     * Whether the keyboard is inside: set as focus enters, cleared only when it moves to something
     * else, since the browser may say nothing, or that focus went nowhere, as the prompt is removed.
     */
    let holding = false
    $effect(() => () => {
        if (holding) onrelease?.()
    })
    function focusout(event: FocusEvent) {
        const next = event.relatedTarget
        if (next instanceof Node && !dialog?.contains(next)) holding = false
    }

    const hex = (bytes: Uint8Array) =>
        Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
    /** The preview of the text as typed, or while that is being made, the one before it, dimmed. */
    const shown = $derived(prompt.current ?? prompt.preview)
    const stale = $derived(prompt.current === undefined)
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

    function submit(event: SubmitEvent) {
        event.preventDefault()
        if (!available) return
        if (prompt.applicable) onapply()
        else if (!prompt.current) void prompt.update()
    }

    /**
     * Escape closes it from anywhere inside, and Tab goes round its own controls: it is a modal
     * dialog over the editor until it is closed.
     */
    function keydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onclose()
            return
        }
        if (event.key !== 'Tab' || !dialog) return
        const focusable = [...dialog.querySelectorAll<HTMLElement>('input, button:not(:disabled)')]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first) return
        const active = document.activeElement
        if (event.shiftKey ? active === first || !dialog.contains(active) : active === last) {
            event.preventDefault()
            ;(event.shiftKey ? last : first).focus()
        }
    }
</script>

<div
    bind:this={dialog}
    class="patch-prompt"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    onkeydown={keydown}
    onfocusin={() => (holding = true)}
    onfocusout={focusout}
>
    <form class="patch-form" onsubmit={submit}>
        <div class="patch-title">
            <span id={titleId}
                >Patch the instruction at <code>0x{prompt.site.address.toString(16)}</code></span
            >
            <span class="patch-size">{plural(prompt.site.length, 'byte')}</span>
        </div>
        <input
            bind:this={input}
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
                    Patching needs the program paused: not running, not waiting for input and not
                    ended.
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
        <div class="patch-row">
            <button type="button" class="tool" onclick={onclose}>Cancel</button>
            <button type="submit" class="tool primary" disabled={!available || !prompt.applicable}
                >Patch</button
            >
        </div>
    </form>
</div>

<style lang="scss">
    /* drawn as the Workbench's prompt tray, over the top of the editor it patches */
    .patch-prompt {
        --tray-line: color-mix(in srgb, var(--tertiary) 60%, transparent);
        position: absolute;
        z-index: 6;
        top: 0.6rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        width: min(32rem, calc(100% - 1.2rem));
        box-sizing: border-box;
        padding: 0.6rem;
        color: var(--primary-text);
        border: 1px solid var(--tray-line);
        border-radius: 0.6rem;
        background-color: color-mix(in srgb, var(--primary) 88%, transparent);
        backdrop-filter: blur(4px);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        font-family: Rubik;
        font-size: 0.9rem;
    }

    .patch-form {
        display: contents;
    }

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

    .patch-row {
        display: flex;
        gap: 0.2rem;
        height: 2.1rem;
        justify-content: flex-end;
    }

    .tool {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 0 0.9rem;
        border: none;
        border-radius: 0.4rem;
        background-color: transparent;
        color: var(--primary-text);
        font-family: Rubik;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
    }

    .tool:hover:not(:disabled) {
        background-color: color-mix(in srgb, var(--tertiary) 55%, transparent);
    }

    .tool:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }

    .primary {
        min-width: 4.5rem;
        background-color: var(--accent);
        color: var(--accent-text);
    }

    .primary:hover:not(:disabled) {
        background-color: color-mix(in srgb, var(--accent) 85%, white);
    }

    .primary:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
