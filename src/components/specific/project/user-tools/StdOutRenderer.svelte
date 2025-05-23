<script lang="ts">
    import FaExclamationTriangle from 'svelte-icons/fa/FaExclamationTriangle.svelte'
    import { fly } from 'svelte/transition'
    import Console from '$cmp/shared/Console.svelte'
    import type { MonacoError } from '$lib/languages/commonLanguageFeatures.svelte'
    interface Props {
        stdOut: string
        compilerErrors?: MonacoError[]
        info?: string
    }

    let { stdOut, compilerErrors = [], info = '' }: Props = $props()
    let areCompilerErrorsShown = $state(false)
    let el: HTMLDivElement = $state(null)

    let separator = $derived(compilerErrors.length ? '\n\n' : '')
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
    <div>
        <Console
            value={`${compilerErrors.map((e) => e.formatted).join('\n')}${separator}${stdOut}`}
        />
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
        position: relative;
        border-radius: 0.5rem;
        margin-top: 0.4rem;
        overflow-y: auto;
        display: flex;
        flex: 1;
        background-color: var(--secondary);
        color: var(--secondary-text);
        @media screen and (max-width: 1000px) {
            min-height: 4rem;
            width: 100%;
            max-height: 10rem;
        }
    }
    .info {
        position: fixed;
        bottom: 0.8rem;
        right: 1.2rem;
        color: var(--hint);
        font-size: 0.9rem;
    }
</style>
