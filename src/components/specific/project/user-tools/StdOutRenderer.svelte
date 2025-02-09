<script lang="ts">
    import { run } from 'svelte/legacy'

    import type { MonacoError } from '$lib/languages/M68KEmulator.svelte'
    import FaExclamationTriangle from 'svelte-icons/fa/FaExclamationTriangle.svelte'
    import { fly } from 'svelte/transition'
    interface Props {
        stdOut: string
        compilerErrors?: MonacoError[]
        info?: string
    }

    let { stdOut, compilerErrors = [], info = '' }: Props = $props()
    let areCompilerErrorsShown = $state(false)
    let el: HTMLDivElement = $state(null)

    $effect(() => {
        if (el && stdOut) el.scrollTop = el.scrollHeight
    })
</script>

<div class="std-out" bind:this={el}>
    {#if compilerErrors.length}
        <button
            class="floating-std-icon"
            in:fly|global={{ duration: 300 }}
            out:fly|global={{ duration: 200 }}
            class:compilerErrorsShown={areCompilerErrorsShown}
            onclick={() => (areCompilerErrorsShown = !areCompilerErrorsShown)}
        >
            <FaExclamationTriangle />
        </button>
    {/if}
    {#if areCompilerErrorsShown && compilerErrors.length}
        {compilerErrors.map((e) => e.formatted).join('\n') + '\n'}
    {/if}
    <div class="std-text">
        {stdOut}
    </div>
    <div class="info">
        {info}
    </div>
</div>

<style lang="scss">
    .floating-std-icon {
        position: absolute;
        background-color: var(--red);
        color: var(--red-text);
        padding: 0.2rem;
        right: 0.4rem;
        border-radius: 0.2rem;
        width: 1.4rem;
        height: 1.4rem;
        cursor: pointer;
        transition: all 0.3s;
        bottom: 0.4rem;
        &:hover {
            filter: brightness(1.2);
        }
    }
    .compilerErrorsShown {
        background-color: var(--accent2);
        color: var(--accent2-text);
    }
    .std-out {
        display: flex;
        padding: 0.6rem;
        position: relative;
        word-break: break-all;
        border-radius: 0.5rem;
        flex: 1;
        overflow-y: auto;
        margin-top: 0.5rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        @media screen and (max-width: 1000px) {
            min-height: 4rem;
            width: 100%;
        }
    }
    .info {
        position: absolute;
        bottom: 0.4rem;
        right: 0.6rem;
        color: var(--hint);
        font-size: 0.9rem;
    }
    .std-text {
        white-space: pre-wrap;
        font-family: monospace;
    }
</style>
