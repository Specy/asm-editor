<script lang="ts">
    import { afterNavigate, beforeNavigate } from '$app/navigation'
    import RgbLine from '$cmp/shared/misc/RgbLine.svelte'
    import type { Timer } from '$lib/utils'
    interface Props {
        refresh?: string
    }

    let { refresh = '' }: Props = $props()

    let status = $state('')
    let timeout: Timer
    let timeout2: Timer
    function handleProgress(s: string) {
        if (s === 'started') {
            status = 'progress-70'
            clearTimeout(timeout2)
            timeout2 = setTimeout(() => {
                status = ''
            }, 5000)
        }
        if (s === 'ended') {
            status = 'progress-finish'
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                status = ''
            }, 200)
        }
    }

    beforeNavigate((n) => {
        handleProgress('started')
    })
    afterNavigate(() => {
        handleProgress('ended')
    })
</script>

{#key refresh}
    <div class={`progress`}>
        <div class={status}>
            <RgbLine height="0.3rem" />
        </div>
    </div>
{/key}

<style lang="scss">
    .progress {
        height: 4px;
        width: 100%;
        position: absolute;
        z-index: 1000;
        overflow: hidden;
        opacity: 0.6;
        > div {
            border-radius: 1rem;
            transform: translateX(-110%);
        }
        .progress-70 {
            animation: progressTo70 1s ease-out;
            animation-fill-mode: forwards;
        }
        .progress-finish {
            animation: progressToFinish 0.2s ease-out;
            animation-fill-mode: forwards;
        }
        @keyframes progressTo70 {
            from {
                transform: translateX(-100%);
                opacity: 0.5;
            }
            to {
                opacity: 1;
                transform: translateX(-30%);
            }
        }
        @keyframes progressToFinish {
            from {
                transform: translateX(-30%);
                opacity: 0.5;
            }
            to {
                transform: translateX(0%);
                opacity: 0;
            }
        }
    }
</style>
