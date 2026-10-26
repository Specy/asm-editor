<script lang="ts">
    import { tick, type Snippet } from 'svelte'

    /**
     * The Workbench's prompt tray, which the Patch prompt and the annotation prompt are drawn in: a
     * modal dialog at the top centre of the pane or panel it was opened over, named by its title in
     * `children`, with Cancel and the button that goes on in its bottom row, and Delete before them
     * where there is something to delete.
     */
    let {
        class: className,
        titleId,
        prompt,
        action,
        submittable,
        onsubmit,
        onclose,
        ondelete,
        onrelease,
        children
    }: {
        /** Which prompt it is, the tray's own class beside it. */
        class: string
        /** The id of the title in `children` that names the dialog. */
        titleId: string
        /** The prompt shown, which takes the keyboard each time it is another. */
        prompt: unknown
        /** The label of the button that goes on, which Enter presses. */
        action: string
        /** Whether that button can be pressed. */
        submittable: boolean
        onsubmit: () => void
        onclose: () => void
        /** Delete, at the row's start, shown only when given. */
        ondelete?: () => void
        /**
         * Gives the keyboard back when the prompt goes away while it holds it without being closed,
         * as when its pane shows another File or the Debug session it was opened in ends.
         */
        onrelease?: () => void
        children: Snippet
    } = $props()

    let dialog = $state<HTMLElement>()
    //the keyboard goes to the first field, its text selected, each time a prompt opens
    $effect(() => {
        void prompt
        void tick().then(() => {
            const field = dialog?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                'input, textarea'
            )
            field?.focus()
            field?.select()
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

    function submit(event: SubmitEvent) {
        event.preventDefault()
        onsubmit()
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
    class="prompt-tray {className}"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    onkeydown={keydown}
    onfocusin={() => (holding = true)}
    onfocusout={focusout}
>
    <form class="prompt-form" onsubmit={submit}>
        {@render children()}
        <div class="prompt-row">
            {#if ondelete}
                <button type="button" class="tool delete" onclick={ondelete}>Delete</button>
            {/if}
            <button type="button" class="tool" onclick={onclose}>Cancel</button>
            <button type="submit" class="tool primary" disabled={!submittable}>{action}</button>
        </div>
    </form>
</div>

<style lang="scss">
    /* drawn as the Workbench's prompt tray, over the top of the editor or panel it was opened in */
    .prompt-tray {
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

    .prompt-form {
        display: contents;
    }

    .prompt-row {
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

    /* apart from Cancel and the button that goes on, at the row's start */
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
