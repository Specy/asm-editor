<script lang="ts">
    import type { AnnotationPrompt } from '#lib/workbench/annotationPrompt.svelte.ts'
    import PromptTray from './PromptTray.svelte'

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

    const problem = $derived(prompt.problem)
    const reason = $derived(prompt.failure ?? problem)
    const name = $derived(prompt.spec.kind === 'name')
    const label = $derived(name ? 'Name' : 'Comment')

    function submit() {
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
</script>

<PromptTray
    class="annotation-prompt"
    {titleId}
    {prompt}
    action="Save"
    submittable={problem === undefined}
    onsubmit={submit}
    {onclose}
    ondelete={prompt.deletable ? remove : undefined}
    {onrelease}
>
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
</PromptTray>

<style lang="scss">
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
</style>
