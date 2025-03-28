<script lang="ts">
    import { run } from 'svelte/legacy'

    import { Prompt, PromptType } from '$stores/promptStore'
    import { fade } from 'svelte/transition'

    import Button from '$cmp/shared/button/Button.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()

    let input: HTMLInputElement = $state()
    let value = $state('')
    let currentId = $state(0)
    $effect(() => {
        if ($Prompt.id !== currentId) {
            currentId = $Prompt.id
            value = ''
        }
    })
</script>

{@render children?.()}
{#if $Prompt.promise}
    <form
        class="prompt-wrapper"
        out:fade|global={{ duration: 150 }}
        onsubmit={(e) => {
            e.preventDefault()
            Prompt.answer(value)
        }}
    >
        <div class="prompt-text">
            {$Prompt.question}
        </div>
        {#if $Prompt.type === PromptType.Text}
            <Input
                bind:el={input}
                focus
                bind:value
                hideStatus
                style="color: var(--primary-text); background-color: var(--primary);"
            />
        {/if}

        <div class="prompt-row">
            {#if $Prompt.type === PromptType.Text}
                {#if !$Prompt.cancellable}
                    <Button
                        onClick={() => Prompt.answer(false)}
                        cssVar="secondary"
                        style="padding: 0.5rem 1.5rem">Cancel</Button
                    >
                {/if}
                <Button
                    onClick={() => Prompt.answer(value)}
                    style="padding: 0.5rem 1.5rem; margin-left:auto">Ok</Button
                >
            {:else}
                <Button
                    onClick={() => Prompt.answer(false)}
                    cssVar="secondary"
                    style="padding: 0.5rem 1.5rem">No</Button
                >
                <Button
                    onClick={() => Prompt.answer(true)}
                    cssVar="accent2"
                    style="padding: 0.5rem 1.5rem">Yes</Button
                >
            {/if}
        </div>
    </form>
{/if}

<style lang="scss">
    .prompt-wrapper {
        display: flex;
        position: fixed;
        top: 1rem;
        overflow: hidden;
        max-height: 10rem;
        width: 20rem;
        color: var(--secondary-text);
        backdrop-filter: blur(3px);
        border-radius: 0.5rem;
        border: solid 0.1rem var(--tertiary);
        background-color: rgba(var(--RGB-secondary), 0.8);
        box-shadow: 0 3px 10px rgb(0 0 0 / 20%);
        z-index: 20;
        padding: 0.5rem;
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

    .prompt-row {
        display: flex;
        margin-top: 0.5rem;
        justify-content: space-between;
    }

    .prompt-text {
        padding: 0.3rem;
        font-size: 0.9rem;
        display: flex;
        margin-top: auto;
    }
</style>
