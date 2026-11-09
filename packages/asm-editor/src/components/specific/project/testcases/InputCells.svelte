<script lang="ts">
    /**
     * The scripted answers of a Testcase, one box per input request in the order the program makes
     * them: the first read gets box 1, the next box 2, whatever syscall, trap or port asks. Enter in
     * a box opens the next one, and Backspace in an empty box removes it.
     */
    import { tick } from 'svelte'
    import type { Testcase } from '#lib/Project.svelte.ts'
    import FaTimes from '~icons/fa-solid/times'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

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
                <IconButton
                    size="sm"
                    quiet
                    class="remove"
                    fill
                    label="Remove answer {i + 1}"
                    {@attach tooltip('Remove this answer')}
                    onClick={() => remove(i, false)}
                >
                    <FaTimes />
                </IconButton>
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
    @use '../../../../styles/field.scss';
    @use '../../../../styles/radius.scss' as *;

    .cells {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    /* a box round an answer's field, its number and its × (styles/field.scss), ringed while the
       field is typed in */
    .cell {
        @include field.box;
        display: flex;
        align-items: center;
        max-width: 100%;
    }

    .index {
        align-self: stretch;
        display: flex;
        align-items: center;
        padding: 0 0.45rem;
        font-size: var(--fs-caption);
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
        font-size: var(--fs-small);
        background-color: transparent;
        color: inherit;
        white-space: pre;
    }

    .empty {
        font-family: var(--font-ui);
        font-style: italic;
        color: var(--hint);
    }

    /* the answer's ×, its box's whole height at its end, ruled off from the field as the number is
       at the other end (owner, 2026-11-09) */
    .cell :global(.remove) {
        @include remove-button;
        --icon-button-cell: 1.9rem;
        --icon-button-radius: 0 #{nested-radius(var(--r-control), $border: 1px)}
            #{nested-radius(var(--r-control), $border: 1px)} 0;
        border-left: 1px solid var(--tc-line);
    }

    .add {
        padding: 0.4rem 0.75rem;
        border: 1px dashed var(--tc-line);
        border-radius: var(--r-control);
        font-family: var(--font-ui);
        font-size: var(--fs-small);
        color: var(--hint);
        background-color: transparent;
        cursor: pointer;
        transition:
            color var(--dur-fast),
            border-color var(--dur-fast);

        &:hover {
            color: var(--secondary-text);
            border-color: var(--hint);
        }
    }
</style>
