<script lang="ts">
    import { tick } from 'svelte'
    import type { AnnotationPrompt } from '#lib/workbench/annotationPrompt.svelte.ts'

    /**
     * Rename…, Comment… and Function comment…'s prompt
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
     * 18), over the Listing line it was opened on as the Patch prompt is, or over the Symbols
     * panel: a name in one line, or a comment in several, with the reason the text cannot be saved
     * under it as it is typed. Enter saves, Shift+Enter starts a comment's next line, and Escape or
     * Cancel leaves everything as it was. Delete, shown for a comment there is, deletes it, as
     * saving it empty does.
     */
    let {
        prompt,
        onsave,
        onclose,
        onrelease
    }: {
        prompt: AnnotationPrompt
        onsave: () => void
        onclose: () => void
        /**
         * Gives the keyboard back when the prompt goes away while it holds it without being closed:
         * its pane showed another File.
         */
        onrelease?: () => void
    } = $props()

    const uid = $props.id()
    const titleId = `annotation-prompt-title-${uid}`
    const reasonId = `annotation-prompt-reason-${uid}`
    let dialog = $state<HTMLElement>()
    let field = $state<HTMLInputElement | HTMLTextAreaElement>()
    //the keyboard goes to the text, selected, each time a prompt opens
    $effect(() => {
        void prompt
        void tick().then(() => {
            field?.focus()
            field?.select()
        })
    })
    let holding = false
    $effect(() => () => {
        if (holding) onrelease?.()
    })
    function focusout(event: FocusEvent) {
        const next = event.relatedTarget
        if (next instanceof Node && !dialog?.contains(next)) holding = false
    }

    const problem = $derived(prompt.problem)
    const reason = $derived(prompt.failure ?? problem)
    const name = $derived(prompt.spec.kind === 'name')
    const label = $derived(name ? 'Name' : 'Comment')

    function submit(event?: SubmitEvent) {
        event?.preventDefault()
        if (problem === undefined) onsave()
    }

    /** Delete: the comment goes, as Delete comment takes it, and the prompt closes. */
    function remove() {
        if (prompt.remove()) onclose()
    }

    /** Enter saves a comment as it saves a name, and Shift+Enter starts its next line. */
    function fieldKeydown(event: KeyboardEvent) {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || !prompt.multiline)
            return
        event.preventDefault()
        submit()
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
        const focusable = [
            ...dialog.querySelectorAll<HTMLElement>('input, textarea, button:not(:disabled)')
        ]
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
    class="annotation-prompt"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    onkeydown={keydown}
    onfocusin={() => (holding = true)}
    onfocusout={focusout}
>
    <form class="annotation-form" onsubmit={submit}>
        <div class="annotation-title">
            <span id={titleId} class="ellipsis">{prompt.spec.title}</span>
        </div>
        {#if prompt.spec.note}
            <p class="annotation-note">{prompt.spec.note}</p>
        {/if}
        <div class="annotation-field" class:invalid={reason !== undefined}>
            {#if prompt.spec.prefix}
                <span class="annotation-prefix" aria-hidden="true">{prompt.spec.prefix}</span>
            {/if}
            {#if prompt.multiline}
                <textarea
                    bind:this={field}
                    class="annotation-input"
                    value={prompt.text}
                    oninput={(event) => prompt.input(event.currentTarget.value)}
                    onkeydown={fieldKeydown}
                    rows="4"
                    spellcheck="true"
                    aria-label={label}
                    aria-invalid={reason !== undefined}
                    aria-describedby={reason !== undefined ? reasonId : undefined}></textarea>
            {:else}
                <input
                    bind:this={field}
                    class="annotation-input"
                    value={prompt.text}
                    oninput={(event) => prompt.input(event.currentTarget.value)}
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                    aria-label={label}
                    aria-invalid={reason !== undefined}
                    aria-describedby={reason !== undefined ? reasonId : undefined}
                />
            {/if}
        </div>
        <div class="annotation-reason" aria-live="polite">
            {#if reason !== undefined}
                <p id={reasonId} class="annotation-error">{reason}</p>
            {:else if prompt.multiline}
                <p class="annotation-hint">Press Enter to save, Shift+Enter to add a line.</p>
            {/if}
        </div>
        <div class="annotation-row">
            {#if prompt.deletable}
                <button type="button" class="tool delete" onclick={remove}>Delete</button>
            {/if}
            <button type="button" class="tool" onclick={onclose}>Cancel</button>
            <button type="submit" class="tool primary" disabled={problem !== undefined}>Save</button
            >
        </div>
    </form>
</div>

<style lang="scss">
    /* drawn as the Workbench's prompt tray, over the top of the editor or panel it was opened in */
    .annotation-prompt {
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

    .annotation-form {
        display: contents;
    }

    .annotation-title {
        display: flex;
        min-width: 0;
        padding: 0 0.2rem;
    }

    .ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .annotation-note,
    .annotation-hint {
        margin: 0;
        padding: 0 0.2rem;
        font-size: 0.8rem;
        opacity: 0.75;
        overflow-wrap: anywhere;
    }

    .annotation-field {
        display: flex;
        align-items: stretch;
        border: 1px solid var(--tray-line);
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);

        &:focus-within {
            outline: 2px solid var(--accent);
            outline-offset: -1px;
        }

        &.invalid:focus-within {
            outline-color: var(--red);
        }
    }

    .annotation-prefix {
        display: flex;
        align-items: center;
        padding-left: 0.6rem;
        font-family: 'Fira Code', monospace;
        opacity: 0.7;
    }

    .annotation-input {
        flex: 1;
        min-width: 0;
        box-sizing: border-box;
        padding: 0.45rem 0.6rem;
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font-family: 'Fira Code', monospace;
        font-size: 0.9rem;
    }

    textarea.annotation-input {
        resize: vertical;
        min-height: 4.5rem;
        max-height: 40vh;
    }

    .annotation-prefix + .annotation-input {
        padding-left: 0;
    }

    .annotation-reason {
        min-height: 1.2rem;
        padding: 0 0.2rem;
        overflow-wrap: anywhere;

        p {
            margin: 0;
        }
    }

    .annotation-error {
        color: var(--red);
    }

    .annotation-row {
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

    /* apart from Cancel and Save, at the row's start */
    .delete {
        margin-right: auto;
        color: var(--red);
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
