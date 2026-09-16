<script lang="ts">
    import RegisterFilesPanel from '$cmp/specific/project/cpu/RegisterFilesPanel.svelte'
    import {
        type Register,
        type RegisterFile,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import { createEventDispatcher } from 'svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'

    const dispatcher = createEventDispatcher<{
        registerClick: Register
    }>()

    /**
     * A plain list of registers drawn as the CPU panel draws them, for the callers that have
     * registers rather than a Register file: the PC row above the panel and the Testcase editor.
     * It is the Register file panel with a single made-up hexadecimal file, so a row here and a row
     * in the panel beside it are rendered by the same code.
     */
    interface Props {
        registers: Register[]
        position?: 'top' | 'bottom'
        hiddenRegistersNames?: string[]
        withoutHeader?: boolean
        size?: RegisterSize
        style?: string
        gridStyle?: string
        systemSize: RegisterSize
        /** The Target, passed straight through: it names the widths of the grouping strip. */
        language: AvailableLanguages
    }

    let {
        registers,
        withoutHeader = false,
        size = $bindable(RegisterSize.Word),
        style = '',
        gridStyle = '',
        hiddenRegistersNames = [],
        position = 'top',
        systemSize,
        language
    }: Props = $props()

    //no layout: every register here is an integer of the width it was built with, which is what the
    //renderer falls back to when a file declares nothing per register
    const file: RegisterFile = $derived({
        id: 'cpu',
        label: 'CPU',
        size: systemSize,
        formats: ['hex'],
        layout: [],
        hiddenRegisters: hiddenRegistersNames,
        registers,
        flags: [],
        blanks: []
    })
</script>

<RegisterFilesPanel
    files={[file]}
    {systemSize}
    {language}
    {position}
    {withoutHeader}
    {style}
    {gridStyle}
    bind:size
    onRegisterClick={(register) => dispatcher('registerClick', register)}
/>
