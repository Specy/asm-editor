<script lang="ts">
    import { Prompt, PromptType } from '#stores/promptStore.svelte.ts'
    import { ScopedTheme } from '#stores/themeStore.svelte.ts'
    import { fade } from 'svelte/transition'
    import { tick } from 'svelte'

    import Input from '#cmp/shared/input/Input.svelte'
    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()

    let value = $state('')
    let currentId = $state(0)
    let inputEl = $state<HTMLInputElement | undefined>()
    let alertOkEl = $state<HTMLButtonElement | undefined>()
    $effect(() => {
        if (Prompt.id !== currentId) {
            currentId = Prompt.id
            value = Prompt.initial
            //every prompt takes the keyboard, not just the ones that arrive with the form off the
            //screen. A program that opens two input dialogs in a row — MARS's service 51 for each of
            //two numbers — asks again before this form has finished leaving, and Svelte keeps the
            //element it was about to remove rather than building a new one: the input's own
            //mount-time focus never runs again, and the answer the user clicked Ok for leaves the
            //focus on that button.
            //After a tick, so the element of the prompt now being asked is the one focused. A
            //message has no input, so its Ok takes the keyboard and Enter dismisses it
            tick().then(() => (Prompt.type === PromptType.Alert ? alertOkEl : inputEl)?.focus())
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
            else if (Prompt.type === PromptType.Alert) Prompt.answerAlert()
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
                placeholder={Prompt.placeholder}
                hideStatus
                style="border: 1px solid var(--tray-line);"
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
                <button type="button" class="tool primary" onclick={() => Prompt.answerText(value)}
                    >Ok</button
                >
            {:else if Prompt.type === PromptType.Alert}
                <button
                    type="button"
                    class="tool primary"
                    bind:this={alertOkEl}
                    onclick={() => Prompt.answerAlert()}>Ok</button
                >
            {:else}
                <!-- MARS's confirm dialog answers Cancel too; the app's own confirms do not offer it -->
                {#if Prompt.offersCancel}
                    <button type="button" class="tool" onclick={() => Prompt.cancel()}
                        >Cancel</button
                    >
                {/if}
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
    @use '../button/tray.scss';

    /* drawn as the Workbench's execution trays where they float over the code: a translucent tint
       that blurs what is beneath, a hairline edge, lifted by a shadow */
    .prompt-wrapper {
        @include tray.surface;
        display: flex;
        position: fixed;
        top: 1rem;
        overflow: hidden;
        max-height: 20rem;
        max-width: min(25rem, calc(100vw - 2rem));
        min-width: min(20rem, calc(100vw - 2rem));
        gap: 0.5rem;
        z-index: 20;
        padding: 0.6rem;
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
        @include tray.tool;
    }

    .primary {
        @include tray.primary;
    }

    @media print {
        .prompt-wrapper {
            display: none;
        }
    }
</style>
