<script lang="ts">
    import { Xterm, XtermAddon, type FitAddon } from '@battlefieldduck/xterm-svelte'
    import type {
        ITerminalOptions,
        ITerminalInitOnlyOptions,
        Terminal
    } from '@battlefieldduck/xterm-svelte'

    let {
        value = $bindable(),
        terminal = $bindable(),
        editable = false,
        useXterm = false
    } = $props<{
        value: string
        terminal?: Terminal
        editable?: boolean
        useXterm?: boolean
    }>()

    let options: ITerminalOptions & ITerminalInitOnlyOptions = {
        fontFamily: 'Consolas',
        allowTransparency: true,
        convertEol: true,
        cursorInactiveStyle: 'none',
        theme: {
            background: '#00000000'
        }
    }

    let fitAddon = $state<FitAddon | null>(null)
    async function onLoad() {
        fitAddon = new (await XtermAddon.FitAddon()).FitAddon()
        terminal.loadAddon(fitAddon)
    }

    function onData(data: string) {}

    function onKey(data: { key: string; domEvent: KeyboardEvent }) {}

    $effect(() => {
        terminal?.reset()
        terminal?.write(value)
    })
    $effect(() => {
        if (terminal) {
            terminal.options.disableStdin = !editable
        }
    })

    let wrapper = $state<HTMLDivElement>(null)
    $effect(() => {
        if (wrapper && fitAddon) {
            const observer = new ResizeObserver(() => {
                fitAddon?.fit()
            })
            observer.observe(wrapper)
            return () => observer.disconnect()
        }
    })
</script>

{#if useXterm}
    <div bind:this={wrapper} class="wrapper">
        <Xterm class="xterm-console" bind:terminal {options} {onLoad} {onData} {onKey} />
    </div>
{:else}
    <div class="console">{value}</div>
{/if}

<style lang="scss">
    .wrapper {
        display: flex;
        flex: 1;
        position: relative;
        overflow: hidden;
    }
    :global(.xterm-console) {
        position: absolute;
        inset: 0.5rem;
        left: 0.7rem;
    }

    .console {
        padding: 0.5rem;
        padding-left: 0.8rem;
        white-space: pre-wrap;
        font-family: monospace;
    }
</style>
