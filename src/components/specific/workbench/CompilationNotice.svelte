<script lang="ts">
    /**
     * What the displayed Generated assembly's compilation says about it, floating over the top of
     * the code on a translucent, blurred card. A notice that only compiling again resolves is
     * itself the button that does, when `recompile` is given.
     */
    import FaSpinner from '~icons/fa-solid/spinner'

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
            title="Recompile the source to restore its mapping"
            onclick={recompile.onClick}
        >
            {#if recompile.busy}
                <span class="spinner" aria-hidden="true"><FaSpinner /></span>
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
    /* clear of Monaco's scrollbar and minimap on the right */
    .compilation-notice {
        position: absolute;
        z-index: 4;
        top: 0.5rem;
        left: 0.75rem;
        right: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: fit-content;
        max-width: calc(100% - 2.25rem);
        margin: 0 auto;
        padding: 0.5rem 0.8rem;
        border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        border-radius: 0.5rem;
        color: var(--secondary-text);
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        backdrop-filter: blur(8px);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.25);
        font: inherit;
        font-size: 0.8rem;
        text-align: left;
    }

    .clickable {
        cursor: pointer;
        transition: background-color 0.15s;

        &:hover:not(:disabled) {
            background: color-mix(in srgb, var(--accent) 26%, transparent);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 1px;
        }

        &:disabled {
            cursor: not-allowed;
        }
    }

    .spinner {
        display: flex;
        animation: notice-spin 1s linear infinite;

        :global(svg) {
            width: 0.8rem;
            height: 0.8rem;
        }
    }

    @keyframes notice-spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
