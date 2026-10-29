<script lang="ts">
    import { onMount } from 'svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import { isClipboardReadSupported } from '../appsUtils'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'

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
    /** Why CheerpJ did not load or start, said in place of the empty page it would leave. */
    let failure = $state<unknown>(undefined)
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

        //a CheerpJ that fails to load or start would otherwise leave the page empty without a word
        function fail(error: unknown) {
            console.error(error)
            failure = error
        }
        function start() {
            onload().catch(fail)
        }

        if ('cheerpjInit' in window) {
            start()
        } else {
            const script = document.createElement('script')
            script.src = 'https://cjrtnc.leaningtech.com/20250530_2444/loader.js'
            script.async = true
            document.head.appendChild(script)
            script.onload = start
            script.onerror = () => fail(new Error(`Could not load ${script.src}`))
        }
    })

    let wrapper = $state<HTMLElement | null>(null)

    $effect(() => {
        if (CHEERP && wrapper) {
            CHEERP.cheerpjCreateDisplay(-1, -1, wrapper)
            CHEERP.cheerpjRunJar('/app/native-apps/rars.jar')
        }
    })
</script>

<svelte:head>
    <title>RARS - RISC-V simulator in your browser</title>
    <meta
        name="description"
        content="Run the RARS RISC-V assembler and runtime simulator directly in the browser, with no download or Java install."
    />
    <meta property="og:title" content="RARS - RISC-V simulator in your browser" />
    <meta
        property="og:description"
        content="Run the RARS RISC-V assembler and runtime simulator directly in the browser, with no download or Java install."
    />
</svelte:head>

<DefaultNavbar />

<Page hasNavbar fillsScreen>
    <h1 class="visually-hidden">RARS - RISC-V simulator</h1>
    {#if failure !== undefined}
        <ErrorState title="RARS didn't start" error={failure} reload>
            RARS is a Java program, run in the browser by CheerpJ, which could not be downloaded or
            started. Check the connection and reload the page.
        </ErrorState>
    {:else}
        <div bind:this={wrapper} class="wrapper"></div>
    {/if}
</Page>

<style>
    .wrapper {
        display: flex;
        flex: 1;
    }
</style>
