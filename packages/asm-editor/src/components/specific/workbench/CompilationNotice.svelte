<script lang="ts">
    /**
     * What the displayed Generated assembly's compilation says about it, floating over the top of
     * the code on a translucent, blurred card. A notice that only compiling again resolves is
     * itself the button that does, when `recompile` is given.
     */
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    interface Props {
        notice: string
        recompile?: { busy: boolean; disabled: boolean; onClick: () => void }
    }

    let { notice, recompile }: Props = $props()
</script>

{#if notice}
    {#if recompile}
        <button
            type="button"
            class="compilation-notice clickable"
            disabled={recompile.disabled}
            aria-busy={recompile.busy}
            {@attach tooltip('Recompile the source to restore its mapping')}
            onclick={recompile.onClick}
        >
            {#if recompile.busy}
                <Spinner />
                Compiling…
            {:else}
                {notice}
            {/if}
        </button>
    {:else}
        <div class="compilation-notice" role="status">{notice}</div>
    {/if}
{/if}

<style lang="scss">
    @use '../../shared/button/tray.scss';

    /* a Tray over the editor's top right corner, clear of Monaco's scrollbar and minimap */
    .compilation-notice {
        @include tray.surface;
        position: absolute;
        z-index: 4;
        top: 0.5rem;
        right: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: fit-content;
        max-width: calc(100% - 2.25rem);
        padding: 0.5rem 0.8rem;
        font: inherit;
        font-size: var(--fs-small);
        text-align: left;
    }

    .clickable {
        cursor: pointer;
        transition: background-color var(--dur-fast);

        /* the hover every tool takes, over the tray's own tint */
        &:hover:not(:disabled) {
            background-image: linear-gradient(var(--hover-bg), var(--hover-bg));
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 1px;
        }

        &:disabled {
            cursor: not-allowed;
        }
    }
</style>
