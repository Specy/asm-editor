<script lang="ts">
    /**
     * One memory value of a Testcase being written, in place of its row or under the table for a
     * new one: whether it is set before the run or expected after it, whether it is one number, a
     * run of numbers of one width or a string, and where it goes. Numbers are typed in hex or
     * decimal and echoed in the other base; a string takes `\n`-style escapes. A new value's empty
     * address and number are the 0 their placeholders show.
     */
    import { onMount, untrack } from 'svelte'
    import type { AvailableLanguages, MemoryValue } from '$lib/Project.svelte'
    import SegmentedControl from '$cmp/specific/project/cpu/SegmentedControl.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import {
        escapeText,
        formatHex,
        hexPrefix,
        isDecimalText,
        parseNumber,
        parseNumberList,
        unescapeText
    } from '$lib/testcases'
    import { WHEN_ICONS, type When } from './WhenLabel.svelte'

    interface Props {
        /** The value being changed, or nothing for a new one. */
        initial?: { when: When; value: MemoryValue }
        systemSize: number
        language: AvailableLanguages
        onSave: (when: When, value: MemoryValue) => void
        onCancel: () => void
        /** Removes the value being changed; a new one has nothing to remove. */
        onDelete?: () => void
    }

    let { initial, systemSize, language, onSave, onCancel, onDelete }: Props = $props()

    const id = $props.id()
    const prefix = $derived(hexPrefix(language))

    const WHEN_OPTIONS = [
        { id: 'start', label: 'Start', title: 'Set before the program starts' },
        { id: 'expect', label: 'Expect', title: 'Checked once the program has ended' }
    ].map((option) => ({
        ...option,
        icon: WHEN_ICONS[option.id as When].icon,
        iconColor: WHEN_ICONS[option.id as When].color
    }))

    const MODE_OPTIONS = [
        { id: 'number', label: 'Number', title: 'One number of the size picked' },
        {
            id: 'number-chunk',
            label: 'Chunks',
            title: 'Numbers of the size picked, one after another'
        },
        { id: 'string-chunk', label: 'String', title: 'Text, as UTF-8 bytes' }
    ]

    /** The form as it opens: the value's own fields, or a byte holding 0 at address 0. */
    function opening() {
        const value = initial?.value
        const hex = hexPrefix(language)
        const bytes = value && value.type !== 'string-chunk' ? value.bytes : 1
        let numbers = ''
        if (value?.type === 'number') numbers = formatHex(value.expected, { prefix: hex, bytes })
        if (value?.type === 'number-chunk') {
            numbers = value.expected
                .map((entry) => formatHex(entry, { prefix: hex, bytes }))
                .join(' ')
        }
        return {
            when: initial?.when ?? ('start' as When),
            mode: value?.type ?? ('number' as MemoryValue['type']),
            address: value ? formatHex(value.address, { prefix: hex, minDigits: 4 }) : '',
            bytes,
            numbers,
            text: value?.type === 'string-chunk' ? escapeText(value.expected) : ''
        }
    }

    const form = $state(untrack(opening))

    //the widths the Target reads memory at, and the one an existing value already has
    const sizes = $derived(
        [...new Set([1, 2, 4, 8].filter((size) => size <= systemSize).concat(form.bytes))]
            .sort((a, b) => a - b)
            .map((size) => ({ id: String(size), label: `${size}B` }))
    )

    const address = $derived(
        form.address.trim() === ''
            ? ({ ok: true, value: 0n } as const)
            : parseNumber(form.address, { bytes: systemSize, signed: false, prefix })
    )
    const number = $derived(
        form.numbers.trim() === ''
            ? ({ ok: true, value: 0n } as const)
            : parseNumber(form.numbers, { bytes: form.bytes, prefix })
    )
    const list = $derived(parseNumberList(form.numbers, { bytes: form.bytes, prefix }))
    const text = $derived.by(() => {
        if (form.text === '') return { ok: false, reason: 'the text is empty' } as const
        return unescapeText(form.text)
    })

    const addressError = $derived(address.ok ? undefined : address.reason)
    const valueError = $derived.by(() => {
        const parsed = form.mode === 'number' ? number : form.mode === 'number-chunk' ? list : text
        return parsed.ok ? undefined : parsed.reason
    })

    /** What was typed, read back the other way: the decimal of hex, the hex of decimal. */
    const echo = $derived.by(() => {
        if (valueError) return ''
        if (form.mode === 'string-chunk' && text.ok) {
            const length = new TextEncoder().encode(text.value).length
            return `= ${length} byte${length === 1 ? '' : 's'}`
        }
        if (form.mode === 'number-chunk' && list.ok) {
            return `= ${list.values.length} × ${form.bytes}B`
        }
        if (form.mode === 'number' && number.ok) {
            return form.numbers.trim() !== '' && isDecimalText(form.numbers)
                ? `= ${formatHex(number.value, { prefix, bytes: form.bytes })}`
                : `= ${BigInt.asUintN(form.bytes * 8, number.value)}`
        }
        return ''
    })

    function save() {
        if (!address.ok || valueError) return
        const at = address.value
        if (form.mode === 'number' && number.ok) {
            onSave(form.when, {
                type: 'number',
                address: at,
                bytes: form.bytes,
                expected: number.value
            })
        } else if (form.mode === 'number-chunk' && list.ok) {
            onSave(form.when, {
                type: 'number-chunk',
                address: at,
                bytes: form.bytes,
                expected: list.values
            })
        } else if (form.mode === 'string-chunk' && text.ok) {
            onSave(form.when, { type: 'string-chunk', address: at, expected: text.value })
        }
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            save()
        } else if (event.key === 'Escape') {
            //the panel's own Escape (restoring a maximized panel) is not for a form being written
            event.stopPropagation()
            onCancel()
        }
    }

    let addressInput: HTMLInputElement | undefined = $state()
    let valueInput: HTMLInputElement | undefined = $state()
    onMount(() => (initial ? valueInput : addressInput)?.focus())
</script>

<div class="memory-form" role="group" aria-label={initial ? 'Memory value' : 'New memory value'}>
    <div class="line">
        <SegmentedControl
            options={WHEN_OPTIONS}
            selected={form.when}
            onSelect={(when) => (form.when = when as When)}
        />
        <SegmentedControl
            options={MODE_OPTIONS}
            selected={form.mode}
            onSelect={(mode) => (form.mode = mode as MemoryValue['type'])}
            style="margin-left: auto"
        />
    </div>
    <div class="line">
        <label class="caption" for="{id}-address">At</label>
        <input
            id="{id}-address"
            class="field address"
            bind:this={addressInput}
            bind:value={form.address}
            placeholder="{prefix}0000"
            aria-invalid={addressError !== undefined}
            spellcheck="false"
            autocomplete="off"
            {onkeydown}
        />
        {#if form.mode !== 'string-chunk'}
            <span class="caption">size</span>
            <SegmentedControl
                options={sizes}
                selected={String(form.bytes)}
                onSelect={(size) => (form.bytes = Number(size))}
            />
        {/if}
    </div>
    {#if addressError}
        <p class="error">{addressError}</p>
    {/if}
    <div class="line">
        <label class="caption" for="{id}-value"
            >{form.mode === 'string-chunk' ? 'Text' : 'Value'}</label
        >
        {#if form.mode === 'string-chunk'}
            <input
                id="{id}-value"
                class="field value"
                bind:this={valueInput}
                bind:value={form.text}
                placeholder="hello\n"
                title="\n, \t, \r, \0 and \xHH write those characters, \\ a backslash"
                aria-invalid={valueError !== undefined}
                spellcheck="false"
                autocomplete="off"
                {onkeydown}
            />
        {:else}
            <input
                id="{id}-value"
                class="field value"
                bind:this={valueInput}
                bind:value={form.numbers}
                placeholder={form.mode === 'number'
                    ? formatHex(0n, { prefix, bytes: form.bytes })
                    : `${prefix}01 ${prefix}02 ${prefix}03`}
                title="Hex ({prefix}1F), binary (%101) or decimal (31)"
                aria-invalid={valueError !== undefined}
                spellcheck="false"
                autocomplete="off"
                {onkeydown}
            />
        {/if}
        {#if echo}
            <span class="echo">{echo}</span>
        {/if}
    </div>
    {#if valueError}
        <p class="error">{valueError}</p>
    {/if}
    <div class="actions">
        {#if onDelete}
            <button class="text-button delete" onclick={onDelete}>Delete</button>
        {/if}
        <span class="spacer"></span>
        <button class="text-button" onclick={onCancel}>Cancel</button>
        <Button
            style="padding: 0.35rem 0.95rem; font-size: 0.85rem; border-radius: 0.35rem"
            disabled={addressError !== undefined || valueError !== undefined}
            onClick={save}
        >
            Save
        </Button>
    </div>
</div>

<style lang="scss">
    @use './testcases.scss' as *;

    .memory-form {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 0.7rem 0.8rem;
        border-left: 3px solid var(--accent);
        background-color: var(--tc-form);
    }

    .line {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .caption {
        font-size: 0.82rem;
        color: var(--hint);
    }

    .field {
        @include field;
        @include mono;
        padding: 0.35rem 0.6rem;
        font-size: 0.85rem;

        &[aria-invalid='true'] {
            border-color: var(--tc-fail);
        }
    }

    .address {
        width: 7rem;
    }

    .value {
        flex: 1;
        min-width: 8rem;
    }

    .echo {
        @include mono;
        font-size: 0.8rem;
        color: var(--hint);
        white-space: nowrap;
    }

    .error {
        margin-top: -0.25rem;
        font-size: 0.78rem;
        color: var(--tc-fail);
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        margin-top: 0.15rem;
    }

    .spacer {
        flex: 1;
    }

    .text-button {
        @include text-button;
    }

    .delete:hover {
        color: var(--tc-fail);
    }
</style>
