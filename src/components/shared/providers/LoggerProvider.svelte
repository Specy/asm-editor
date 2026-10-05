<script lang="ts">
    import { toast, ToastType } from '$stores/toastStore'
    import { ScopedTheme } from '$stores/themeStore.svelte'
    import { fly } from 'svelte/transition'
    import FaTimes from '~icons/fa-solid/times'
    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()
</script>

{@render children?.()}
<!-- drawn above the page, so the colours of a page that wears its own theme are passed in -->
{#key $toast.id}
    {#if $toast.type === ToastType.Toast}
        <div
            class="toast-wrapper"
            class:toastVisible={$toast.visible}
            style={ScopedTheme.variables}
            in:fly|global={{ y: -100 }}
        >
            <div class="toast-title">
                <span class="dot" style={`background-color:${$toast.color}`}></span>
                <div class="title-text">
                    {$toast.title}
                </div>
                <button type="button" class="close" title="Close" onclick={toast.closeToast}>
                    <FaTimes />
                </button>
            </div>
            <div class="toast-text">
                {$toast.message}
            </div>
            <div class="toast-progress">
                <div
                    class="toast-progress-bar"
                    style={`
					animation-duration: ${$toast.duration}ms; 
					background-color: ${$toast.color};
				`}
                ></div>
            </div>
        </div>
    {:else}
        <div
            class="pill"
            class:pillVisible={$toast.visible}
            style={ScopedTheme.variables}
            in:fly|global={{ y: -100 }}
        >
            {$toast.message}
        </div>
    {/if}
{/key}

<style lang="scss">
    /* both drawn as the Workbench's execution trays where they float over the code: a translucent
       tint that blurs what is beneath, a hairline edge, lifted by a shadow */
    .toast-wrapper,
    .pill {
        position: fixed;
        z-index: 20;
        color: var(--primary-text);
        background-color: color-mix(in srgb, var(--primary) 80%, transparent);
        backdrop-filter: blur(4px);
        border: 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent);
        border-radius: 0.6rem;
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        font-family: Rubik;
        transition: transform 0.3s ease-out;
    }
    .toast-wrapper {
        display: flex;
        flex-direction: column;
        right: 1rem;
        top: 1rem;
        max-height: 10rem;
        width: 20rem;
        overflow: hidden;
        transform: translateY(calc(-100% - 2rem));
    }
    .pill {
        left: 50vw;
        top: 0.5rem;
        text-align: center;
        min-width: 10rem;
        padding: 0.55rem 1.2rem;
        font-size: 0.9rem;
        font-weight: 500;
        transform: translateY(calc(-100% - 1rem)) translateX(-50%);
    }
    .pillVisible {
        transform: translateY(0) translateX(-50%);
    }
    .toastVisible {
        transform: translateY(0);
    }
    .toast-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.35rem 0.35rem 0.75rem;
        border-bottom: 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent);
        font-size: 0.95rem;
        font-weight: 500;
    }
    .dot {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
    }
    .title-text {
        flex: 1;
        min-width: 0;
    }
    .close {
        display: grid;
        place-items: center;
        flex: none;
        width: 1.8rem;
        height: 1.8rem;
        padding: 0;
        border: none;
        border-radius: 0.4rem;
        background-color: transparent;
        color: var(--primary-text);
        opacity: 0.75;
        cursor: pointer;
        transition:
            background-color 0.15s,
            opacity 0.15s;

        &:hover {
            opacity: 1;
            background-color: color-mix(in srgb, var(--tertiary) 55%, transparent);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }

        :global(svg) {
            width: 0.8rem;
            height: 0.8rem;
        }
    }
    .toast-text {
        padding: 0.6rem 0.75rem 0.7rem;
        font-size: 0.85rem;
        line-height: 1.45;
        display: flex;
        overflow-y: auto;
        white-space: pre-wrap;
    }
    /* run down the tray's bottom edge, clipped by its corners */
    .toast-progress {
        flex: none;
        width: 100%;
        height: 0.15rem;
        overflow: hidden;
    }
    .toast-progress-bar {
        animation-name: mergeToZero;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        width: 100%;
        height: 100%;
    }
    @keyframes mergeToZero {
        from {
            transform: translateX(0);
        }
        to {
            transform: translateX(-100%);
        }
    }
    @media (max-width: 480px) {
        .toast-wrapper {
            left: 0;
            transform: translateX(calc(50vw - 50%)) translateY(-13rem);
        }
        .toastVisible {
            transform: translateX(calc(50vw - 50%)) translateY(1rem);
        }
    }

    @media print {
        .toast-wrapper,
        .pill {
            display: none;
        }
    }
</style>
