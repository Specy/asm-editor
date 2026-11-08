<script lang="ts">
    import { toast, ToastType } from '#stores/toastStore.ts'
    import { ScopedTheme } from '#stores/themeStore.svelte.ts'
    import { fly } from 'svelte/transition'
    import { DUR_BASE, motion } from '#src/styles/motion.ts'
    import FaTimes from '~icons/fa-solid/times'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import StatusDot from '#cmp/shared/misc/StatusDot.svelte'
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
            in:fly|global={{ y: -100, duration: motion(DUR_BASE) }}
        >
            <div class="toast-title">
                <!-- the hidden toast has no colour, and no dot: a dot with none would take the
                     neutral tone's -->
                {#if $toast.color}<StatusDot color={$toast.color} />{/if}
                <div class="title-text">
                    {$toast.title}
                </div>
                <IconButton
                    quiet
                    label="Close"
                    {@attach tooltip('Close')}
                    onClick={toast.closeToast}
                >
                    <FaTimes />
                </IconButton>
            </div>
            <div class="toast-text">
                {$toast.message}
            </div>
            <div class="toast-progress">
                <div
                    class="toast-progress-bar keeps-moving"
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
            in:fly|global={{ y: -100, duration: motion(DUR_BASE) }}
        >
            {$toast.message}
        </div>
    {/if}
{/key}

<style lang="scss">
    @use '../button/tray.scss';

    /* both drawn as the Workbench's execution trays where they float over the code: a translucent
       tint that blurs what is beneath, a hairline edge, lifted by a shadow */
    .toast-wrapper,
    .pill {
        @include tray.surface;
        position: fixed;
        z-index: 20;
        transition: transform var(--dur-base) ease-out;
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
        font-size: var(--fs-small);
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
        border-bottom: 1px solid var(--tray-line);
        font-size: var(--fs-body);
        font-weight: 500;
    }
    .title-text {
        flex: 1;
        min-width: 0;
    }
    .toast-text {
        padding: 0.6rem 0.75rem 0.7rem;
        font-size: var(--fs-small);
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
