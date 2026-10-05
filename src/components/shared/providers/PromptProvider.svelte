<script lang="ts">
    import { Prompt, PromptType } from '$stores/promptStore.svelte'
    import { ScopedTheme } from '$stores/themeStore.svelte'
    import { fade } from 'svelte/transition'
    import { tick } from 'svelte'

    import Input from '$cmp/shared/input/Input.svelte'
    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()

    let value = $state('')
    let currentId = $state(0)
    let inputEl = $state<HTMLInputElement | undefined>()
    $effect(() => {
        if (Prompt.id !== currentId) {
            currentId = Prompt.id
            value = ''
            //every prompt takes the keyboard, not just the ones that arrive with the form off the
            //screen. A program that asks twice in a row — EASy68K's task 18 for each of two numbers —
            //asks again before this form has finished leaving, and Svelte keeps the element it was
            //about to remove rather than building a new one: the input's own mount-time focus never
            //runs again, and the answer the user clicked Ok for leaves the focus on that button.
            //After a tick, so the element of the prompt now being asked is the one focused.
            tick().then(() => inputEl?.focus())
        }
    })
</script>

{@render children?.()}
{#if Prompt.promise}
    <form
        class="prompt-wrapper"
        style={ScopedTheme.variables}
        out:fade|global={{ duration: 150 }}
        onsubmit={(e) => {
            e.preventDefault()
            if (Prompt.type === PromptType.Text) Prompt.answerText(value)
        }}
    >
        <div class="prompt-text">
            {Prompt.question}
        </div>
        {#if Prompt.type === PromptType.Text}
            <Input
                focus
                bind:value
                bind:el={inputEl}
                hideStatus
                style="border: 1px solid var(--tray-line);"
                onkeydown={(e) => {
                    //Ctrl+D on an empty line ends standard input, as it does in a terminal; with
                    //text typed it does nothing, so a stray shortcut never throws a half-typed
                    //line away
                    if (
                        Prompt.endOfInput &&
                        e.ctrlKey &&
                        !e.altKey &&
                        !e.metaKey &&
                        e.key.toLowerCase() === 'd'
                    ) {
                        e.preventDefault()
                        if (value === '') Prompt.answerEndOfInput()
                    }
                }}
            />
        {/if}

        <!-- the Workbench's tray: only the answer that goes on is filled, the rest are their label -->
        <div class="prompt-row">
            {#if Prompt.type === PromptType.Text}
                {#if Prompt.cancellable}
                    <button type="button" class="tool" onclick={() => Prompt.cancel()}
                        >Cancel</button
                    >
                {/if}
                {#if Prompt.endOfInput}
                    <button
                        type="button"
                        class="tool"
                        title="End the program's standard input (Ctrl+D on an empty line)"
                        onclick={() => Prompt.answerEndOfInput()}>End of input</button
                    >
                {/if}
                <button type="button" class="tool primary" onclick={() => Prompt.answerText(value)}
                    >Ok</button
                >
            {:else}
                <button type="button" class="tool" onclick={() => Prompt.answerConfirm(false)}
                    >No</button
                >
                <button
                    type="button"
                    class="tool primary"
                    onclick={() => Prompt.answerConfirm(true)}>Yes</button
                >
            {/if}
        </div>
    </form>
{/if}

<style lang="scss">
    /* drawn as the Workbench's execution trays where they float over the code: a translucent tint
       that blurs what is beneath, a hairline edge, lifted by a shadow */
    .prompt-wrapper {
        --tray-line: color-mix(in srgb, var(--tertiary) 60%, transparent);
        display: flex;
        position: fixed;
        top: 1rem;
        overflow: hidden;
        max-height: 20rem;
        max-width: min(25rem, calc(100vw - 2rem));
        min-width: min(20rem, calc(100vw - 2rem));
        gap: 0.5rem;
        color: var(--primary-text);
        border: 1px solid var(--tray-line);
        border-radius: 0.6rem;
        background-color: color-mix(in srgb, var(--primary) 80%, transparent);
        backdrop-filter: blur(4px);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        z-index: 20;
        padding: 0.6rem;
        font-family: Rubik;
        transition: transform 0.3s ease-out;
        flex-direction: column;
        animation: slideIn 0.25s ease-out;
        animation-fill-mode: forwards;
        transform: translateX(calc(50vw - 50%));
    }

    @keyframes slideIn {
        from {
            transform: translateY(-80%) translateX(calc(50vw - 50%)) scale(0.95);
            opacity: 0;
        }
        to {
            transform: translateY(0) translateX(calc(50vw - 50%)) scale(1);
            opacity: 1;
        }
    }

    .prompt-text {
        padding: 0.1rem 0.2rem;
        font-size: 0.9rem;
        display: flex;
        margin-top: auto;
        line-height: 1.5;
        white-space: pre-wrap;
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
        white-space: nowrap;
        cursor: pointer;
        transition:
            background-color 0.15s,
            color 0.15s;
    }

    .tool:hover {
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

    .primary:hover {
        background-color: color-mix(in srgb, var(--accent) 85%, white);
    }

    .primary:focus-visible {
        outline-color: var(--accent-text);
    }

    @media print {
        .prompt-wrapper {
            display: none;
        }
    }
</style>
