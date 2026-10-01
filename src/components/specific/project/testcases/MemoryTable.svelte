<script lang="ts">
    /**
     * The memory of a Testcase as one table: the values set before the run, then the values
     * expected after it, each marked by its side. A row opens in place into `MemoryValueForm`, and
     * an expected value the last test run found wrong says what was there instead.
     */
    import type {
        AvailableLanguages,
        MemoryValue,
        Testcase,
        TestcaseResult,
        TestcaseValidationError
    } from '$lib/Project.svelte'
    import {
        escapeText,
        firstByteDifference,
        formatHex,
        hexPrefix,
        memoryValueLength
    } from '$lib/testcases'
    import MemoryValueForm from './MemoryValueForm.svelte'
    import WhenLabel, { type When } from './WhenLabel.svelte'

    interface Props {
        testcase: Testcase
        result: TestcaseResult | undefined
        editable: boolean
        systemSize: number
        language: AvailableLanguages
    }

    let { testcase = $bindable(), result, editable, systemSize, language }: Props = $props()

    const prefix = $derived(hexPrefix(language))
    /** The row open in the form, or `new` for the form under the table. */
    let editing = $state<{ when: When; index: number } | 'new' | null>(null)

    const rows = $derived([
        ...testcase.startingMemory.map((value, index) => ({
            when: 'start' as const,
            index,
            value
        })),
        ...testcase.expectedMemory.map((value, index) => ({
            when: 'expect' as const,
            index,
            value
        }))
    ])

    function listOf(when: When) {
        return when === 'start' ? 'startingMemory' : 'expectedMemory'
    }

    function save(when: When, value: MemoryValue) {
        const from = editing
        if (from === 'new') {
            testcase[listOf(when)].push(value)
        } else if (from && from.when === when) {
            testcase[listOf(when)][from.index] = value
        } else if (from) {
            //a value moved to the other side goes to the end of it
            testcase[listOf(from.when)].splice(from.index, 1)
            testcase[listOf(when)].push(value)
        }
        editing = null
    }

    function remove(when: When, index: number) {
        testcase[listOf(when)].splice(index, 1)
        editing = null
    }

    type MemoryError = Extract<TestcaseValidationError, { index: number }>

    function errorOf(when: When, index: number): MemoryError | undefined {
        if (!result || when !== 'expect') return undefined
        return result.errors.find(
            (error): error is MemoryError => 'index' in error && error.index === index
        )
    }

    /** What kind of value it is, and how many bytes of what width it covers. */
    function modeOf(value: MemoryValue) {
        if (value.type === 'number') return { kind: 'Number', size: `${value.bytes}B` }
        if (value.type === 'number-chunk') {
            return { kind: 'Chunks', size: `${value.expected.length}×${value.bytes}B` }
        }
        return { kind: 'String', size: `${memoryValueLength(value)}B` }
    }

    function valueOf(value: MemoryValue) {
        if (value.type === 'number') {
            return formatHex(value.expected, { prefix, bytes: value.bytes })
        }
        if (value.type === 'number-chunk') {
            return value.expected
                .map((entry) => formatHex(entry, { prefix, bytes: value.bytes }))
                .join(' ')
        }
        return `"${escapeText(value.expected)}"`
    }

    /** What the run found instead, as briefly as the cell has room for. */
    function gotOf(error: MemoryError) {
        if (error.type === 'wrong-memory-number') {
            return `got ${formatHex(error.got, { prefix, bytes: error.bytes })}`
        }
        if (error.type === 'wrong-memory-string') return `got "${escapeText(error.got)}"`
        const difference = firstByteDifference(error.expected, error.got)
        if (!difference) return 'got something else'
        const byte =
            difference.got === undefined
                ? 'nothing'
                : formatHex(BigInt(difference.got), { prefix, bytes: 1 })
        const more = difference.count > 1 ? `, ${difference.count - 1} more` : ''
        return `got ${byte} at +${difference.offset}${more}`
    }
</script>

{#snippet cells(when: When, value: MemoryValue, error: MemoryError | undefined)}
    {@const mode = modeOf(value)}
    <span class="cell when"><WhenLabel {when} /></span>
    <span class="cell mono">{formatHex(value.address, { prefix, minDigits: 4 })}</span>
    <!-- the space reads between the two in the text, and the gap draws it between them -->
    <span class="cell mode">{mode.kind} <span>• {mode.size}</span></span>
    <span class="cell value" class:mismatch={error}>
        <span class="mono" class:string={value.type === 'string-chunk'}>{valueOf(value)}</span>
        {#if error}
            <span class="got">{gotOf(error)}</span>
        {:else if result && when === 'expect'}
            <span class="as-expected" title="As expected">✓</span>
        {/if}
    </span>
{/snippet}

<div class="memory">
    <div class="row head" aria-hidden="true">
        <span class="cell">When</span>
        <span class="cell">Address</span>
        <span class="cell">Mode</span>
        <span class="cell">Value</span>
    </div>
    {#each rows as row (`${row.when}-${row.index}`)}
        {@const error = errorOf(row.when, row.index)}
        {#if editing !== null && editing !== 'new' && editing.when === row.when && editing.index === row.index}
            <div class="form-row">
                <MemoryValueForm
                    initial={{ when: row.when, value: row.value }}
                    {systemSize}
                    {language}
                    onSave={save}
                    onCancel={() => (editing = null)}
                    onDelete={() => remove(row.when, row.index)}
                />
            </div>
        {:else if editable}
            <button
                class="row"
                title="Change this value"
                onclick={() => (editing = { when: row.when, index: row.index })}
            >
                {@render cells(row.when, row.value, error)}
            </button>
        {:else}
            <div class="row">
                {@render cells(row.when, row.value, error)}
            </div>
        {/if}
    {/each}
    {#if editing === 'new'}
        <div class="form-row">
            <MemoryValueForm
                {systemSize}
                {language}
                onSave={save}
                onCancel={() => (editing = null)}
            />
        </div>
    {/if}
    {#if editable}
        <button class="add-row" onclick={() => (editing = 'new')}>+ Add memory value</button>
    {/if}
</div>

<style lang="scss">
    @use './testcases.scss' as *;

    // one grid whose rows share its columns, so every row lines up while each stays one box that
    // can be clicked and focused. In a narrow panel the mode puts its size on a second line before
    // the value gives up any more room
    .memory {
        @include frame;
        display: grid;
        grid-template-columns:
            max-content max-content minmax(min-content, max-content)
            minmax(6rem, 1fr);
        font-size: 0.85rem;
    }

    .row {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        align-items: stretch;
        text-align: left;
        font: inherit;
        color: var(--secondary-text);
        background-color: transparent;

        &:not(.head) {
            border-top: 1px solid var(--tc-line);
        }
    }

    button.row {
        cursor: pointer;
        transition: background-color 0.15s;

        &:hover,
        &:focus-visible {
            background-color: var(--tc-hover);
        }
    }

    .head {
        @include head;
    }

    .cell {
        display: flex;
        align-items: center;
        padding: 0.45rem 0.7rem;
        min-width: 0;

        &:not(:first-child) {
            border-left: 1px solid var(--tc-line);
        }
    }

    .head .cell {
        padding: 0.4rem 0.7rem;
    }

    .when,
    .mode {
        color: var(--hint);
        white-space: nowrap;
    }

    .mode {
        flex-wrap: wrap;
        column-gap: 0.3em;
    }

    .mono {
        @include mono;
    }

    .value {
        flex-wrap: wrap;
        gap: 0.2rem 0.6rem;
        overflow-wrap: anywhere;

        &.mismatch {
            background-color: var(--tc-fail-bg);

            .mono {
                color: var(--tc-fail);
            }
        }
    }

    .string {
        color: var(--tc-string);
    }

    .got {
        font-size: 0.78rem;
        color: var(--tc-fail);
    }

    .as-expected {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--tc-pass);
    }

    .form-row {
        grid-column: 1 / -1;
        border-top: 1px solid var(--tc-line);
    }

    .add-row {
        @include add-row;
        grid-column: 1 / -1;
        border-top: 1px solid var(--tc-line);
    }
</style>
