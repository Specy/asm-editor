<script lang="ts">
    import SegmentedControl from '$cmp/specific/project/cpu/SegmentedControl.svelte'
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import { REGISTER_SIZES, sizeName } from '$lib/languages/sizeNames'

    /**
     * The width grouping strip of the register panel: `SegmentedControl` with the sizes the panel
     * offers baked in, so the two strips the header shows side by side are the same control and the
     * same size.
     *
     * Each button is named as the Target names that width (`sizeNames.ts`): the same two bytes are
     * a `W` to a 68000 reader and an `H` to a MIPS one, and a strip that called it `W` to both
     * would be teaching one of them the wrong word. The width itself never changes — only the name
     * on the button — so a picked size still means the same grouping in every language.
     */
    interface Props {
        style?: string
        /** The size to draw as picked, which the caller owns: the control never writes it back. */
        selected?: RegisterSize
        maxSize: RegisterSize
        /** The Target whose names the buttons carry. */
        language: AvailableLanguages
        /**
         * The only way a pick leaves the control, so the caller stays the one place the grouping
         * lives: the Register file panel clamps it to the visible file, and what it shows here and
         * what it stores are therefore not always the same value.
         */
        onSelect: (size: RegisterSize) => void
    }

    let { maxSize, language, style = '', selected = RegisterSize.Word, onSelect }: Props = $props()

    //the option ids are the sizes written out, because a segmented control speaks in strings, and
    //the written-out name is the tooltip: one letter is not enough to tell `Dword` from `Doubleword`
    const options = $derived(
        REGISTER_SIZES.filter((size) => size <= maxSize).map((size) => {
            const name = sizeName(size, language)
            return { id: String(size), label: name.short, title: name.long }
        })
    )
</script>

<SegmentedControl
    {options}
    {style}
    selected={String(selected)}
    onSelect={(id) => onSelect(Number(id) as RegisterSize)}
/>
