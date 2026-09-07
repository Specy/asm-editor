<script lang="ts">
    import { onMount } from 'svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import { isClipboardReadSupported } from '../appsUtils'

    type CheerpJWindow = Window &
        typeof globalThis & {
            cheerpjInit(options: {
                version: number
                clipboardMode: 'permission' | 'system'
            }): Promise<void>
        }
    type LoadedCheerpJWindow = CheerpJWindow & {
        cheerpjRunJar(jarUrl: string): void
        cheerpjCreateDisplay(width?: number, height?: number, container?: HTMLElement): void
    }

    let CHEERP = $state<null | {
        cheerpjRunJar: (jarUrl: string) => void
        cheerpjCreateDisplay: (width?: number, height?: number, container?: HTMLElement) => void
    }>(null)
    onMount(() => {
        async function onload() {
            const clipboardSupported = await isClipboardReadSupported()
            const cheerpJWindow = window as CheerpJWindow
            if (!('cheerpjRunJar' in cheerpJWindow)) {
                await cheerpJWindow.cheerpjInit({
                    version: 11,
                    clipboardMode: clipboardSupported ? 'permission' : 'system'
                })
            }
            const loadedCheerpJWindow = cheerpJWindow as LoadedCheerpJWindow
            CHEERP = {
                cheerpjRunJar: loadedCheerpJWindow.cheerpjRunJar,
                cheerpjCreateDisplay: loadedCheerpJWindow.cheerpjCreateDisplay
            }
        }

        if ('cheerpjInit' in window) {
            onload()
        } else {
            const script = document.createElement('script')
            script.src = 'https://cjrtnc.leaningtech.com/4.3/loader.js'
            script.async = true
            document.head.appendChild(script)
            script.onload = onload
        }
    })

    let wrapper = $state<HTMLElement | null>(null)

    $effect(() => {
        if (CHEERP && wrapper) {
            CHEERP.cheerpjCreateDisplay(-1, -1, wrapper)
            CHEERP.cheerpjRunJar('/app/native-apps/mars.jar')
        }
    })
</script>

<svelte:head>
    <title>MARS — MIPS simulator in your browser</title>
    <meta
        name="description"
        content="Run the MARS MIPS assembler and simulator directly in the browser, with no download or Java install."
    />
    <meta property="og:title" content="MARS — MIPS simulator in your browser" />
    <meta
        property="og:description"
        content="Run the MARS MIPS assembler and simulator directly in the browser, with no download or Java install."
    />
</svelte:head>

<DefaultNavbar />

<Page hasNavbar>
    <h1 class="visually-hidden">MARS — MIPS simulator</h1>
    <div bind:this={wrapper} class="wrapper"></div>
</Page>

<style>
    .wrapper {
        display: flex;
        flex: 1;
    }
</style>
