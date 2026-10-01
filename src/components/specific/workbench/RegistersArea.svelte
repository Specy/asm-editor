<script lang="ts">
    /**
     * The registers of a Debug session: the CPU's Status flags and the PC on top, then the Register
     * files with their tabs, one register per row. A click on a register moves memory to its value.
     * A rule from edge to edge of the card separates the flags from the PC. The PC has no padding
     * of its own and lines up with the registers under it, and the Register files reach the card's
     * edges, square and with nothing around them; only the flags are inset.
     */
    import RegistersRenderer from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import RegisterFilesPanel from '$cmp/specific/project/cpu/RegisterFilesPanel.svelte'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
    import { MEMORY_SIZE } from '$lib/Config'
    import { clampBigInt } from '$lib/utils'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        style?: string
        /** The grouping picked in the Register files' header, which their rows' width depends on. */
        size?: RegisterSize
    }

    let { style = '', size = $bindable(RegisterSize.Word) }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator
    const language = $derived(session.project.language)
</script>

<div class="registers-area" {style}>
    {#if emulator.statusRegisters && emulator.statusRegisters.length > 0}
        <div class="inset">
            <StatusCodesVisualiser statusCodes={emulator.statusRegisters} />
        </div>
        <div class="rule"></div>
    {/if}
    <!-- the side padding is the register rows', so the PC's name sits over theirs -->
    <RegistersRenderer
        systemSize={emulator.systemSize}
        {language}
        style="flex: none; overflow: unset; padding: 0;"
        gridStyle="padding: 0 0.2rem"
        align="start"
        size={emulator.systemSize}
        registers={[session.pc]}
        withoutHeader
        position="bottom"
    />
    <div class="files">
        <RegisterFilesPanel
            systemSize={emulator.systemSize}
            {language}
            bind:size
            style="flex: 1; min-height: 0;"
            files={emulator.registerFiles}
            pokeable={session.pokeable}
            canPokeRegister={(fileId, name) => emulator.canPokeRegister(fileId, name)}
            onPoke={(fileId, writes) => session.pokeRegisters(fileId, writes)}
            onRegisterClick={(register) => {
                const value = register.value
                const page = value - (value % BigInt(emulator.memory.global.pageSize))
                emulator.setGlobalMemoryAddress(clampBigInt(page, 0n, MEMORY_SIZE[language]))
            }}
        />
    </div>
</div>

<style>
    .registers-area {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-height: 0;
        min-width: 0;
        padding-top: 0.3rem;
        overflow: hidden;
        /* the Register files meet the card's edges, where a rounded corner would only show a gap */
        --panel-radius: 0px;
    }

    .inset {
        flex: none;
        min-width: 0;
        padding: 0 0.3rem;
    }

    .files {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }

    /* a border rather than a 1px fill: at a fractional screen scale a fill can round to two
       pixels, a border always to one, like the card's edges */
    .rule {
        flex: none;
        height: 0;
        border-top: 1px solid var(--wb-line, var(--tertiary));
    }
</style>
