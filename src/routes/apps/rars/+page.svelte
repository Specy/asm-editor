

<script lang="ts">

    import { onMount } from 'svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import { isClipboardReadSupported } from '$src/routes/apps/appsUtils'

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
            const clipboardSupported = await isClipboardReadSupported()
            if (!('cheerpjRunJar' in window)) {
                await (window as any).cheerpjInit({
										version: 11,
                    clipboardMode: clipboardSupported ? 'permission' : 'system',

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

