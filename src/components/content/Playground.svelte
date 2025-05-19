<script lang="ts">

    import type { AvailableLanguages, Testcase } from '$lib/Project.svelte'
    import lzstring from 'lz-string'



    const {
        code,
        lang,
        memory = false,
        console = false,
        tests = false
    } = $props<{
        code: string,
        lang: string,
        memory: boolean,
        console: boolean,
        tests: boolean
    }>()




    const url = $derived(createCodeUrl(code, {
        showMemory: memory,
        language: lang,
        showConsole: console,
        showTests: tests
    }, []))

    let el = $state()

    $effect(() => {
        if (!el) return
        el.innerHTML = ''
        const iframe = document.createElement('iframe')
        iframe.src = url
        iframe.className = 'playground-iframe'
        el.appendChild(iframe)
    })
    $inspect(el)
</script>

<div bind:this={el}>

</div>


<style>
    :global(.playground-iframe) {
        border: none;
        border-radius: 0.8rem;
        width: 100%;
        min-height: 20.4rem;
    }
</style>