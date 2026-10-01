<script lang="ts">
    /**
     * A value of a Testcase typed in place, in hex (`$1F`, `0x1F`), binary or decimal, and shown in
     * the Target's hex at `bytes` wide. Enter or leaving the cell keeps what was typed; text that is
     * not a number stays in the cell, outlined in red and not kept, until it is fixed or Escape puts
     * the value back. Emptying the cell removes the value.
     */
    import { formatHex, parseNumber } from '$lib/testcases'

    interface Props {
        value: bigint | undefined
        /** The width the value has to fit and is shown at. */
        bytes: number
        prefix: string
        minDigits?: number
        /** What the cell is, for a screen reader. */
        label: string
        disabled?: boolean
        /** Why the cell is disabled, as its tooltip. */
        disabledTitle?: string
        onCommit: (value: bigint | undefined) => void
    }

    let {
        value,
        bytes,
        prefix,
        minDigits = 4,
        label,
        disabled = false,
        disabledTitle = '',
        onCommit
    }: Props = $props()

    /** What is being typed, or null while the cell shows the value itself. */
    let draft = $state<string | null>(null)
    const shown = $derived(
        value === undefined ? '' : formatHex(value, { prefix, bytes, minDigits })
    )
    const parsed = $derived(
        draft === null || draft.trim() === '' ? undefined : parseNumber(draft, { bytes, prefix })
    )
    const error = $derived(parsed && !parsed.ok ? parsed.reason : undefined)

    /** Both readings of the value, which is what the hex in the cell does not say. */
    function decimals(value: bigint) {
        const bits = bytes * 8
        const unsigned = BigInt.asUintN(bits, value)
        const signed = BigInt.asIntN(bits, value)
        return signed === unsigned ? `${unsigned}` : `${unsigned} or ${signed}`
    }

    const title = $derived.by(() => {
        if (error) return error
        if (disabled) return disabledTitle
        if (value === undefined) return ''
        return `${decimals(value)} in decimal`
    })

    function commit() {
        if (draft === null) return
        if (draft.trim() === '') {
            if (value !== undefined) onCommit(undefined)
            draft = null
            return
        }
        const result = parseNumber(draft, { bytes, prefix })
        if (!result.ok) return
        if (result.value !== value) onCommit(result.value)
        draft = null
    }
</script>

<input
    class="number-cell"
    value={draft ?? shown}
    placeholder="—"
    {disabled}
    {title}
    aria-label={label}
    aria-invalid={error !== undefined}
    spellcheck="false"
    autocomplete="off"
    oninput={(e) => (draft = e.currentTarget.value)}
    onfocus={(e) => e.currentTarget.select()}
    onblur={commit}
    onkeydown={(e) => {
        if (e.key === 'Enter') {
            commit()
            if (draft === null) e.currentTarget.blur()
        } else if (e.key === 'Escape') {
            //the panel's own Escape (restoring a maximized panel) is not for a cell being edited
            e.stopPropagation()
            draft = null
            e.currentTarget.blur()
        }
    }}
/>

<style lang="scss">
    @use './testcases.scss' as *;

    .number-cell {
        @include mono;
        width: 100%;
        height: 100%;
        padding: 0.45rem 0.7rem;
        font-size: 0.85rem;
        background-color: transparent;
        color: var(--secondary-text);
        text-overflow: ellipsis;
        transition: background-color 0.15s;

        &::placeholder {
            color: var(--hint);
            opacity: 0.6;
        }

        &:hover:not(:disabled) {
            background-color: var(--tc-hover);
        }

        &:focus {
            background-color: var(--tc-field);
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent);
        }

        &[aria-invalid='true'] {
            color: var(--tc-fail);
            background-color: var(--tc-fail-bg);
            box-shadow: inset 0 0 0 1px var(--tc-fail);
        }

        &:disabled {
            cursor: not-allowed;
        }
    }
</style>
