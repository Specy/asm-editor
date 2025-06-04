

<script lang="ts">

    import { onMount } from 'svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'

    let CHEERP = $state<null | {
        cheerpjRunJar: (jarUrl: string) => void,
        cheerpjCreateDisplay: (
            width?: number,
            height?: number,
            container?: HTMLElement
        ) => void
    }>(null)
    onMount(() => {

        async function onload() {
            if (!('cheerpjRunJar' in window)) {
                await (window as any).cheerpjInit({
										version: 11,
                    clipboardMode: 'permission',
                })
            }
            CHEERP = {
                cheerpjRunJar: (window as any).cheerpjRunJar,
                cheerpjCreateDisplay: (window as any).cheerpjCreateDisplay
            }
        }

        if ('cheerpjInit' in window) {
            onload()
        } else {
            const script = document.createElement('script')
            script.src = 'https://cjrtnc.leaningtech.com/20250530_2444/loader.js'
            script.async = true
            document.head.appendChild(script)
            script.onload = onload
        }
    })

    let wrapper = $state<HTMLElement | null>(null)

    $inspect(CHEERP)

    $effect(() => {
        if (CHEERP && wrapper) {
            CHEERP.cheerpjCreateDisplay(
                -1,
                -1,
                wrapper
            )
            CHEERP.cheerpjRunJar('/app/native-apps/rars.jar')
        }
    })
</script>

<DefaultNavbar />

<Page hasNavbar>
	<div bind:this={wrapper} class="wrapper">

	</div>
</Page>

<style>
    .wrapper {
        display: flex;
				flex: 1;
    }
</style>

