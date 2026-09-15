<script lang="ts">
    import RegisterFileRows from '$cmp/specific/project/cpu/RegisterFileRows.svelte'
    import SegmentedControl from '$cmp/specific/project/cpu/SegmentedControl.svelte'
    import SizeSelector from '$cmp/specific/project/cpu/SizeSelector.svelte'
    import StatusCodesRenderer from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import {
        type Register,
        type RegisterFile,
        type RegisterFormat,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import { registerFileWidth } from '$lib/languages/registerFormats'

    /**
     * The Register file panel ([the design record](../../../../../docs/design/register-files.md)):
     * one file at a time, the tabs where the "Registers" title is and the selector on the right
     * belonging to the visible file. A language with a single file, which is every language but
     * MIPS, RISC-V and x86, gets no tabs at all and looks exactly as the CPU panel always did.
     */
    interface Props {
        /** Every file of the emulator, the CPU one first; `RegistersRenderer` passes a single made-up one. */
        files: RegisterFile[]
        systemSize: RegisterSize
        /** The file the panel opens on, which is a Playground's `fpu`/`cp0`/`csr`/`sse`/`x87` flag. */
        initialFileId?: string
        position?: 'top' | 'bottom'
        withoutHeader?: boolean
        style?: string
        gridStyle?: string
        /** The B/W/L/D/Q grouping of the hexadecimal Formats, shared by the files that use it. */
        size?: RegisterSize
        onRegisterClick?: (register: Register) => void
    }

    let {
        files,
        systemSize,
        initialFileId = undefined,
        position = 'top',
        withoutHeader = false,
        style = '',
        gridStyle = '',
        size = $bindable(RegisterSize.Word),
        onRegisterClick
    }: Props = $props()

    const FORMAT_LABELS: Record<RegisterFormat, string> = {
        hex: 'Hex',
        single: 'Single',
        double: 'Double'
    }

    //the visible tab and the Format of each file are session state, as the design record asks: they
    //live for as long as the panel does and never reach the Preferences. Only a tab the reader
    //picked is remembered here, so the tab keeps following `initialFileId` until then: the embed
    //route reads its settings in `onMount`, after this panel has already rendered once, and a
    //Playground's `fpu`/`cp0`/`csr`/`sse`/`x87` flag therefore arrives a render late.
    let pickedId: string | undefined = $state(undefined)
    let selectedFormats: Record<string, RegisterFormat> = $state({})

    //an id nothing answers to, which is a Playground asking for a file this language has not got,
    //falls back to the CPU file. The id arrives already trimmed and lowercased from the embed
    //route, which is the one place a URL string is normalised, so a fence flag is matched here
    //exactly as `parsePlaygroundFence` matched it
    const selectedId = $derived(pickedId ?? initialFileId ?? 'cpu')

    const file = $derived(files.find((candidate) => candidate.id === selectedId) ?? files[0])

    /** The Format a file is showing, or the one it would open on the moment its tab was picked. */
    function formatOf(candidate: RegisterFile): RegisterFormat {
        return selectedFormats[candidate.id] ?? candidate.formats[0] ?? 'hex'
    }

    //a file wider than the system word (x86's 128 bit SSE registers) can be grouped by its own
    //width, and a narrower one keeps the grouping the wider tabs were left on, clamped for display
    function maxGroupSizeOf(candidate: RegisterFile): RegisterSize {
        return Math.max(Number(candidate.size), Number(systemSize)) as RegisterSize
    }

    function groupSizeOf(candidate: RegisterFile): RegisterSize {
        return Math.min(Number(size), Number(maxGroupSizeOf(candidate))) as RegisterSize
    }

    //a caller that packs the registers into several columns, which is what a Playground does with
    //its short space, sized those columns for the CPU file's rows: its names and one hex group. No
    //other file has rows that shape, so they all keep the one-column default rather than being
    //packed into a grid that was measured for something else
    function gridStyleOf(candidate: RegisterFile): string {
        return candidate.id === 'cpu' ? gridStyle : ''
    }

    //the register column is pinned to the width of the CPU file, which is the file that has always
    //set the page's layout, so every other tab has to lay out inside that width. A file whose rows
    //ask for more than it, which is any file with longer names than the CPU's (MIPS's CP0 and
    //RISC-V's CSR), is drawn compact: the treatment the floating-point files already get, and the
    //one that keeps the memory panel beside the column from sliding when a tab is picked
    const columnWidth = $derived(files[0] ? registerFileWidth(files[0], groupSizeOf(files[0])) : 0)

    function isCompact(candidate: RegisterFile): boolean {
        return registerFileWidth(candidate, groupSizeOf(candidate)) > columnWidth
    }

    const format = $derived(file ? formatOf(file) : 'hex')
    const maxGroupSize = $derived(file ? maxGroupSizeOf(file) : systemSize)
    const groupSize = $derived(file ? groupSizeOf(file) : systemSize)
    const tabs = $derived(files.map((candidate) => ({ id: candidate.id, label: candidate.label })))
    const formats = $derived(
        (file?.formats ?? []).map((offered) => ({ id: offered, label: FORMAT_LABELS[offered] }))
    )
</script>

<div class="registers-wrapper" class:withoutHeader class:several-files={files.length > 1} {style}>
    {#if file}
        <!--
            the header and the file's own Status flags scroll with nothing: a file of 32 registers
            is taller than the panel, and a flags row that scrolled out of sight would leave the
            reader without the flags the CPU column keeps above its registers
        -->
        {#if !withoutHeader || file.flags.length > 0}
            <div class="registers-top">
                {#if !withoutHeader && files.length > 1}
                    <!--
                        the tabs run the whole width of the panel, touching its edges and squared off
                        where they meet the rows, so the strip reads as the tabs of the thing below
                        it rather than as one more option control floating in the header
                    -->
                    <SegmentedControl
                        tabs
                        options={tabs}
                        selected={file.id}
                        onSelect={(id) => (pickedId = id)}
                    />
                {/if}
                {#if !withoutHeader}
                    <div class="registers-header">
                        {#if files.length === 1}
                            <!-- one file is the panel every language had before the tabs -->
                            <span class="registers-title">Registers</span>
                        {/if}
                        <div class="header-selectors">
                            {#if formats.length > 1}
                                <SegmentedControl
                                    options={formats}
                                    selected={format}
                                    onSelect={(id) =>
                                        (selectedFormats[file.id] = id as RegisterFormat)}
                                    style="flex: 1;"
                                />
                            {/if}
                            {#if format === 'hex'}
                                <SizeSelector
                                    maxSize={maxGroupSize}
                                    style="flex: 1;"
                                    selected={groupSize}
                                    onSelect={(picked) => (size = picked)}
                                />
                            {/if}
                        </div>
                    </div>
                {/if}
                {#if file.flags.length > 0}
                    <!-- a file's own Status flags sit above its registers, as the CPU column's do -->
                    <StatusCodesRenderer
                        statusCodes={file.flags}
                        style="margin: 0.3rem 0.4rem 0;"
                    />
                {/if}
            </div>
        {/if}
        <div class="registers-scroll">
            <RegisterFileRows
                {file}
                registers={file.registers}
                {format}
                {groupSize}
                hiddenRegistersNames={file.hiddenRegisters ?? []}
                {position}
                gridStyle={gridStyleOf(file)}
                compact={isCompact(file)}
                {onRegisterClick}
            />
        </div>
    {/if}
</div>

<style lang="scss">
    .registers-wrapper {
        display: flex;
        flex-direction: column;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.5rem;
        //the column around it is what has the width, pinned to the CPU file by `registerColumnWidth`
        //so that picking a tab never moves the memory panel beside it: the panel takes that width
        //whichever file it is showing, and the file lays out inside it
        width: 100%;
        min-width: 8.6rem;
        position: relative;
        flex: 1;
        //the rows scroll, the panel itself does not: that is what lets the tab strip run edge to
        //edge, since a scrollbar gutter reserved on the panel would hold it off the right side.
        //Hiding the overflow here is also what rounds the flush strip to the panel's own corners
        overflow: hidden;
        @media screen and (max-width: 1000px) {
            max-height: 33.7rem; //HOTFIX
        }
    }

    .registers-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
    }

    //a panel with no header is the single program-counter row the project page and the Playgrounds
    //put above the registers. It has nothing to scroll and no flush strip to round, and clipping it
    //would swallow the hover that reads its value out, so it clips nothing
    .withoutHeader,
    .withoutHeader .registers-scroll {
        overflow: visible;
    }

    ::-webkit-scrollbar {
        background-color: transparent !important;
    }

    //the scrollbar is taken out of the rows, so a panel with tabs keeps room for one whether the
    //visible file scrolls or not: the column is pinned to one width, and a short file such as CP0
    //would otherwise lay its rows out in the pixels a scrolling file gives up. `registerColumnWidth`
    //counts on this gutter being there. A language with a single file has no tab to pick
    .several-files .registers-scroll {
        scrollbar-gutter: stable;
    }

    //the tabs, the selectors and the flags row are above the scrolling region rather than sticky
    //inside it, so they keep their height whatever the file below them does
    .registers-top {
        flex-shrink: 0;
        background-color: var(--secondary);
    }

    //the tinted line under the tabs, holding what belongs to the file they picked: its Format, its
    //grouping, and for a language with one file the title that line has always carried
    .registers-header {
        display: flex;
        font-size: 0.9rem;
        padding: 0.2rem;
        gap: 0.3rem;
        align-items: center;
        justify-content: space-between;
        //a single file is the title and the grouping strip the panel has always shown on one line,
        //at a column that is only just wide enough for them, so that line is left alone
        flex-wrap: nowrap;
        row-gap: 0.2rem;
        background-color: var(--tertiary);
    }

    //with tabs the header carries no title, so the selectors have the line to themselves: each takes
    //the whole of one, stacked, because a Format strip and a grouping strip side by side are wider
    //than the register column and would be squeezed until their labels were clipped
    .several-files .header-selectors {
        flex: 1 0 100%;
        flex-direction: column;
        align-items: stretch;
        gap: 0.2rem;
    }

    .registers-title {
        padding-left: 0.2rem;
    }

    .header-selectors {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        //the selectors keep their own width and sit at the right end of their line, so a grouping
        //strip is never mistaken for a second row of tabs the way a stretched one was
        margin-left: auto;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .withoutHeader {
        padding-top: 0.3rem;
    }
</style>
