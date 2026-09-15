<script lang="ts">
    import SegmentedControl from '$cmp/specific/project/cpu/SegmentedControl.svelte'
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

    /**
     * The B/W/L/D/Q grouping strip of the register panel: `SegmentedControl` with the sizes the
     * panel offers baked in, so the two strips the header shows side by side are the same control
     * and the same size.
     */
    interface Props {
        style?: string
        /** The size to draw as picked, which the caller owns: the control never writes it back. */
        selected?: RegisterSize
        maxSize: RegisterSize
        /**
         * The only way a pick leaves the control, so the caller stays the one place the grouping
         * lives: the Register file panel clamps it to the visible file, and what it shows here and
         * what it stores are therefore not always the same value.
         */
        onSelect: (size: RegisterSize) => void
    }

    let { maxSize, style = '', selected = RegisterSize.Word, onSelect }: Props = $props()

    const sizeMap = {
        [RegisterSize.Byte]: 'B',
        [RegisterSize.Word]: 'W',
        [RegisterSize.Long]: 'L',
        [RegisterSize.Double]: 'D',
        [RegisterSize.Quad]: 'Q'
    } satisfies Record<RegisterSize, string>

    //the option ids are the sizes written out, because a segmented control speaks in strings
    const options = $derived(
        [
            RegisterSize.Byte,
            RegisterSize.Word,
            RegisterSize.Long,
            RegisterSize.Double,
            RegisterSize.Quad
        ]
            .filter((size) => size <= maxSize)
            .map((size) => ({ id: String(size), label: sizeMap[size] }))
    )
</script>

<SegmentedControl
    {options}
    {style}
    selected={String(selected)}
    onSelect={(id) => onSelect(Number(id) as RegisterSize)}
/>
