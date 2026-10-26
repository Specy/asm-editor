<script lang="ts">
    import RegisterFilesPanel from '#cmp/specific/project/cpu/RegisterFilesPanel.svelte'
    import {
        type Register,
        type RegisterFile,
        RegisterSize
    } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import type { ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'

    /**
     * A plain list of registers drawn as the CPU panel draws them, for the callers that have
     * registers rather than a Register file: the PC row above the panel. It is the Register file
     * panel with a single made-up hexadecimal file, so a row here and a row in the panel beside it
     * are rendered by the same code. Its rows take no clicks: the PC's name is a plain label.
     */
    interface Props {
        registers: Register[]
        position?: 'top' | 'bottom'
        withoutHeader?: boolean
        size?: RegisterSize
        style?: string
        gridStyle?: string
        align?: 'spread' | 'start'
        systemSize: RegisterSize
        /** The Target, passed straight through: it names the widths of the grouping strip. */
        language: AvailableLanguages
        /** The menu a right click on a register's value opens, see `RegisterFileRows`. */
        valueMenu?: (value: bigint, bytes: number) => ContextMenuEntry[]
    }

    let {
        registers,
        withoutHeader = false,
        size = RegisterSize.Word,
        style = '',
        gridStyle = '',
        align = 'spread',
        position = 'top',
        systemSize,
        language,
        valueMenu
    }: Props = $props()

    //no layout: every register here is an integer of the width it was built with, which is what the
    //renderer falls back to when a file declares nothing per register
    const file: RegisterFile = $derived({
        id: 'cpu',
        label: 'CPU',
        size: systemSize,
        formats: ['hex'],
        layout: [],
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
    {align}
    {size}
    {valueMenu}
/>
