<script lang="ts">
    /**
     * The scripted answers of a Testcase, one box per input request in the order the program makes
     * them: the first read gets box 1, the next box 2, whatever syscall, trap or port asks. Enter in
     * a box opens the next one, and Backspace in an empty box removes it.
     */
    import { tick } from 'svelte'
    import type { Testcase } from '$lib/Project.svelte'
    import FaTimes from '~icons/fa-solid/times'

    interface Props {
        testcase: Testcase
        editable: boolean
    }

    let { testcase = $bindable(), editable }: Props = $props()

    let cells: HTMLDivElement | undefined = $state()

    function focusBox(index: number) {
        cells?.querySelectorAll('input')[index]?.focus()
    }

    async function insert(index: number) {
        testcase.input.splice(index, 0, '')
        await tick()
        focusBox(index)
    }

    async function remove(index: number, focusPrevious: boolean) {
        testcase.input.splice(index, 1)
        if (!focusPrevious) return
        await tick()
        focusBox(Math.max(0, index - 1))
    }
</script>

<div class="cells" bind:this={cells}>
    {#each testcase.input as answer, i (i)}
        {#if editable}
            <div class="cell">
                <span class="index" aria-hidden="true">{i + 1}</span>
                <input
                    bind:value={testcase.input[i]}
                    style:width="calc({Math.min(Math.max(answer.length, 2) + 1, 40)}ch + 1.1rem)"
                    aria-label="Answer to input request {i + 1}"
                    spellcheck="false"
                    autocomplete="off"
                    onkeydown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            void insert(i + 1)
                        } else if (e.key === 'Backspace' && answer === '') {
                            e.preventDefault()
                            void remove(i, true)
                        }
                    }}
                />
                <button
                    class="remove"
                    aria-label="Remove answer {i + 1}"
                    title="Remove this answer"
                    onclick={() => remove(i, false)}
                >
                    <FaTimes />
                </button>
            </div>
        {:else}
            <span class="cell">
                <span class="index" aria-hidden="true">{i + 1}</span>
                <!-- an empty answer is a request answered with Enter alone -->
                <span class="answer" class:empty={answer === ''}>{answer || 'empty'}</span>
            </span>
        {/if}
    {/each}
    {#if editable}
        <button class="add" onclick={() => insert(testcase.input.length)}>+ Add</button>
    {/if}
</div>

<style lang="scss">
    @use './testcases.scss' as *;

    .cells {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    .cell {
        display: flex;
        align-items: center;
        max-width: 100%;
        border: 1px solid var(--tc-line);
        border-radius: 0.4rem;
        background-color: var(--tc-field);
        transition: border-color 0.15s;

        &:focus-within {
            border-color: color-mix(in srgb, var(--accent) 70%, transparent);
        }
    }

    .index {
        align-self: stretch;
        display: flex;
        align-items: center;
        padding: 0 0.45rem;
        font-size: 0.7rem;
        color: var(--hint);
        border-right: 1px solid var(--tc-line);
    }

    input,
    .answer {
        @include mono;
        min-width: 0;
        max-width: 100%;
        //the 1.1rem a box's width adds to its characters
        padding: 0.4rem 0.55rem;
        font-size: 0.85rem;
        background-color: transparent;
        color: var(--secondary-text);
        white-space: pre;
    }

    .empty {
        font-family: Rubik, sans-serif;
        font-style: italic;
        color: var(--hint);
    }

    .remove {
        display: grid;
        place-items: center;
        width: 1.6rem;
        align-self: stretch;
        color: var(--hint);
        background-color: transparent;
        cursor: pointer;
        opacity: 0.6;
        transition:
            color 0.15s,
            opacity 0.15s;

        :global(svg) {
            width: 0.55rem;
        }

        &:hover,
        &:focus-visible {
            color: var(--tc-fail);
            opacity: 1;
        }
    }

    .add {
        padding: 0.4rem 0.75rem;
        border: 1px dashed var(--tc-line);
        border-radius: 0.4rem;
        font-family: Rubik, sans-serif;
        font-size: 0.82rem;
        color: var(--hint);
        background-color: transparent;
        cursor: pointer;
        transition:
            color 0.15s,
            border-color 0.15s;

        &:hover {
            color: var(--secondary-text);
            border-color: var(--hint);
        }
    }
</style>
